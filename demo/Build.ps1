$ErrorActionPreference = 'Stop'
$outputFile = Join-Path $PSScriptRoot 'Demo.dll'
if (Test-Path -LiteralPath $outputFile) { throw 'Demo.dll already exists. Preserve it or choose a fresh checkout before rebuilding.' }
# Compile only the checked-in harmless fixture, never a file supplied for analysis.
Add-Type -Path (Join-Path $PSScriptRoot 'Demo.cs') -OutputAssembly $outputFile -OutputType Library
Write-Output 'Built the harmless demonstration assembly; no methods were invoked.'
