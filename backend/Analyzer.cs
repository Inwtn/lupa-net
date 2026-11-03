// Lupa.NET: only file-backed PE metadata and static decompilation of targets.
using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Collections.Immutable;
using System.Reflection.Metadata;
using System.Reflection.Metadata.Ecma335;
using System.Reflection.PortableExecutable;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ICSharpCode.Decompiler;
using ICSharpCode.Decompiler.CSharp;
using ICSharpCode.Decompiler.Disassembler;
using ICSharpCode.Decompiler.Metadata;

namespace Lupa;

// Resolution is restricted to the trusted runtime directory. Uploaded neighbors,
// NuGet, PDB downloads, native libraries and paths embedded in targets are not used.
public sealed class RuntimeOnlyResolver : IAssemblyResolver, IDisposable
{
    private readonly string root = RuntimeEnvironment.GetRuntimeDirectory();
    private readonly Dictionary<string, PEFile> files = new(StringComparer.OrdinalIgnoreCase);
    public readonly HashSet<string> Missing = new(StringComparer.OrdinalIgnoreCase);
    public MetadataFile Resolve(IAssemblyReference reference)
    {
        string name = reference.Name;
        if (name.IndexOfAny(new[]{'/', '\\', ':', '\0'}) >= 0 || name != Path.GetFileName(name)) return null;
        if (files.TryGetValue(name, out var cached)) return cached;
        string file = Path.Combine(root, name + ".dll");
        if (!File.Exists(file)) { Missing.Add(name); return null; }
        try { var pe = new PEFile(file, PEStreamOptions.PrefetchEntireImage); files.Add(name, pe); return pe; }
        catch (BadImageFormatException) { Missing.Add(name); return null; }
    }
    public MetadataFile ResolveModule(MetadataFile mainModule, string moduleName) => null;
    public Task<MetadataFile> ResolveAsync(IAssemblyReference reference) => Task.FromResult(Resolve(reference));
    public Task<MetadataFile> ResolveModuleAsync(MetadataFile mainModule, string moduleName) => Task.FromResult<MetadataFile>(null);
    public IDisposable BeginSnapshot() => null;
    public void Dispose() { foreach (var pe in files.Values) pe.Dispose(); }
}

public sealed class SignatureNames : ISignatureTypeProvider<string, object>
{
    public string GetArrayType(string e, ArrayShape s) => e + "[" + new string(',', Math.Min(31, Math.Max(0, s.Rank-1))) + "]";
    public string GetByReferenceType(string e) => "ref " + e;
    public string GetFunctionPointerType(MethodSignature<string> s) => "delegate*<" + string.Join(", ", s.ParameterTypes.Append(s.ReturnType)) + ">";
    public string GetGenericInstantiation(string g, ImmutableArray<string> a) => g + "<" + string.Join(", ", a) + ">";
    public string GetGenericMethodParameter(object c, int i) => "!!" + i;
    public string GetGenericTypeParameter(object c, int i) => "!" + i;
    public string GetModifiedType(string m, string u, bool required) => u;
    public string GetPinnedType(string e) => e;
    public string GetPointerType(string e) => e + "*";
    public string GetPrimitiveType(PrimitiveTypeCode c) => c.ToString();
    public string GetSZArrayType(string e) => e + "[]";
    public string GetTypeFromDefinition(MetadataReader r, TypeDefinitionHandle h, byte k) => r.GetString(r.GetTypeDefinition(h).Name);
    public string GetTypeFromReference(MetadataReader r, TypeReferenceHandle h, byte k) => r.GetString(r.GetTypeReference(h).Name);
    public string GetTypeFromSpecification(MetadataReader r, object c, TypeSpecificationHandle h, byte k) => r.GetTypeSpecification(h).DecodeSignature(this, c);
}

