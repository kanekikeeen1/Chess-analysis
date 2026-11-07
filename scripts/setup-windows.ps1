<#
.SYNOPSIS
  Cài một lượt mọi thứ để chạy Chess Analysis trên Windows mới (mới cài lại Win, chưa có Java/Node/Python...).

.DESCRIPTION
  Chạy bằng setup.cmd ở thư mục gốc (tự xin quyền Administrator). Chạy lại bao nhiêu lần cũng được: bước nào đã xong
  thì bỏ qua. Nếu được yêu cầu khởi động lại máy (WSL/Docker), khởi động lại rồi chạy setup.cmd thêm lần nữa.

  Các bước:
    1. Cài bằng winget: Git, Visual C++ Redistributable, JDK 17 (Temurin), Node.js LTS, Docker Desktop
       (+ Python 3.13 nếu -WithPython)
    2. Tải Stockfish vào C:\tools\stockfish, đặt biến môi trường STOCKFISH_PATH, JAVA_HOME
    3. Kiểm tra mô hình ml/models (phải chép từ máy cũ), tải file puzzle Lichess nếu thiếu
    4. npm install cho frontend
    5. (tùy chọn) môi trường Python ml/.venv
    6. Docker: bật WSL, mở Docker Desktop, chạy MySQL, nhập dump cũ (nếu có), nhập puzzle

.PARAMETER WithPython
  Cài thêm Python 3.13 và dựng ml/.venv (chỉ cần khi muốn train lại mô hình).

.PARAMETER Torch
  Bản torch khi -WithPython: cpu (mặc định), cu126 hoặc cu130 (theo CUDA mà nvidia-smi in ra).

.PARAMETER DumpFile
  File dump.sql lấy từ máy cũ (tài khoản, ván đã lưu). Chỉ nhập khi database còn trống.

.PARAMETER StockfishBuild
  avx2 (mặc định, CPU từ ~2015 trở lên) hoặc x86-64 (CPU cũ, nếu bản avx2 không chạy).
#>
param(
    [switch]$WithPython,
    [ValidateSet("cpu", "cu126", "cu130")][string]$Torch = "cpu",
    [string]$DumpFile = "",
    [ValidateSet("avx2", "x86-64")][string]$StockfishBuild = "avx2"
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$Ml = Join-Path $Root "ml"
$StockfishDir = "C:\tools\stockfish"
$PuzzleFile = Join-Path $Ml "data\puzzles\lichess_db_puzzle.csv.zst"
$script:Warnings = New-Object System.Collections.Generic.List[string]
$script:NeedReboot = $false

function Step($text) { Write-Host ""; Write-Host "==> $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "    [OK] $text" -ForegroundColor Green }
function Info($text) { Write-Host "    $text" }
function Warn($text) { Write-Host "    [!] $text" -ForegroundColor Yellow; $script:Warnings.Add($text) }
function Fail($text) {
    Write-Host ""; Write-Host "[LỖI] $text" -ForegroundColor Red
    Read-Host "Nhấn Enter để đóng"
    exit 1
}

function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    foreach ($name in "JAVA_HOME", "STOCKFISH_PATH") {
        $value = [Environment]::GetEnvironmentVariable($name, "User")
        if (-not $value) { $value = [Environment]::GetEnvironmentVariable($name, "Machine") }
        if ($value) { Set-Item -Path "Env:$name" -Value $value }
    }
}

function Has-Command($name) { return [bool](Get-Command $name -ErrorAction SilentlyContinue) }

function Install-Winget($id, $label) {
    Info "Đang cài $label ($id)..."
    winget install --id $id -e --source winget --accept-package-agreements --accept-source-agreements --silent | Out-Host
    # 0: cài xong · -1978335189 (0x8A15002B): đã có, không có bản mới hơn
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335189) {
        Warn "winget báo mã $LASTEXITCODE khi cài $label. Nếu bước sau lỗi, hãy cài tay $label rồi chạy lại."
    } else {
        Ok "$label"
    }
    Refresh-Path
}

