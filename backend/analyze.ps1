param(
    [Parameter(Mandatory)][string]$InputPath,
    [Parameter(Mandatory)][string]$OutputPath,
    [ValidateSet('inspect','code')][string]$Mode = 'inspect',
    [string]$Token = '',
    [ValidateSet('cs','il')][string]$Language = 'cs'
)
$ErrorActionPreference = 'Stop'
$engineDll = Join-Path $PSScriptRoot '..\vendor\ilspy-11.1.0.9782\lib\netstandard2.0\ICSharpCode.Decompiler.dll'
$expectedHash = '38e6abf7497845d79d9d01d56351a3203991356de1d3496b8c51142f495e9f9c'
if ((Get-FileHash -LiteralPath $engineDll -Algorithm SHA256).Hash -ne $expectedHash) { throw 'The ILSpy engine hash does not match the verified package.' }
# This loads only the trusted analysis engine and our worker, never the target.
Add-Type -Path $engineDll
$compilerReferences = @((Get-ChildItem -LiteralPath (Join-Path $PSHOME 'ref') -Filter '*.dll').FullName) + @($engineDll)
# PowerShell 7.6 supplies Metadata/Immutable 10; ILSpy targets their compatible v9 APIs.
Add-Type -Path (Join-Path $PSScriptRoot 'Analyzer.cs') -ReferencedAssemblies $compilerReferences -CompilerOptions '/nowarn:1701,1702'
[Lupa.Analyzer]::Run($InputPath, $OutputPath, $Mode, $Token, $Language)
