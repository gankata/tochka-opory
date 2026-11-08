[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$batch = Join-Path $ProjectRoot "Запустить Windows.bat"
$launcherScript = Join-Path $ProjectRoot "scripts\Start-Windows.ps1"
$stdout = Join-Path $env:TEMP "tochka-opory-launcher-test.out.log"
$stderr = Join-Path $env:TEMP "tochka-opory-launcher-test.err.log"
$launcher = $null

function Write-LauncherLogs {
  if (Test-Path $stdout) {
    Write-Host "`n--- BAT / PowerShell output ---"
    Get-Content -LiteralPath $stdout | Write-Host
  }
  if (Test-Path $stderr) {
    Write-Host "`n--- BAT / PowerShell errors ---"
    Get-Content -LiteralPath $stderr | Write-Host
  }
}

try {
  $null = [scriptblock]::Create((Get-Content -Raw -LiteralPath $launcherScript))
  Write-Host "PowerShell syntax: OK"
  Remove-Item $stdout, $stderr -Force -ErrorAction SilentlyContinue

  # The extra outer quotes are required by cmd.exe /s /c when the BAT path contains spaces.
  $cmdArguments = "/d /s /c `"`"$batch`" -Mode 1 -NoOpen`""
  $launcher = Start-Process -FilePath "cmd.exe" -ArgumentList $cmdArguments `
    -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr

  $ready = $false
  for ($attempt = 0; $attempt -lt 600; $attempt++) {
    try {
      $health = Invoke-WebRequest -Uri "http://127.0.0.1:7100/api/health" -UseBasicParsing -TimeoutSec 2
      if ($health.StatusCode -eq 200) {
        $healthJson = $health.Content | ConvertFrom-Json
        if ($healthJson.status -eq "ok") { $ready = $true; break }
      }
    } catch { }
    if ($launcher.HasExited) { break }
    Start-Sleep -Milliseconds 500
  }

  if (-not $ready) {
    Write-LauncherLogs
    throw "BAT did not start a healthy server on port 7100. Launcher exit code: $($launcher.ExitCode)."
  }

  $page = Invoke-WebRequest -Uri "http://127.0.0.1:7100/" -UseBasicParsing -TimeoutSec 10
  if ($page.StatusCode -ne 200 -or $page.Content -notmatch '<div id="root">') {
    throw "The application shell was not served correctly."
  }
  if ($page.Headers["Content-Security-Policy"] -notmatch "default-src") {
    throw "Production security headers are missing."
  }

  Write-Host "Real cmd.exe BAT launch, first-run build, API health and application shell: OK"
} finally {
  if ($launcher -and -not $launcher.HasExited) {
    & taskkill.exe /PID $launcher.Id /T /F 2>$null | Out-Null
  }
  Write-LauncherLogs
  Remove-Item $stdout, $stderr -Force -ErrorAction SilentlyContinue
}
