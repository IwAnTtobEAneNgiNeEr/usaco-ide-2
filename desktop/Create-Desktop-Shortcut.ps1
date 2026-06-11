# Create-Desktop-Shortcut.ps1
# Tao shortcut "USACO IDE 2.0" tren Desktop, tro toi launcher .bat, dung icon da build.
# Chay:  right-click -> Run with PowerShell   (hoac)   powershell -ExecutionPolicy Bypass -File Create-Desktop-Shortcut.ps1

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Definition
$bat  = Join-Path $here "USACO-IDE-2.bat"
$icon = Join-Path $here "build\icon.ico"

# Tao icon neu chua co.
if (-not (Test-Path $icon)) {
  Write-Host "Dang tao icon..."
  & node (Join-Path $here "scripts\make-icon.js")
}

$desktop  = [Environment]::GetFolderPath("Desktop")
$lnkPath  = Join-Path $desktop "USACO IDE 2.0.lnk"

$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($lnkPath)
$lnk.TargetPath       = $bat
$lnk.WorkingDirectory = $here
$lnk.IconLocation     = $icon
$lnk.Description       = "USACO IDE 2.0 — Competitive Programming IDE"
$lnk.WindowStyle      = 7   # minimized launcher window
$lnk.Save()

Write-Host "Da tao shortcut tren Desktop:" $lnkPath
Write-Host "Double-click 'USACO IDE 2.0' de mo app."
