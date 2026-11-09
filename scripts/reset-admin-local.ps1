$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$api = Join-Path $root 'apps\api'
if (-not (Test-Path (Join-Path $api '.env'))) {
  throw 'apps/api/.env not found. Configure the database connection first.'
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js was not found in PATH.'
}
$secure = Read-Host 'New administrator password (at least 12 characters)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  if (-not $plain -or $plain.Length -lt 12) { throw 'Password must contain at least 12 characters.' }
  $env:TASKBOARD_NEW_ADMIN_PASSWORD = $plain
  $plain = $null
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
try {
  Push-Location $api
  try {
    & node --env-file=.env --import tsx prisma/reset-admin.ts
    if ($LASTEXITCODE -ne 0) { throw 'Password reset failed. Review the error above.' }
  } finally {
    Pop-Location
  }
} finally {
  Remove-Item Env:\TASKBOARD_NEW_ADMIN_PASSWORD -ErrorAction SilentlyContinue
}
