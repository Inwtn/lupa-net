$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion -lt [version]'7.5') { throw 'Use PowerShell 7.5 or later to start Lupa.NET.' }
$env:LUPA_PWSH = Join-Path $PSHOME 'pwsh.exe'
if (-not (Test-Path -LiteralPath $env:LUPA_PWSH)) { $env:LUPA_PWSH = Join-Path $PSHOME 'pwsh' }
Push-Location $PSScriptRoot
try { node (Join-Path $PSScriptRoot 'server.cjs') }
finally { Pop-Location }
