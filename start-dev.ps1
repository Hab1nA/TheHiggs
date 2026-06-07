<#
.SYNOPSIS
    TheHiggs Development Server Quick Start Script
.DESCRIPTION
    Starts the Next.js development server and opens the browser automatically.
    Automatically detects and terminates stale server processes on the target
    port to prevent port conflicts (which cause localStorage origin mismatch
    and break AI mode settings persistence).
.PARAMETER NoBrowser
    Skip opening the browser automatically.
.PARAMETER Clean
    Clean the .next cache before starting.
.PARAMETER Port
    Target port for the dev server (default: 3000). The script will check
    and clean up any existing process on this port before starting.
.PARAMETER NoKill
    Do not automatically kill stale processes. If the port is occupied,
    the script will prompt the user instead of auto-terminating.
.EXAMPLE
    .\start-dev.ps1
    .\start-dev.ps1 -Clean
    .\start-dev.ps1 -NoBrowser
    .\start-dev.ps1 -Port 3002
    .\start-dev.ps1 -NoKill
#>

param(
    [switch]$NoBrowser,
    [switch]$Clean,
    [int]$Port = 3000,
    [switch]$NoKill
)

# Fix Unicode output (✓ ▲ ● etc.) — set console to UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorActionPreference = "Stop"

# ── Port Lock Functions ────────────────────────────────────────

function Test-PortInUse {
    <#
    .SYNOPSIS
        Check if a TCP port is in use and return the owning process IDs.
    .OUTPUTS
        [int[]] — Array of PIDs listening on the port, or empty array if free.
    #>
    param([int]$TargetPort)

    try {
        $connections = Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction SilentlyContinue
        if ($connections) {
            return ($connections | Select-Object -ExpandProperty OwningProcess -Unique)
        }
    }
    catch {
        # Get-NetTCPConnection may fail on some systems; fall through
    }
    return @()
}