public static class Analyzer
{
    private static readonly JsonSerializerOptions Json = new() { WriteIndented = false };
    private static string Token(EntityHandle h) => "0x" + MetadataTokens.GetToken(h).ToString("x8");
    private static string TypeName(MetadataReader r, TypeDefinitionHandle h, int depth = 0)
    {
        if (depth > 32) throw new BadImageFormatException("Nested types exceed the depth limit.");
        var t = r.GetTypeDefinition(h); var parent = t.GetDeclaringType();
        if (!parent.IsNil) return TypeName(r, parent, depth + 1) + "+" + r.GetString(t.Name);
        string ns = r.GetString(t.Namespace);
        return (ns.Length == 0 ? "" : ns + ".") + r.GetString(t.Name);
    }
    public static void Run(string input, string output, string mode, string token, string language)
    {
        try
        {
            if (new FileInfo(input).Length > 32 * 1024 * 1024) throw new InvalidDataException("The 32 MiB limit was exceeded.");
            using var pe = new PEFile(input, PEStreamOptions.PrefetchEntireImage);
            var r = pe.Metadata;
            if (!r.IsAssembly) throw new BadImageFormatException("The file does not contain a supported .NET assembly.");
            object result = mode == "code" ? Code(pe, token, language) : Inspect(pe, input);
            File.WriteAllText(output, JsonSerializer.Serialize(result, Json));
        }
        catch (Exception ex)
        {
            File.WriteAllText(output, JsonSerializer.Serialize(new { error = "Analysis failed: " + ex.Message, kind = ex.GetType().Name }, Json));
        }
    }
    private static object Inspect(PEFile pe, string input)
    {
        var r = pe.Metadata; var a = r.GetAssemblyDefinition(); var module = r.GetModuleDefinition();
        var warnings = new List<string>();
        var types = new List<object>(); int methodCount = 0; var provider = new SignatureNames();
        foreach (var h in r.TypeDefinitions)
        {
            if (types.Count >= 10000) { warnings.Add("The tree is limited to 10,000 types."); break; }
            var t = r.GetTypeDefinition(h); var methods = new List<object>();
            foreach (var mh in t.GetMethods())
            {
                if (++methodCount > 100000) { warnings.Add("The tree is limited to 100,000 methods."); break; }
                var m = r.GetMethodDefinition(mh); string name = r.GetString(m.Name); string signature;
                try { var s = m.DecodeSignature(provider, null); signature = s.ReturnType + " " + name + "(" + string.Join(", ", s.ParameterTypes) + ")"; }
                catch (Exception ex) when (ex is BadImageFormatException || ex is InvalidOperationException) { signature = name + " (signature unavailable)"; }
                methods.Add(new { token = Token(mh), name, signature, hasBody = m.RelativeVirtualAddress != 0 });
            }
            types.Add(new { token = Token(h), name = r.GetString(t.Name), @namespace = r.GetString(t.Namespace), fullName = TypeName(r, h), methods });
            if (methodCount > 100000) break;
        }
        var references = r.AssemblyReferences.Select(h => { var v = r.GetAssemblyReference(h); return new { name = r.GetString(v.Name), version = v.Version.ToString() }; }).ToArray();
        var strings = new List<object>(); int textBudget = 0;
        var sh = MetadataTokens.UserStringHandle(1);
        while (!sh.IsNil && MetadataTokens.GetHeapOffset(sh) < r.GetHeapSize(HeapIndex.UserString))
        {
            if (strings.Count >= 10000 || textBudget >= 2000000) { warnings.Add("Strings are limited to 10,000 entries or 2 million characters."); break; }
            string value = r.GetUserString(sh);
            var next = r.GetNextHandle(sh); if (next == sh) break;
            // Zero-length padding bytes are not empty user-string records (which occupy 2+ bytes).
            if (value.Length == 0 && (next.IsNil || MetadataTokens.GetHeapOffset(next) - MetadataTokens.GetHeapOffset(sh) <= 1)) break;
            bool truncated = value.Length > 4096;
            if (truncated) value = value.Substring(0, 4096);
            textBudget += value.Length;
            strings.Add(new { token = "0x" + MetadataTokens.GetToken(sh).ToString("x8"), value, truncated });
            sh = next;
        }
        var flags = pe.Reader.PEHeaders.CorHeader.Flags;
        string architecture = pe.Reader.PEHeaders.CoffHeader.Machine.ToString();
        if (architecture == "I386") architecture = flags.HasFlag(CorFlags.Requires32Bit) ? "x86" : "AnyCPU";
        if (!flags.HasFlag(CorFlags.ILOnly)) warnings.Add("Native or mixed-mode assembly: C# and IL do not cover native instructions.");
        warnings.Add("Static analysis: the file was not executed. Strings do not prove behavior or traffic.");
        return new { assemblyName = r.GetString(a.Name), version = a.Version.ToString(), architecture, framework = pe.DetectTargetFrameworkId(), mvid = r.GetGuid(module.Mvid).ToString(), types, references, strings, warnings };
    }
    private static object Code(PEFile pe, string token, string language)
    {
        if (token == null || !System.Text.RegularExpressions.Regex.IsMatch(token, "^0x(06|02)[0-9a-fA-F]{6}$")) throw new InvalidDataException("Invalid method or type token.");
        var h = MetadataTokens.EntityHandle(Convert.ToInt32(token.Substring(2), 16));
        var r = pe.Metadata;
        if (h.Kind == HandleKind.MethodDefinition) r.GetMethodDefinition((MethodDefinitionHandle)h);
        else r.GetTypeDefinition((TypeDefinitionHandle)h);
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var warnings = new List<string>(); string code;
        if (language == "il")
        {
            using var writer = new StringWriter();
            var dis = new ReflectionDisassembler(new PlainTextOutput(writer), cts.Token);
            if (h.Kind == HandleKind.MethodDefinition) dis.DisassembleMethod(pe, (MethodDefinitionHandle)h);
            else dis.DisassembleType(pe, (TypeDefinitionHandle)h);
            code = writer.ToString();
        }
        else
        {
            using var resolver = new RuntimeOnlyResolver();
            var settings = new DecompilerSettings { ThrowOnAssemblyResolveErrors = false };
            var decompiler = new CSharpDecompiler(pe, resolver, settings) { CancellationToken = cts.Token };
            code = decompiler.DecompileAsString(h);
            if (resolver.Missing.Count > 0) warnings.Add("Unresolved references: " + string.Join(", ", resolver.Missing.Take(20)) + ". C# output may be incomplete.");
            warnings.Add("C# reconstructed by ILSpy; names and structure may differ from the original source.");
        }
        if (code.Length > 2000000) throw new InvalidDataException("Code exceeds the display limit of 2 million characters.");
        return new { code, language, token, warnings };
    }
}
