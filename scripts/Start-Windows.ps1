[CmdletBinding()]
param(
  [ValidateSet("1", "2")]
  [string]$Mode = $(if ($env:TOCHKA_MODE) { $env:TOCHKA_MODE } else { "" }),
  [int]$Port = $(if ($env:TOCHKA_PORT) { [int]$env:TOCHKA_PORT } else { 7100 }),
  [switch]$NoOpen
)

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "Точка опоры — локальный сервер"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot
$server = $null

function Write-Step([string]$Text) {
  Write-Host "`n  $Text" -ForegroundColor Green
}

function Invoke-Native([string]$FilePath, [string[]]$Arguments) {
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Команда $FilePath завершилась с кодом $LASTEXITCODE."
  }
}

try {
  Clear-Host
  Write-Host "`n  Точка опоры — автономный запуск" -ForegroundColor Green
  Write-Host "  ───────────────────────────────`n"

  if (-not $Mode) {
    Write-Host "  1 — только этот компьютер Windows"
    Write-Host "  2 — Windows и телефон в одной локальной сети`n"
    $Mode = Read-Host "  Выберите режим [1]"
    if (-not $Mode) { $Mode = "1" }
  }
  if ($Mode -notin @("1", "2")) { throw "Выберите режим 1 или 2." }

  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $node) { $node = Get-Command node -ErrorAction SilentlyContinue }
  if (-not $node) {
    Write-Host "`n  Node.js 22 или новее не найден." -ForegroundColor Yellow
    Write-Host "  Пока есть интернет, установите LTS-версию с https://nodejs.org/"
    Write-Host "  После установки закройте это окно и запустите файл снова.`n"
    throw "Node.js не найден."
  }

  $nodeVersion = (& $node.Source --version).TrimStart("v").Split(".")[0]
  if ([int]$nodeVersion -lt 22) {
    throw "Нужен Node.js 22 или новее. Сейчас установлен: $(& $node.Source --version)."
  }
  $npm = Get-Command npm.cmd -ErrorAction Stop

  $modulesStamp = Join-Path $ProjectRoot "node_modules\.package-lock.json"
  if (-not (Test-Path $modulesStamp)) {
    Write-Step "Первый запуск: устанавливаю зависимости…"
    Invoke-Native $npm.Source @("ci")
  }

  $serverBundle = Join-Path $ProjectRoot "dist\boot.js"
  $needsBuild = -not (Test-Path $serverBundle)
  if (-not $needsBuild) {
    $buildTime = (Get-Item $serverBundle).LastWriteTimeUtc
    $sourceDirs = @("src", "api", "db", "contracts") | ForEach-Object { Join-Path $ProjectRoot $_ }
    $latestSource = Get-ChildItem $sourceDirs -Recurse -File | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    $configFiles = @("package.json", "package-lock.json", "vite.config.ts", "tsconfig.server.json") | ForEach-Object { Join-Path $ProjectRoot $_ }
    $latestConfig = Get-ChildItem $configFiles -File | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if (($latestSource -and $latestSource.LastWriteTimeUtc -gt $buildTime) -or ($latestConfig -and $latestConfig.LastWriteTimeUtc -gt $buildTime)) {
      $needsBuild = $true
    }
  }
  if ($needsBuild) {
    Write-Step "Собираю приложение. Это нужно только после установки или обновления…"
    Invoke-Native $npm.Source @("run", "build")
  }

  $listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
  while ($listeners.Port -contains $Port) {
    $Port++
    if ($Port -gt 7199) { throw "Не удалось найти свободный порт между 7100 и 7199." }
  }

  $env:HOST = if ($Mode -eq "1") { "127.0.0.1" } else { "0.0.0.0" }
  $env:PORT = [string]$Port
  $localUrl = "http://127.0.0.1:$Port"

  Write-Step "Запускаю локальный сервер…"
  $server = Start-Process -FilePath $node.Source -ArgumentList "scripts/start.mjs" -WorkingDirectory $ProjectRoot -NoNewWindow -PassThru

  $ready = $false
  for ($attempt = 0; $attempt -lt 80; $attempt++) {
    try {
      $health = Invoke-WebRequest -Uri "$localUrl/api/health" -UseBasicParsing -TimeoutSec 1
      if ($health.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
    if ($server.HasExited) { break }
    Start-Sleep -Milliseconds 250
  }
  if (-not $ready) { throw "Сервер не запустился. Проверьте сообщения выше." }

  Write-Host "`n  Готово. Ваши данные находятся на этом компьютере." -ForegroundColor Green
  Write-Host "  На Windows: $localUrl"

  if ($Mode -eq "2") {
    Write-Host "`n  Режим Windows + телефон включён." -ForegroundColor Green
    $addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -ne "127.0.0.1" -and $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -ne "WellKnown" }
    if ($addresses) {
      $addresses | ForEach-Object { Write-Host "  В браузере телефона откройте: http://$($_.IPAddress):$Port" }
    } else {
      Write-Host "  Локальный IP не найден. Проверьте подключение к Wi-Fi."
    }
    Write-Host "`n  Телефон и компьютер должны быть в одной сети."
    Write-Host "  Если Windows спросит про брандмауэр, разрешите Node.js только в частных сетях."
    Write-Host "  Не используйте режим 2 в публичном Wi-Fi и не открывайте порт в интернет."
  }

  Write-Host "`n  Не закрывайте это окно и не давайте компьютеру уснуть."
  Write-Host "  Для остановки нажмите Ctrl+C.`n"
  if (-not $NoOpen) { Start-Process $localUrl }

  Wait-Process -Id $server.Id
  if ($server.ExitCode -ne 0) { throw "Сервер остановился с кодом $($server.ExitCode)." }
} catch {
  Write-Host "`n  Ошибка: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
} finally {
  if ($server -and -not $server.HasExited) {
    & taskkill.exe /PID $server.Id /T /F 2>$null | Out-Null
  }
}
