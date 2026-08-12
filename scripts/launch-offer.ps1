$ErrorActionPreference = "Stop"

$projectDirectory = Split-Path -Parent $PSScriptRoot
$appRoot = Join-Path $env:LOCALAPPDATA "Offer-AutumnRecruitment"
$dataDirectory = Join-Path $appRoot "data"
$logDirectory = Join-Path $appRoot "logs"
$pidPath = Join-Path $appRoot "server.pid"
$url = "http://127.0.0.1:4173/"

New-Item -ItemType Directory -Force -Path $dataDirectory, $logDirectory | Out-Null
$env:OFFER_DEV_DATA_DIR = $dataDirectory

function Test-OfferReady {
  try {
    $health = Invoke-RestMethod -Uri "${url}api/health" -TimeoutSec 2
    if ($health.apiVersion -ne 2) { return $false }
    $response = Invoke-RestMethod -Uri "${url}api/workspace" -TimeoutSec 2
    if ($null -eq $response.companies -or $null -eq $response.storage.dataDirectory) { return $false }
    $actualDataDirectory = [System.IO.Path]::GetFullPath([string]$response.storage.dataDirectory)
    $expectedDataDirectory = [System.IO.Path]::GetFullPath($dataDirectory)
    return $actualDataDirectory -eq $expectedDataDirectory
  } catch {
    return $false
  }
}

if (-not (Test-OfferReady)) {
  if (Test-Path -LiteralPath $pidPath) {
    $serverPid = [int](Get-Content -LiteralPath $pidPath -ErrorAction SilentlyContinue)
    $serverProcess = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
    if ($serverProcess -and $serverProcess.ProcessName -in @("node", "npm")) {
      Stop-Process -Id $serverPid -Force -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
  }
  $listener = Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($listener) {
    $listenerProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
    if ($listenerProcess.CommandLine -like "*$projectDirectory*" -and $listenerProcess.CommandLine -like "*vite*") {
      Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
    } else {
      throw "Port 4173 is already used by another program. Close it before starting offer."
    }
  }
  if (-not (Test-Path (Join-Path $projectDirectory "dist\client\index.html"))) {
    $build = Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "build") -WorkingDirectory $projectDirectory -WindowStyle Hidden -Wait -PassThru
    if ($build.ExitCode -ne 0) { throw "offer build failed. Run npm run build in the project directory for details." }
  }

  $stdout = Join-Path $logDirectory "offer.stdout.log"
  $stderr = Join-Path $logDirectory "offer.stderr.log"
  $vitePath = Join-Path $projectDirectory "node_modules\vite\bin\vite.js"
  $process = Start-Process -FilePath "node.exe" -ArgumentList @($vitePath, "preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort") -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
  Set-Content -LiteralPath $pidPath -Value $process.Id -Encoding Ascii

  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
    Start-Sleep -Milliseconds 250
    if (Test-OfferReady) { $ready = $true; break }
  }
  if (-not $ready) { throw "offer failed to start. Check $stderr" }
}

Start-Process $url
