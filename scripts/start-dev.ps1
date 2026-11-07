<#
.SYNOPSIS
  Chạy Chess Analysis hằng ngày: MySQL (Docker) → backend (cửa sổ riêng) → frontend (cửa sổ riêng) → mở trình duyệt.

.DESCRIPTION
  Chạy bằng start.cmd ở thư mục gốc. Đóng cửa sổ backend/frontend để tắt; MySQL vẫn chạy nền trong Docker
  (tắt bằng: cd backend; docker compose stop).
#>
$ErrorActionPreference = "Continue"

$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"

function Fail($text) {
    Write-Host "[LỖI] $text" -ForegroundColor Red
    Read-Host "Nhấn Enter để đóng"
    exit 1
}

# Lấy biến môi trường mới nhất (setup có thể vừa đặt JAVA_HOME / STOCKFISH_PATH).
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
foreach ($name in "JAVA_HOME", "STOCKFISH_PATH") {
    $value = [Environment]::GetEnvironmentVariable($name, "User")
    if ($value) { Set-Item -Path "Env:$name" -Value $value }
}
if (-not $env:STOCKFISH_PATH) { Write-Host "[!] Chưa đặt STOCKFISH_PATH: chạy setup.cmd trước." -ForegroundColor Yellow }
if (-not (Test-Path (Join-Path $Frontend "node_modules"))) { Fail "Chưa có frontend\node_modules: chạy setup.cmd trước." }

Write-Host "==> Docker và MySQL" -ForegroundColor Cyan
& docker info *> $null
if ($LASTEXITCODE -ne 0) {
    $dockerExe = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
    if (-not (Test-Path $dockerExe)) { Fail "Chưa cài Docker Desktop: chạy setup.cmd trước." }
    Write-Host "    Đang mở Docker Desktop..."
    Start-Process $dockerExe
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 5
        & docker info *> $null
        if ($LASTEXITCODE -eq 0) { break }
    }
    if ($LASTEXITCODE -ne 0) { Fail "Docker chưa chạy sau 5 phút. Mở Docker Desktop, đợi 'Engine running' rồi chạy lại." }
}

Push-Location $Backend
& docker compose up -d mysql
$container = (& docker compose ps -q mysql | Out-String).Trim()
$health = ""
for ($i = 0; $i -lt 60 -and $health -ne "healthy"; $i++) {
    $health = (& docker inspect --format "{{.State.Health.Status}}" $container 2>$null | Out-String).Trim()
    if ($health -ne "healthy") { Start-Sleep -Seconds 3 }
}
Pop-Location
if ($health -ne "healthy") { Fail "MySQL chưa sẵn sàng (trạng thái: $health). Xem: cd backend; docker compose logs mysql" }
Write-Host "    [OK] MySQL healthy" -ForegroundColor Green

Write-Host "==> Mở cửa sổ backend (Spring Boot, cổng 8080)" -ForegroundColor Cyan
Start-Process powershell -WorkingDirectory $Backend -ArgumentList @(
    "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
    "`$Host.UI.RawUI.WindowTitle = 'Chess Analysis - backend'; .\mvnw.cmd spring-boot:run"
)

Write-Host "==> Mở cửa sổ frontend (Next.js, cổng 3000)" -ForegroundColor Cyan
Start-Process powershell -WorkingDirectory $Frontend -ArgumentList @(
    "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
    "`$Host.UI.RawUI.WindowTitle = 'Chess Analysis - frontend'; npm.cmd run dev"
)

Write-Host "==> Đợi backend khởi động (lần đầu có thể mất vài phút)..." -ForegroundColor Cyan
$up = $false
for ($i = 0; $i -lt 120 -and -not $up; $i++) {
    Start-Sleep -Seconds 3
    try {
        Invoke-WebRequest -Uri "http://localhost:8080/api/styles" -UseBasicParsing -TimeoutSec 3 | Out-Null
        $up = $true
    } catch { }
}
if ($up) {
    Write-Host "    [OK] Backend đã sẵn sàng" -ForegroundColor Green
    Start-Process "http://localhost:3000"
} else {
    Write-Host "[!] Backend chưa trả lời sau 6 phút: xem lỗi trong cửa sổ backend." -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Web: http://localhost:3000 · Tắt: đóng 2 cửa sổ backend/frontend." -ForegroundColor Cyan
Start-Sleep -Seconds 5
