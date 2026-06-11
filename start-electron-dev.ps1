<#
.SYNOPSIS
    TheHiggs — Full Electron Dev Mode
.DESCRIPTION
    Starts Next.js dev server in background, waits for it, then launches
    Electron in foreground. Cleans up on exit.
.PARAMETER Port
    Dev server port (default: 3000).
.EXAMPLE
    .\start-electron-dev.ps1
#>

param(
    [int]$Port = 3000
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Set-Location $PSScriptRoot

# ── Start Next.js in background via Start-Process ──
Write-Host "[thehiggs] Starting Next.js dev server on port $Port..." -ForegroundColor Cyan

# Find cmd.exe for running npx (which is a .cmd wrapper on Windows)
$cmdPath = "$env:SystemRoot\System32\cmd.exe"
$nextPid = $null

try {
    $proc = Start-Process -FilePath $cmdPath `
        -ArgumentList "/c", "npx", "next", "dev", "--turbopack", "--port", $Port `
        -PassThru `
        -RedirectStandardOutput "$PSScriptRoot\.next-dev-stdout.log" `
        -RedirectStandardError "$PSScriptRoot\.next-dev-stderr.log"
    $nextPid = $proc.Id
    Write-Host "[thehiggs] Next.js PID: $nextPid" -ForegroundColor DarkGray
}
catch {
    Write-Host "[thehiggs] Failed to start Next.js: $_" -ForegroundColor Red
    exit 1
}

# ── Wait for Next.js to be ready ──
Write-Host "[thehiggs] Waiting for Next.js to be ready..." -ForegroundColor DarkGray
$maxWait = 90
$waited = 0
$ready = $false

while ($waited -lt $maxWait) {
    Start-Sleep -Seconds 2
    $waited += 2

    # Check if Next.js process is still alive
    $stillRunning = Get-Process -Id $nextPid -ErrorAction SilentlyContinue
    if (-not $stillRunning) {
        Write-Host "`n[thehiggs] ERROR: Next.js process died unexpectedly." -ForegroundColor Red
        Write-Host "[thehiggs] Check .next-dev-stderr.log for details." -ForegroundColor Yellow
        if (Test-Path "$PSScriptRoot\.next-dev-stderr.log") {
            Get-Content "$PSScriptRoot\.next-dev-stderr.log" -Tail 10
        }
        exit 1
    }

    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port" `
            -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        if ($response.StatusCode -eq 200 -or $response.StatusCode -eq 304) {
            $ready = $true
            Write-Host "[thehiggs] Next.js ready! (waited ${waited}s)" -ForegroundColor Green
            break
        }
    }
    catch {
        Write-Host "." -NoNewline -ForegroundColor DarkGray
    }
}

if (-not $ready) {
    Write-Host "`n[thehiggs] ERROR: Next.js failed to start within ${maxWait}s" -ForegroundColor Red
    if ($nextPid) { Stop-Process -Id $nextPid -Force -ErrorAction SilentlyContinue }
    exit 1
}

# ── Compile Electron TypeScript ──
Write-Host "[thehiggs] Compiling Electron main process..." -ForegroundColor Cyan
& npx tsc -p tsconfig.electron.json
if ($LASTEXITCODE -ne 0) {
    Write-Host "[thehiggs] Electron TypeScript compilation failed!" -ForegroundColor Red
    if ($nextPid) { Stop-Process -Id $nextPid -Force -ErrorAction SilentlyContinue }
    exit 1
}

# ── Launch Electron (foreground — blocks until user closes it) ──
Write-Host "[thehiggs] Launching Electron..." -ForegroundColor Green
try {
    & npx electron .
}
finally {
    # ── Cleanup: kill Next.js dev server when Electron exits ──
    Write-Host "`n[thehiggs] Electron exited. Cleaning up..." -ForegroundColor Yellow
    if ($nextPid) {
        $proc = Get-Process -Id $nextPid -ErrorAction SilentlyContinue
        if ($proc) {
            Stop-Process -Id $nextPid -Force -ErrorAction SilentlyContinue
            Write-Host "[thehiggs] Next.js server stopped (PID $nextPid)." -ForegroundColor DarkGray
        }
    }
    # Clean up log files
    Remove-Item "$PSScriptRoot\.next-dev-stdout.log" -ErrorAction SilentlyContinue
    Remove-Item "$PSScriptRoot\.next-dev-stderr.log" -ErrorAction SilentlyContinue
}