function Stop-StaleServer {
    <#
    .SYNOPSIS
        Kill node processes listening on the target port that belong to this project.
    .PARAMETER TargetPort
        The TCP port to check.
    .PARAMETER Force
        If $false, prompt the user before killing. If $true, kill silently.
    .OUTPUTS
        [bool] — $true if port is now free, $false if still occupied.
    #>
    param(
        [int]$TargetPort,
        [bool]$Force = $true
    )

    $pids = Test-PortInUse -TargetPort $TargetPort
    if ($pids.Count -eq 0) {
        return $true
    }

    # Identify which PIDs are node processes belonging to this project
    $projectPathNorm = $ProjectRoot.Replace('\', '/').ToLower()
    $toKill = @()

    foreach ($procId in $pids) {
        try {
            $proc = Get-Process -Id $procId -ErrorAction Stop
            $procName = $proc.ProcessName.ToLower()

            # Only target node-related processes
            if ($procName -notmatch '^(node|npm|next)$') {
                continue
            }

            # Verify the process belongs to this project via command line
            $cmdLine = ''
            try {
                $cim = Get-CimInstance Win32_Process -Filter "ProcessId = $procId" -ErrorAction Stop
                $cmdLine = ($cim.CommandLine ?? '').Replace('\', '/').ToLower()
            }
            catch {
                # Cannot query WMI; include the PID as a candidate anyway
            }

            if ($cmdLine -and $cmdLine.Contains($projectPathNorm)) {
                $toKill += [PSCustomObject]@{ PID = $procId; Process = $proc; CommandLine = $cmdLine }
            }
            elseif (-not $cmdLine) {
                # WMI unavailable; include if it's a node process on our port
                $toKill += [PSCustomObject]@{ PID = $procId; Process = $proc; CommandLine = '(unknown)' }
            }
        }
        catch {
            # Process already exited
        }
    }

    if ($toKill.Count -eq 0) {
        Write-Host "⚠️  Port $TargetPort is occupied by non-Node processes — skipping cleanup" -ForegroundColor Yellow
        return $false
    }

    # Display what will be killed
    Write-Host "" -ForegroundColor Yellow
    Write-Host "🔍 Found stale server process(es) on port ${TargetPort}:" -ForegroundColor Yellow
    foreach ($entry in $toKill) {
        $name = $entry.Process.ProcessName
        $startTime = $entry.Process.StartTime.ToString('yyyy-MM-dd HH:mm:ss')
        Write-Host "   PID $($entry.PID)  [$name]  started $startTime" -ForegroundColor Gray
        if ($entry.CommandLine -ne '(unknown)') {
            Write-Host "   CMD $($entry.CommandLine)" -ForegroundColor DarkGray
        }
    }

    # Prompt or auto-kill
    if (-not $Force) {
        Write-Host ""
        $answer = Read-Host "Kill these process(es)? [y/N]"
        if ($answer -notin @('y', 'Y', 'yes', 'Yes')) {
            Write-Host "⏭️  Skipping cleanup. New server may use a different port." -ForegroundColor Yellow
            return $false
        }
    }

    foreach ($entry in $toKill) {
        try {
            Stop-Process -Id $entry.PID -Force -ErrorAction Stop
            Write-Host "🛑 Killed PID $($entry.PID) ($($entry.Process.ProcessName))" -ForegroundColor Red
        }
        catch {
            Write-Host "⚠️  Failed to kill PID $($entry.PID): $_" -ForegroundColor Yellow
        }
    }

    # Wait for port to be released
    $retries = 0
    while ($retries -lt 10) {
        Start-Sleep -Milliseconds 500
        $remaining = Test-PortInUse -TargetPort $TargetPort
        if ($remaining.Count -eq 0) {
            Write-Host "✅ Port $TargetPort is now free" -ForegroundColor Green
            return $true
        }
        $retries++
    }

    Write-Host "⚠️  Port $TargetPort still occupied after 5s — it may take a moment to release" -ForegroundColor Yellow
    return $false
}

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

# ── Port Lock: detect and clean stale server ───────────────────

Write-Host "🔒 Port lock check: port $Port" -ForegroundColor Gray
$portFree = Stop-StaleServer -TargetPort $Port -Force:(-not $NoKill)
if (-not $portFree -and -not $NoKill) {
    # Should not reach here (Force=true always resolves), but safety fallback
    Write-Host "❌ Cannot proceed — port $Port is still occupied" -ForegroundColor Red
    exit 1
}

Write-Host "📍 Project : $ProjectRoot" -ForegroundColor Gray
Write-Host "🎯 Port    : $Port" -ForegroundColor Gray
Write-Host ""
Write-Host "══════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Start the development server in a job to capture output
Write-Host "⏳ Starting server..." -ForegroundColor Yellow

$ServerJob = Start-Job -ScriptBlock {
    param($ProjectPath, $ServerPort)
    # Fix Unicode output in background job
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
    $env:PYTHONIOENCODING = "utf-8"
    Set-Location $ProjectPath
    & npm run dev -- --port $ServerPort 2>&1
} -ArgumentList $ProjectRoot, $Port

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

                # Write PID file for stale-process detection on next launch
                $NextDir = Join-Path $ProjectRoot ".next"
                if (-not (Test-Path $NextDir)) {
                    New-Item -ItemType Directory -Path $NextDir -Force | Out-Null
                }
                $PidFile = Join-Path $NextDir "server.pid"
                # Find the actual node process listening on this port
                $serverPids = Test-PortInUse -TargetPort $ActualPort
                $serverPid = if ($serverPids.Count -gt 0) { $serverPids[0] } else { $ServerJob.Id }
                "PID=$serverPid;PORT=$ActualPort;STARTED=$(Get-Date -Format 'o')" |
                    Set-Content -Path $PidFile -Encoding utf8 -Force

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

    # Clean up PID file
    $PidFile = Join-Path $ProjectRoot ".next\server.pid"
    if (Test-Path $PidFile) {
        Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue
    }

    Write-Host "✅ Server stopped." -ForegroundColor Green
}
