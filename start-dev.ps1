<#
.SYNOPSIS
    TheHiggs Development Server Quick Start Script
.DESCRIPTION
    Starts the Next.js development server and opens the browser automatically.
    Dynamically detects the actual port used by the server (Next.js may switch
    to a different port if the default port 3000 is occupied).
.PARAMETER NoBrowser
    Skip opening the browser automatically.
.PARAMETER Clean
    Clean the .next cache before starting.
.EXAMPLE
    .\start-dev.ps1
    .\start-dev.ps1 -Clean
    .\start-dev.ps1 -NoBrowser
#>

param(
    [switch]$NoBrowser,
    [switch]$Clean
)

# Fix Unicode output (✓ ▲ ● etc.) — set console to UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorActionPreference = "Stop"

# Project root directory
$ProjectRoot = $PSScriptRoot
if (-not $ProjectRoot) {
    $ProjectRoot = Get-Location
}

Write-Host ""
Write-Host "🚀 TheHiggs Development Server" -ForegroundColor Cyan
Write-Host "══════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check if package.json exists
$PackageJsonPath = Join-Path $ProjectRoot "package.json"
if (-not (Test-Path $PackageJsonPath)) {
    Write-Host "❌ Error: package.json not found in $ProjectRoot" -ForegroundColor Red
    exit 1
}

# Check if node_modules exists, install if needed
$NodeModulesPath = Join-Path $ProjectRoot "node_modules"
if (-not (Test-Path $NodeModulesPath)) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    Push-Location $ProjectRoot
    npm install
    Pop-Location
    Write-Host ""
}

# Clean .next cache if requested
if ($Clean) {
    $NextDir = Join-Path $ProjectRoot ".next"
    if (Test-Path $NextDir) {
        Write-Host "🧹 Cleaning .next cache..." -ForegroundColor Yellow
        Remove-Item -Recurse -Force $NextDir
        Write-Host "✅ Cache cleaned" -ForegroundColor Green
        Write-Host ""
    }
}

Write-Host "📍 Project : $ProjectRoot" -ForegroundColor Gray
Write-Host ""
Write-Host "══════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Start the development server in a job to capture output
Write-Host "⏳ Starting server..." -ForegroundColor Yellow

$ServerJob = Start-Job -ScriptBlock {
    param($ProjectPath)
    # Fix Unicode output in background job
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
    $env:PYTHONIOENCODING = "utf-8"
    Set-Location $ProjectPath
    & npm run dev 2>&1
} -ArgumentList $ProjectRoot

# Wait for server to output its URL and detect the actual port
$ActualPort = $null
$MaxWaitSeconds = 60
$Elapsed = 0
$BrowserOpened = $false

while ($Elapsed -lt $MaxWaitSeconds) {
    Start-Sleep -Milliseconds 500
    $Elapsed += 0.5

    # Check if job failed
    if ($ServerJob.State -eq "Failed") {
        Write-Host "❌ Server failed to start" -ForegroundColor Red
        Receive-Job -Job $ServerJob
        Remove-Job -Job $ServerJob -Force
        exit 1
    }

    # Receive new output from the job
    $NewOutput = Receive-Job -Job $ServerJob -ErrorAction SilentlyContinue
    if ($NewOutput) {
        # Print server output to console
        foreach ($Line in $NewOutput) {
            Write-Host $Line
        }

        # Try to detect port from output
        $OutputText = ($NewOutput | Out-String)
        if ($OutputText -match 'Local:\s+https?://localhost:(\d+)') {
            $ActualPort = [int]$Matches[1]
            Write-Host ""
            Write-Host "✅ Detected server on port $ActualPort" -ForegroundColor Green
        }
    }

    # Once port is detected, wait for HTTP readiness then open browser
    if ($ActualPort -and -not $BrowserOpened) {
        $Url = "http://localhost:$ActualPort"

        # Quick readiness check
        try {
            $Response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($Response.StatusCode -eq 200) {
                Write-Host "✅ Server is ready!" -ForegroundColor Green

                if (-not $NoBrowser) {
                    Write-Host "🌐 Opening browser at $Url..." -ForegroundColor Cyan
                    Start-Process $Url
                }

                Write-Host ""
                Write-Host "══════════════════════════════" -ForegroundColor Cyan
                Write-Host "🎉 TheHiggs is running!" -ForegroundColor Green
                Write-Host "   URL: $Url" -ForegroundColor White
                Write-Host "   Press Ctrl+C to stop the server" -ForegroundColor Yellow
                Write-Host "══════════════════════════════" -ForegroundColor Cyan
                Write-Host ""

                $BrowserOpened = $true
            }
        }
        catch {
            # Not ready yet, keep waiting
        }
    }

    # If browser opened, just keep streaming output
    if ($BrowserOpened) {
        continue
    }
}

if (-not $ActualPort) {
    Write-Host "❌ Failed to detect server port within $MaxWaitSeconds seconds" -ForegroundColor Red
    Stop-Job -Job $ServerJob -ErrorAction SilentlyContinue
    Remove-Job -Job $ServerJob -Force -ErrorAction SilentlyContinue
    exit 1
}

# Keep streaming server output until Ctrl+C
try {
    while ($ServerJob.State -eq "Running") {
        $MoreOutput = Receive-Job -Job $ServerJob -ErrorAction SilentlyContinue
        if ($MoreOutput) {
            foreach ($Line in $MoreOutput) {
                Write-Host $Line
            }
        }
        Start-Sleep -Milliseconds 200
    }

    Write-Host ""
    Write-Host "⚠️  Server stopped unexpectedly" -ForegroundColor Yellow
    Receive-Job -Job $ServerJob -ErrorAction SilentlyContinue
}
finally {
    Write-Host ""
    Write-Host "🛑 Stopping server..." -ForegroundColor Yellow
    Stop-Job -Job $ServerJob -ErrorAction SilentlyContinue
    Remove-Job -Job $ServerJob -Force -ErrorAction SilentlyContinue
    Write-Host "✅ Server stopped." -ForegroundColor Green
}
