# start-usaco-ide.ps1 — USACO IDE 2.0 launcher (PowerShell)
# Run: right-click -> "Run with PowerShell", or:  powershell -ExecutionPolicy Bypass -File start-usaco-ide.ps1

$ErrorActionPreference = "Stop"
$Port = if ($env:USACO_IDE_PORT) { [int]$env:USACO_IDE_PORT } else { 5050 }
$Url  = "http://127.0.0.1:$Port"
$BackendDir = Join-Path $PSScriptRoot "..\backend"

function Write-Step($tag, $msg, $color = "Cyan") {
  Write-Host ("[{0}] {1}" -f $tag, $msg) -ForegroundColor $color
}

Write-Host "==================================================" -ForegroundColor DarkCyan
Write-Host "   USACO IDE 2.0  -  Launcher" -ForegroundColor White
Write-Host "==================================================" -ForegroundColor DarkCyan

# 1. Node.js present and recent enough?
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Step "ERROR" "Khong tim thay Node.js. Cai Node.js LTS tu https://nodejs.org roi chay lai." "Red"
  Read-Host "Nhan Enter de thoat"
  exit 1
}
$nodeMajor = [int]((node -v) -replace '^v' -split '\.')[0]
if ($nodeMajor -lt 18) {
  Write-Step "ERROR" "Node.js qua cu (can >= 18, dang co: $nodeMajor). Cap nhat tai https://nodejs.org." "Red"
  Read-Host "Nhan Enter de thoat"
  exit 1
}

Set-Location $BackendDir

# Returns "ours" when OUR backend answers on the port, "other" when something
# else answers / holds the port, "free" when nothing is listening.
function Get-PortState {
  try {
    $res = Invoke-WebRequest -Uri "$Url/api/health" -UseBasicParsing -TimeoutSec 2
    if ($res.Content -match "USACO IDE") { return "ours" }
    return "other"
  } catch {
    $listening = $false
    try {
      $listening = [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop)
    } catch {}
    if ($listening) { return "other" }
    return "free"
  }
}

# 2. Port already in use?
switch (Get-PortState) {
  "ours" {
    Write-Step "OK" "Backend da chay san tren cong $Port. Chi mo trinh duyet."
    Start-Process $Url
    exit 0
  }
  "other" {
    Write-Step "ERROR" "Cong $Port dang bi mot ung dung KHAC chiem dung." "Red"
    Write-Host "        Cach 1: tat ung dung dang giu cong $Port."
    Write-Host "        Cach 2: doi cong roi chay lai:  `$env:USACO_IDE_PORT=5051; .\start-usaco-ide.ps1"
    Read-Host "Nhan Enter de thoat"
    exit 1
  }
}

# 3. First run -> npm install
if (-not (Test-Path "node_modules")) {
  Write-Step "SETUP" "Cai dependencies lan dau (npm install)..."
  npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Step "ERROR" "npm install that bai. Kiem tra ket noi mang roi chay lai." "Red"
    Read-Host "Nhan Enter de thoat"
    exit 1
  }
}

# 4. Start backend in a new window (child inherits USACO_IDE_PORT)
Write-Step "START" "Khoi dong backend tren cong $Port ..."
$env:USACO_IDE_PORT = "$Port"
Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $BackendDir

# 5. Wait for readiness, then open the default browser
Write-Step "WAIT" "Cho backend san sang..."
$ready = $false
for ($i = 0; $i -lt 40; $i++) {
  try {
    Invoke-WebRequest -Uri "$Url/api/health" -UseBasicParsing -TimeoutSec 2 | Out-Null
    $ready = $true; break
  } catch { Start-Sleep -Seconds 1 }
}
if ($ready) {
  Write-Step "OPEN" "Mo trinh duyet: $Url" "Green"
  Start-Process $Url
} else {
  Write-Step "ERROR" "Backend khong phan hoi sau 40 giay. Xem cua so node vua mo de biet loi." "Red"
  Read-Host "Nhan Enter de thoat"
  exit 1
}
