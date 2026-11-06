@echo off
powershell.exe -NoLogo -NoProfile -STA -ExecutionPolicy RemoteSigned -File "%~dp0Theme-Setup.ps1" -Mode Restore
if errorlevel 1 pause
