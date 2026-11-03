# Engine provenance

Lupa.NET integrates the official `ICSharpCode.Decompiler` NuGet package, version **11.1.0.9782**. The included files are unchanged third-party artifacts.

| Artifact | SHA-256 |
| --- | --- |
| `vendor/icsharpcode.decompiler.11.1.0.9782.nupkg` | `1f76df4d35193ba4eeb50ffcd84eae381a2c48c67f95c1104dc406759448a811` |
| `vendor/ilspy-11.1.0.9782/lib/netstandard2.0/ICSharpCode.Decompiler.dll` | `38e6abf7497845d79d9d01d56351a3203991356de1d3496b8c51142f495e9f9c` |

Package source: [official NuGet flat-container artifact](https://api.nuget.org/v3-flatcontainer/icsharpcode.decompiler/11.1.0.9782/icsharpcode.decompiler.11.1.0.9782.nupkg). Upstream source: [icsharpcode/ILSpy](https://github.com/icsharpcode/ILSpy).

## Static inspection with REA

On October 26, 2026, REA inspected the compiled engine's metadata without executing that artifact as part of the inspection. Observed properties:

- Size: 3,121,152 bytes.
- MVID: `ea06cf8a-bb7b-4f88-8570-039d0eef58f0`.
- Managed CIL, AnyCPU, `.NETStandard,Version=v2.0`.
- Metadata tables: 1,662 types and 16,259 methods.
- A focused inventory found `CSharpDecompiler`, `ReflectionDisassembler`, and `IAssemblyResolver`, with 182 declared methods across those three selected types.

This was inspection of the trusted dependency, not malware execution or a security audit. The application subsequently loads that engine as trusted code to analyze inputs. Raw workstation-specific REA records are excluded from the public repository.

## Source and package versions

The package's `.nuspec` identifies source commit `a6909b2e1062d2404a52711926fa74030bd96119`. A separate architecture review consulted upstream commit `c86190ef4e24f3137c13a9275316042842d2fada`. Those are different snapshots. The worker is compiled and tested against the pinned DLL, not built from that later checkout.

The integration uses `PEFile`, `MetadataReader`, `CSharpDecompiler`, `ReflectionDisassembler`, and a custom `IAssemblyResolver`. The complete ILSpy desktop UI is not redistributed. Preserve the bundled ILSpy and Humanizer license notices when redistributing these dependencies.
