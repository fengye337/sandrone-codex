@echo off
powershell.exe -NoLogo -NoProfile -STA -ExecutionPolicy RemoteSigned -File "%~dp0Launch.ps1"
if errorlevel 1 pause
