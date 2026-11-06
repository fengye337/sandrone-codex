@echo off
powershell.exe -NoLogo -NoProfile -STA -ExecutionPolicy RemoteSigned -File "%~dp0Theme-Setup.ps1" -Mode Install
if errorlevel 1 pause
