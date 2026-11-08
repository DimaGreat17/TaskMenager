$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not (Test-Path (Join-Path $root 'apps\api\.env'))) { throw 'Run scripts\setup-local.ps1 first.' }
Start-Process cmd.exe -WorkingDirectory $root -ArgumentList '/k','npm run dev:api'
Start-Process cmd.exe -WorkingDirectory $root -ArgumentList '/k','npm run dev:web'
Write-Host 'Browser: http://localhost:5173'
Write-Host 'API check: http://localhost:3001/api/health'
Write-Host 'Stop both servers with Ctrl+C in their windows.'
