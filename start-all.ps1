# Quick Start - All Servers
# Use $ScriptRoot instead of overwriting the automatic $PSScriptRoot variable
$ScriptRoot = if ($PSScriptRoot -ne '') { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Definition }
Set-Location $ScriptRoot

Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "  Sangrahak AI - Quick Start           " -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Cleaning up existing processes..." -ForegroundColor Yellow
taskkill /F /IM node.exe 2>$null | Out-Null
taskkill /F /IM python.exe 2>$null | Out-Null
Start-Sleep -Seconds 1

# Verify paths exist before starting
$aiPath     = Join-Path $ScriptRoot "Backend\code"
$serverPath = Join-Path $ScriptRoot "Backend\server"
$frontendPath = Join-Path $ScriptRoot "Frontend"

if (-not (Test-Path $aiPath))     { Write-Host "ERROR: AI path not found: $aiPath" -ForegroundColor Red; exit 1 }
if (-not (Test-Path $serverPath)) { Write-Host "ERROR: Server path not found: $serverPath" -ForegroundColor Red; exit 1 }
if (-not (Test-Path $frontendPath)){ Write-Host "ERROR: Frontend path not found: $frontendPath" -ForegroundColor Red; exit 1 }

Write-Host "Starting AI Server (Flask/Python on port 5001)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$aiPath'; python app.py"

Start-Sleep -Seconds 2

Write-Host "Starting Node.js Server (Express on port 5000)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$serverPath'; node server.js"

Start-Sleep -Seconds 2

Write-Host "Starting Frontend (Vite on port 5173)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$frontendPath'; npm run dev"

Write-Host ""
Write-Host "All servers started!" -ForegroundColor Green
Write-Host "  Frontend : http://localhost:5173" -ForegroundColor Cyan
Write-Host "  Node API : http://localhost:5000/api/health" -ForegroundColor Cyan
Write-Host "  AI API   : http://localhost:5001/api/health" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C in each terminal window to stop a server." -ForegroundColor DarkGray