# ---------------------------------------------------------------- quyền Administrator
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Cần quyền Administrator để cài phần mềm, đang mở lại script..." -ForegroundColor Yellow
    $arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"", "-Torch", $Torch,
        "-StockfishBuild", $StockfishBuild)
    if ($WithPython) { $arguments += "-WithPython" }
    if ($DumpFile) { $arguments += @("-DumpFile", "`"$DumpFile`"") }
    Start-Process powershell -Verb RunAs -ArgumentList $arguments
    exit 0
}

Write-Host "Chess Analysis — cài đặt trên Windows" -ForegroundColor Cyan
Write-Host "Thư mục dự án: $Root"
if (-not (Test-Path (Join-Path $Backend "mvnw.cmd"))) { Fail "Không thấy backend\mvnw.cmd. Hãy đặt script trong thư mục scripts của dự án." }

# ---------------------------------------------------------------- 1. phần mềm
Step "1/6 Cài phần mềm bằng winget"
if (-not (Has-Command "winget")) {
    Fail "Không có winget. Mở Microsoft Store, cập nhật 'App Installer', rồi chạy lại setup.cmd."
}
Refresh-Path

if (Has-Command "git") { Ok "Git đã có" } else { Install-Winget "Git.Git" "Git" }

# ONNX Runtime (mô hình M2 và mô hình kiện tướng trong backend) cần thư viện C++ của Microsoft; Windows mới cài không có sẵn.
if (Test-Path "$env:WINDIR\System32\msvcp140.dll") { Ok "Visual C++ Redistributable đã có" }
else { Install-Winget "Microsoft.VCRedist.2015+.x64" "Visual C++ Redistributable x64" }

$javaOk = $false
if (Has-Command "java") {
    $major = (Get-Item (Get-Command java).Source).VersionInfo.ProductMajorPart
    if ($major -ge 17) { $javaOk = $true; Ok "Java $major đã có" }
}
if (-not $javaOk) { Install-Winget "EclipseAdoptium.Temurin.17.JDK" "JDK 17 (Temurin)" }

if (Has-Command "node") {
    $nodeMajor = [int]((& node -v).TrimStart("v").Split(".")[0])
    if ($nodeMajor -ge 22) { Ok "Node.js v$nodeMajor đã có" } else { Install-Winget "OpenJS.NodeJS.LTS" "Node.js LTS" }
} else { Install-Winget "OpenJS.NodeJS.LTS" "Node.js LTS" }

$dockerExe = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
if (Test-Path $dockerExe) { Ok "Docker Desktop đã có" } else {
    Install-Winget "Docker.DockerDesktop" "Docker Desktop"
    $script:NeedReboot = $true
}

if ($WithPython) {
    if (Has-Command "py") { Ok "Python launcher đã có" } else { Install-Winget "Python.Python.3.13" "Python 3.13" }
}

# JAVA_HOME: Maven Wrapper cần nó; bộ cài Temurin mặc định không đặt.
if (-not $env:JAVA_HOME -or -not (Test-Path (Join-Path $env:JAVA_HOME "bin\java.exe"))) {
    $jdk = Get-ChildItem "$env:ProgramFiles\Eclipse Adoptium" -Directory -Filter "jdk-*" -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | Select-Object -First 1
    if (-not $jdk -and (Has-Command "java")) { $jdk = Get-Item (Split-Path -Parent (Split-Path -Parent (Get-Command java).Source)) }
    if ($jdk) {
        [Environment]::SetEnvironmentVariable("JAVA_HOME", $jdk.FullName, "User")
        Refresh-Path
        Ok "JAVA_HOME = $($jdk.FullName)"
    } else {
        Warn "Không tìm thấy JDK để đặt JAVA_HOME. Cài JDK 17 rồi chạy lại."
    }
}

# ---------------------------------------------------------------- 2. Stockfish
Step "2/6 Stockfish"
$stockfish = [Environment]::GetEnvironmentVariable("STOCKFISH_PATH", "User")
if (-not ($stockfish -and (Test-Path $stockfish))) {
    $stockfish = Get-ChildItem $StockfishDir -Recurse -Filter "stockfish*.exe" -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty FullName
}
if (-not $stockfish) {
    $zip = Join-Path $env:TEMP "stockfish.zip"
    $url = "https://github.com/official-stockfish/Stockfish/releases/latest/download/stockfish-windows-$StockfishBuild.zip"
    Info "Đang tải $url"
    try {
        Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
        New-Item -ItemType Directory -Force $StockfishDir | Out-Null
        Expand-Archive -Path $zip -DestinationPath $StockfishDir -Force
        Remove-Item $zip -Force
        $stockfish = Get-ChildItem $StockfishDir -Recurse -Filter "stockfish*.exe" |
            Select-Object -First 1 -ExpandProperty FullName
    } catch {
        Warn "Không tải được Stockfish ($($_.Exception.Message)). Tải tay ở stockfishchess.org, giải nén vào $StockfishDir rồi chạy lại."
    }
}
if ($stockfish) {
    [Environment]::SetEnvironmentVariable("STOCKFISH_PATH", $stockfish, "User")
    $env:STOCKFISH_PATH = $stockfish
    # Dòng trống đầu tiên: nếu PowerShell chèn BOM khi truyền chuỗi sang chương trình, BOM rơi vào dòng đó chứ không làm hỏng lệnh "uci".
    $reply = "`nuci`nquit`n" | & $stockfish 2>$null | Out-String
    if ($reply -match "uciok") { Ok "STOCKFISH_PATH = $stockfish" }
    else { Warn "Stockfish không trả lời 'uciok'. CPU có thể không hỗ trợ AVX2: chạy lại với setup.cmd -StockfishBuild x86-64 (xóa $StockfishDir trước)." }
}

# ---------------------------------------------------------------- 3. mô hình và dữ liệu
Step "3/6 Mô hình ML và dữ liệu puzzle"
$models = @(
    "ml\models\m2.onnx", "ml\models\m2.meta.json",
    "ml\models\styles\styles.json", "ml\models\styles\puzzles.json",
    "ml\models\styles\liem.onnx", "ml\models\styles\carlsen.onnx", "ml\models\styles\hikaru.onnx"
)
$missing = $models | Where-Object { -not (Test-Path (Join-Path $Root $_)) }
if ($missing) {
    Warn ("Thiếu mô hình (không nằm trong git, phải chép từ máy cũ vào đúng chỗ): " + ($missing -join ", ") +
        ". Web vẫn chạy nhưng các tính năng Theo Elo / Kiện tướng sẽ tắt.")
} else { Ok "Đủ mô hình M2 và 3 mô hình kiện tướng" }

if (Test-Path $PuzzleFile) { Ok "Có file puzzle Lichess" } else {
    Info "Đang tải ngân hàng puzzle Lichess (~290 MB, CC0)..."
    try {
        New-Item -ItemType Directory -Force (Split-Path $PuzzleFile) | Out-Null
        Invoke-WebRequest -Uri "https://database.lichess.org/lichess_db_puzzle.csv.zst" -OutFile $PuzzleFile -UseBasicParsing
        Ok "Đã tải $PuzzleFile"
    } catch {
        Remove-Item $PuzzleFile -ErrorAction SilentlyContinue
        Warn "Không tải được file puzzle ($($_.Exception.Message)). Trang /puzzles sẽ trống cho tới khi có file."
    }
}

# ---------------------------------------------------------------- 4. frontend
Step "4/6 Cài thư viện frontend (npm install)"
if (Has-Command "npm") {
    Push-Location $Frontend
    & npm.cmd install --no-fund --no-audit
    if ($LASTEXITCODE -eq 0) { Ok "npm install" } else { Warn "npm install lỗi (mã $LASTEXITCODE). Chạy lại setup.cmd hoặc 'npm install' trong frontend." }
    Pop-Location
} else { Warn "Chưa có npm (Node.js vừa cài cần mở lại cửa sổ). Chạy lại setup.cmd." }

# ---------------------------------------------------------------- 5. Python (tùy chọn)
Step "5/6 Môi trường Python cho ML"
if (-not $WithPython) {
    Info "Bỏ qua (chỉ cần khi train lại mô hình; chạy setup.cmd -WithPython để cài)."
} elseif (-not (Has-Command "py")) {
    Warn "Chưa thấy lệnh py. Mở lại cửa sổ rồi chạy setup.cmd -WithPython."
} else {
    $venvPython = Join-Path $Ml ".venv\Scripts\python.exe"
    if (-not (Test-Path $venvPython)) { & py -3.13 -m venv (Join-Path $Ml ".venv") }
    & $venvPython -m pip install --upgrade pip --quiet
    & $venvPython -m pip install -r (Join-Path $Ml "requirements.txt")
    & $venvPython -m pip install torch --index-url "https://download.pytorch.org/whl/$Torch"
    if ($LASTEXITCODE -eq 0) { Ok "ml\.venv (torch $Torch)" } else { Warn "Cài thư viện Python lỗi, xem log phía trên." }
}

# ---------------------------------------------------------------- 6. Docker, MySQL, dữ liệu
Step "6/6 Docker và MySQL"
& wsl.exe --status *> $null
if ($LASTEXITCODE -ne 0) {
    Info "Đang bật WSL 2 (Docker Desktop cần)..."
    & wsl.exe --install --no-distribution | Out-Host
    $script:NeedReboot = $true
}

function Docker-Ready {
    if (-not (Has-Command "docker")) { return $false }
    & docker info *> $null
    return ($LASTEXITCODE -eq 0)
}

$dockerReady = Docker-Ready
if (-not $dockerReady -and (Test-Path $dockerExe) -and -not $script:NeedReboot) {
    Info "Đang mở Docker Desktop (lần đầu có thể hiện cửa sổ điều khoản: bấm Accept, có thể bỏ qua đăng nhập)..."
    Start-Process $dockerExe
    for ($i = 0; $i -lt 60 -and -not $dockerReady; $i++) { Start-Sleep -Seconds 5; Refresh-Path; $dockerReady = Docker-Ready }
}

if (-not $dockerReady) {
    $script:NeedReboot = $true
    Warn "Docker chưa sẵn sàng. Khởi động lại máy, mở Docker Desktop (Accept điều khoản), đợi 'Engine running', rồi chạy lại setup.cmd."
} else {
    Ok "Docker đang chạy"
    Push-Location $Backend
    & docker compose up -d mysql
    $container = (& docker compose ps -q mysql | Out-String).Trim()
    $health = ""
    for ($i = 0; $i -lt 60 -and $health -ne "healthy"; $i++) {
        Start-Sleep -Seconds 3
        $health = (& docker inspect --format "{{.State.Health.Status}}" $container 2>$null | Out-String).Trim()
    }
    if ($health -ne "healthy") {
        Warn "MySQL chưa healthy sau 3 phút (trạng thái: $health). Xem 'docker compose logs mysql'."
    } else {
        Ok "MySQL healthy"

        function Count-Rows($table) {
            $out = & docker compose exec -T mysql mysql -N -uchess_user -pchess_password chess_analysis -e "SELECT COUNT(*) FROM $table" 2>$null
            if ($LASTEXITCODE -ne 0) { return -1 }
            return [int](($out | Select-Object -Last 1).Trim())
        }

        if ($DumpFile) {
            if (-not (Test-Path $DumpFile)) { Warn "Không thấy file dump $DumpFile" }
            elseif ((Count-Rows "user_accounts") -gt 0) { Info "Database đã có dữ liệu, không nhập dump (tránh ghi đè)." }
            else {
                Info "Đang nhập $DumpFile ..."
                & docker compose cp $DumpFile mysql:/tmp/dump.sql
                & docker compose exec -T mysql sh -c "mysql -uchess_user -pchess_password chess_analysis < /tmp/dump.sql"
                if ($LASTEXITCODE -eq 0) { Ok "Đã nhập dump" } else { Warn "Nhập dump lỗi, xem log phía trên." }
            }
        }

        if ((Count-Rows "puzzles") -gt 0) {
            Ok "Ngân hàng puzzle đã có"
        } elseif (-not (Test-Path $PuzzleFile)) {
            Warn "Chưa nhập puzzle vì thiếu file $PuzzleFile."
        } elseif (-not $env:JAVA_HOME) {
            Warn "Chưa nhập puzzle vì thiếu JAVA_HOME. Mở lại cửa sổ rồi chạy lại setup.cmd."
        } else {
            Info "Đang tạo bảng (Flyway) và nhập puzzle Lichess — lần đầu Maven tải thư viện, mất vài phút..."
            & .\mvnw.cmd -q spring-boot:run "-Dspring-boot.run.arguments=--spring.main.web-application-type=none --app.puzzles.import-file=../ml/data/puzzles/lichess_db_puzzle.csv.zst"
            if ((Count-Rows "puzzles") -gt 0) { Ok "Đã nhập puzzle ($(Count-Rows 'puzzles') bài)" }
            else { Warn "Nhập puzzle chưa thành công, xem log phía trên." }
        }
    }
    Pop-Location
}

# ---------------------------------------------------------------- tổng kết
Write-Host ""
Write-Host "==================================================================" -ForegroundColor Cyan
if ($script:Warnings.Count -eq 0 -and -not $script:NeedReboot) {
    Write-Host "Cài đặt xong. Chạy ứng dụng bằng start.cmd ở thư mục gốc dự án." -ForegroundColor Green
} else {
    Write-Host "Cần xử lý:" -ForegroundColor Yellow
    foreach ($warning in $script:Warnings) { Write-Host " - $warning" -ForegroundColor Yellow }
    if ($script:NeedReboot) {
        Write-Host ""
        Write-Host "=> KHỞI ĐỘNG LẠI MÁY, mở Docker Desktop, rồi chạy lại setup.cmd (các bước đã xong sẽ tự bỏ qua)." -ForegroundColor Yellow
    }
}
Write-Host "==================================================================" -ForegroundColor Cyan
Read-Host "Nhấn Enter để đóng"
