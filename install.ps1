# One-command setup for Windows: generates .env with random secrets for
# whatever isn't already set, optionally wires up a domain with automatic
# HTTPS via Caddy, then builds and starts everything with Docker Compose.
#
# Usage:
#   .\install.ps1
#   .\install.ps1 -Domain meet.example.com -Yes
param(
    [string]$Domain = "",
    [switch]$Yes
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker is required. Install Docker Desktop from https://docs.docker.com/get-docker/ and re-run this script."
    exit 1
}

try {
    docker compose version | Out-Null
} catch {
    Write-Error "Docker Compose v2 ('docker compose') is required (it ships with recent Docker Desktop)."
    exit 1
}

function New-RandomHex($bytes) {
    $buf = New-Object byte[] $bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buf)
    return -join ($buf | ForEach-Object { $_.ToString("x2") })
}

# Sets KEY=value in .env, replacing an existing line for KEY if there is one
# and appending it otherwise. Safe to call on a partially-filled .env from an
# earlier run of this script.
function Set-EnvVar($key, $value) {
    $content = Get-Content ".env"
    if ($content -match "^$key=") {
        ($content -replace "^$key=.*", "$key=$value") | Set-Content ".env"
    } else {
        Add-Content ".env" "$key=$value"
    }
}

function Get-EnvVar($key) {
    $line = Select-String -Path ".env" -Pattern "^$key=" -ErrorAction SilentlyContinue
    if ($line) { return ($line.Line -split "=", 2)[1] }
    return ""
}

# Only touches KEY if it's currently unset or still the .env.example placeholder.
function Set-EnvSecret($key) {
    $current = Get-EnvVar $key
    if ([string]::IsNullOrEmpty($current) -or $current -eq "change-me") {
        Set-EnvVar $key (New-RandomHex 16)
    }
}

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env from .env.example."
}

Set-EnvSecret "DB_PASSWORD"
Set-EnvSecret "ADMIN_SETUP_TOKEN"

$existingDomain = Get-EnvVar "DOMAIN"
$domainValue = ""
if ($Domain) {
    $domainValue = $Domain
} elseif ($existingDomain) {
    $domainValue = $existingDomain
} elseif (-not $Yes) {
    $domainValue = Read-Host "Domain name for automatic HTTPS (leave blank to use http://localhost)"
}

$composeProfileArgs = @()
if ($domainValue) {
    Set-EnvVar "DOMAIN" $domainValue
    Set-EnvVar "BIND_ADDR" "127.0.0.1"
    Set-EnvVar "CORS_ORIGIN" "https://$domainValue"
    Set-EnvVar "VITE_API_URL" "https://$domainValue"
    Set-EnvVar "VITE_SOCKET_URL" "https://$domainValue"
    $composeProfileArgs = @("--profile", "proxy")

    Write-Host ""
    Write-Host "Point $domainValue's DNS A record at this server's public IP before continuing,"
    Write-Host "or Caddy won't be able to get a certificate."
} else {
    Set-EnvVar "BIND_ADDR" "0.0.0.0"
}

$adminToken = Get-EnvVar "ADMIN_SETUP_TOKEN"

# --- Firewall (best-effort, Windows Firewall only) --------------------------
# Only ever adds allow rules for the ports this deployment needs, and only if
# the Windows Firewall service is actually running - never touches or
# removes anything else. Adding a rule needs an elevated (Administrator)
# PowerShell; if this isn't one, it's skipped with a note rather than
# re-launching itself elevated.
$firewallService = Get-Service -Name "MpsSvc" -ErrorAction SilentlyContinue
if ($firewallService -and $firewallService.Status -eq "Running") {
    $isElevated = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if ($isElevated) {
        $portsToOpen = @()
        if ($domainValue) {
            $portsToOpen = @(@{Port = 80; Name = "Rumo HTTP/ACME"}, @{Port = 443; Name = "Rumo HTTPS"})
        } else {
            $backendPort = Get-EnvVar "BACKEND_PORT"
            $frontendPort = Get-EnvVar "FRONTEND_PORT"
            if ([string]::IsNullOrEmpty($backendPort)) { $backendPort = 5000 }
            if ([string]::IsNullOrEmpty($frontendPort)) { $frontendPort = 5173 }
            $portsToOpen = @(@{Port = [int]$backendPort; Name = "Rumo backend"}, @{Port = [int]$frontendPort; Name = "Rumo frontend"})
        }
        Write-Host "Windows Firewall is running - opening the ports this deployment needs..."
        foreach ($p in $portsToOpen) {
            if (-not (Get-NetFirewallRule -DisplayName $p.Name -ErrorAction SilentlyContinue)) {
                try {
                    New-NetFirewallRule -DisplayName $p.Name -Direction Inbound -Protocol TCP -LocalPort $p.Port -Action Allow -ErrorAction Stop | Out-Null
                } catch {
                    Write-Host "  Could not add a firewall rule for port $($p.Port): $_"
                }
            }
        }
    } else {
        Write-Host "Skipping firewall rules (this PowerShell isn't running as Administrator) - open the needed ports yourself if Windows Firewall blocks them."
    }
}

docker compose @composeProfileArgs up -d --build

Write-Host ""
if ($domainValue) {
    Write-Host "Rumo is starting at https://$domainValue (the certificate may take a minute on first run)."
    Write-Host "Admin panel: https://$domainValue/admin"
} else {
    Write-Host "Rumo is starting."
    Write-Host "  Frontend: http://localhost:5173"
    Write-Host "  Backend health check: http://localhost:5000/health"
    Write-Host "  Admin panel: http://localhost:5173/admin"
}
Write-Host "  Admin token: $adminToken (also saved in .env as ADMIN_SETUP_TOKEN)"
Write-Host ""
Write-Host "Watch logs:  docker compose logs -f"
Write-Host "Stop:        docker compose down"
