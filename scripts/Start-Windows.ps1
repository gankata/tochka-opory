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

  $NodeVersion = "22.23.4"

  function Test-Node([string]$Path) {
    if (-not $Path -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    try {
      $version = (& $Path --version 2>$null | Select-Object -First 1)
      if ($LASTEXITCODE -ne 0 -or -not $version) { return $false }
      $major = $version.TrimStart("v").Split(".")[0]
      return ([int]$major -ge 22)
    } catch {
      return $false
    }
  }

  function Install-PortableNode {
    $architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
    switch ($architecture) {
      "X64" {
        $nodePlatform = "win-x64"
        $expectedHash = "cbc74b5e0982c9dbb41525fd8fb5dcd32fbee237863f7829072f4639a1ce5f20"
      }
      "Arm64" {
        $nodePlatform = "win-arm64"
        $expectedHash = "a8b8cd79cbbb3062435f449591d98dd63730bbbf30ce2d7cc3a6376c236cb111"
      }
      default { throw "Архитектура Windows $architecture не поддерживается автоматической загрузкой Node.js." }
    }

    $nodeDist = "node-v$NodeVersion-$nodePlatform"
    $toolchain = Join-Path $ProjectRoot ".toolchain"
    $runtimeDir = Join-Path $toolchain $nodeDist
    $runtimeNode = Join-Path $runtimeDir "node.exe"
    if (Test-Node $runtimeNode) { return $runtimeNode }

    Write-Step "Совместимый Node.js не найден. Скачиваю официальный Node.js $NodeVersion…"
    Write-Host "  Он будет сохранён в папке приложения, без установки в систему и прав администратора."
    $tempDir = Join-Path $toolchain (".node-download-" + [guid]::NewGuid().ToString("N"))
    $null = New-Item -ItemType Directory -Path $tempDir -Force
    try {
      $archive = Join-Path $tempDir "$nodeDist.zip"
      $url = "https://nodejs.org/dist/v$NodeVersion/$nodeDist.zip"
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing
      $actualHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
      if ($actualHash -ne $expectedHash) {
        throw "Контрольная сумма Node.js не совпала. Загрузка отклонена."
      }

      Expand-Archive -LiteralPath $archive -DestinationPath $tempDir
      $extractedNode = Join-Path $tempDir "$nodeDist\node.exe"
      if (-not (Test-Node $extractedNode)) { throw "Не удалось распаковать или проверить Node.js." }
      if (Test-Path -LiteralPath $runtimeDir) { Remove-Item -LiteralPath $runtimeDir -Recurse -Force }
      Move-Item -LiteralPath (Join-Path $tempDir $nodeDist) -Destination $runtimeDir
      if (-not (Test-Node $runtimeNode)) { throw "Локальный Node.js не прошёл проверку после установки." }
      Write-Host "  Node.js установлен локально и готов к автономным запускам." -ForegroundColor Green
      return $runtimeNode
    } catch {
      if ($_.Exception.Message -notmatch "Контрольная сумма|распаковать|проверку") {
        throw "Не удалось подготовить Node.js. Проверьте интернет и повторите запуск. $($_.Exception.Message)"
      }
      throw
    } finally {
      if (Test-Path -LiteralPath $tempDir) { Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue }
    }
  }

  $nodePath = $null
  if ($env:TOCHKA_FORCE_PORTABLE_NODE -ne "1") {
    $candidates = @()
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($nodeCommand) { $candidates += $nodeCommand.Source }
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCommand) { $candidates += $nodeCommand.Source }
    foreach ($candidate in ($candidates | Select-Object -Unique)) {
      if (Test-Node $candidate) { $nodePath = $candidate; break }
    }
  }
  if (-not $nodePath) { $nodePath = Install-PortableNode }
  $node = Get-Command -Name $nodePath -CommandType Application -ErrorAction Stop

  $nodeDirectory = Split-Path -Parent $nodePath
  $npmPath = Join-Path $nodeDirectory "npm.cmd"
  if (-not (Test-Path -LiteralPath $npmPath -PathType Leaf)) {
    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($npmCommand) { $npmPath = $npmCommand.Source }
  }
  if (-not $npmPath -or -not (Test-Path -LiteralPath $npmPath -PathType Leaf)) {
    throw "npm не найден рядом с Node.js. Повторите запуск или переустановите приложение."
  }
  $npm = Get-Command -Name $npmPath -CommandType Application -ErrorAction Stop
  $env:PATH = "$nodeDirectory;$env:PATH"

  $modulesStamp = Join-Path $ProjectRoot "node_modules\.package-lock.json"
  $packageLock = Get-Item (Join-Path $ProjectRoot "package-lock.json")
  if (-not (Test-Path $modulesStamp) -or ($packageLock.LastWriteTimeUtc -gt (Get-Item $modulesStamp).LastWriteTimeUtc)) {
    Write-Step "Устанавливаю зависимости. Это нужно после установки или обновления…"
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
