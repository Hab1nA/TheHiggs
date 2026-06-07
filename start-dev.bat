@echo off
:: TheHiggs Development Server Quick Start
:: Double-click this file to start the development server
:: The script auto-detects the actual port used by Next.js

:: Set console to UTF-8 to fix Unicode output (✓ ▲ ● etc.)
chcp 65001 >nul

cd /d "%~dp0"
pwsh -ExecutionPolicy Bypass -File "start-dev.ps1" %*
pause
