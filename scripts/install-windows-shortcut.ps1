$ErrorActionPreference = "Stop"

$projectDirectory = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $PSScriptRoot "launch-offer.ps1"
$appRoot = Join-Path $env:LOCALAPPDATA "Offer-AutumnRecruitment"
$pidPath = Join-Path $appRoot "server.pid"
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
    throw "Port 4173 is already used by another program. Close it before installing offer."
  }
}
$build = Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "build") -WorkingDirectory $projectDirectory -WindowStyle Hidden -Wait -PassThru
if ($build.ExitCode -ne 0) { throw "offer build failed. Run npm run build in the project directory for details." }
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutName = [string]::Concat([char]0x6C42, "offer.lnk")
$shortcutPath = Join-Path $desktop $shortcutName
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`""
$shortcut.WorkingDirectory = $projectDirectory
$shortcut.Description = "Open the local offer autumn recruitment tracker"
$iconPath = Join-Path $projectDirectory "public\offer-penguin.ico"
if (-not (Test-Path -LiteralPath $iconPath)) { throw "offer shortcut icon is missing: $iconPath" }
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Save()
Write-Output $shortcutPath
