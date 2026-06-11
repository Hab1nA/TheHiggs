@echo off
:: TheHiggs — Full Electron Dev Mode
:: Starts Next.js + Electron in one step.
:: Usage: start-electron-dev.bat

setlocal
chcp 65001 >nul
cd /d "%~dp0"
pwsh -ExecutionPolicy Bypass -File "start-electron-dev.ps1" %*
pause
