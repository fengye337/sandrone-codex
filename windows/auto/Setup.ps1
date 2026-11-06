$ErrorActionPreference='Stop'
$shell=New-Object -ComObject WScript.Shell
$desktop=[Environment]::GetFolderPath('Desktop')
$link=$shell.CreateShortcut((Join-Path $desktop '桑多涅 Codex（自动适配）.lnk'))
$link.TargetPath=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$link.Arguments='-NoLogo -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "'+(Join-Path $PSScriptRoot 'Launch.ps1')+'"'
$link.WorkingDirectory=$PSScriptRoot
$link.IconLocation=Join-Path $PSScriptRoot 'source\assets\workshop.ico'
$link.Save()
$link=$shell.CreateShortcut((Join-Path $desktop '恢复 Codex 官方版（自动适配）.lnk'))
$link.TargetPath=Join-Path $PSScriptRoot 'Restore-Theme.cmd';$link.WorkingDirectory=$PSScriptRoot;$link.Save()
Write-Output 'Desktop shortcuts created. Exit Codex normally before first installation.'
