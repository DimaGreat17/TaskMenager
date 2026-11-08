$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22+ first.' }
if ([int]((node -v).TrimStart('v').Split('.')[0]) -lt 22) { throw 'Node.js 22+ is required.' }
$envFile = Join-Path $root 'apps\api\.env'
if (-not (Test-Path $envFile)) {
  $dbUser = Read-Host 'PostgreSQL username [postgres]'
  if (-not $dbUser) { $dbUser='postgres' }
  $secure = Read-Host 'PostgreSQL password' -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $dbPass = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  if (-not $dbPass) { throw 'PostgreSQL password cannot be empty.' }
  $bytes = New-Object byte[] 20
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes); $rng.Dispose()
  $adminPass = -join ($bytes | ForEach-Object { $_.ToString('x2') })
  $connection = 'postgresql://'+[uri]::EscapeDataString($dbUser)+':'+[uri]::EscapeDataString($dbPass)+'@127.0.0.1:5432/taskboard?schema=public'
  $contents = @("DATABASE_URL=$connection",'ADMIN_USERNAME=admin',"ADMIN_PASSWORD=$adminPass",'WEB_ORIGIN=http://localhost:5173','HOST=127.0.0.1','PORT=3001')
  [IO.File]::WriteAllLines($envFile,$contents,[Text.UTF8Encoding]::new($false))
  Write-Host "Initial administrator login: admin" -ForegroundColor Yellow
  Write-Host "Initial password is stored in apps/api/.env as ADMIN_PASSWORD. Do not publish or commit this file."
} else { Write-Host 'Existing apps/api/.env retained.' }
$psql = (Get-Command psql -ErrorAction SilentlyContinue).Source
if (-not $psql) {
  $pgPath = Join-Path $env:ProgramFiles 'PostgreSQL'
  $exe = Get-ChildItem $pgPath -Filter psql.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($exe) { $psql=$exe.FullName }
}
if (-not $psql) { throw 'psql.exe not found. Install PostgreSQL command line tools, then rerun setup.' }
$uriLine=Get-Content $envFile | Where-Object { $_.StartsWith('DATABASE_URL=') } | Select-Object -First 1
$u=[uri]($uriLine.Substring(13).Replace('?schema=public',''))
$parts=$u.UserInfo.Split(':',2)
$env:PGPASSWORD=[uri]::UnescapeDataString($parts[1])
try {
  $dbUser=[uri]::UnescapeDataString($parts[0])
  $result = & $psql -h 127.0.0.1 -p 5432 -U $dbUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='taskboard';"
  if ($LASTEXITCODE -ne 0) { throw 'Unable to connect to PostgreSQL. Check that the PostgreSQL service is running, port 5432 is open and credentials in apps/api/.env are correct.' }
  # psql produces no rows when taskboard does not exist. In PowerShell this is $null.
  $found = @($result | Where-Object { $_ -ne $null -and $_.ToString().Trim() -eq '1' }).Count -gt 0
  if (-not $found) {
    & $psql -h 127.0.0.1 -p 5432 -U $dbUser -d postgres -c 'CREATE DATABASE taskboard;'
    if ($LASTEXITCODE -ne 0) { throw 'Cannot create database: use a PostgreSQL user with CREATEDB or create taskboard via pgAdmin.' }
    Write-Host 'Database taskboard created.' -ForegroundColor Green
  }
} finally { Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue }
npm install
if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
npm run db:generate -w @taskboard/api
if ($LASTEXITCODE -ne 0) { throw 'Prisma generate failed' }
npm run db:migrate -w @taskboard/api
if ($LASTEXITCODE -ne 0) { throw 'Prisma migration failed' }
npm run db:seed:local -w @taskboard/api
if ($LASTEXITCODE -ne 0) { throw 'Admin creation failed' }
Write-Host 'Setup complete. Run scripts\start-local.ps1.' -ForegroundColor Green
