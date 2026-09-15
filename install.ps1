# One-command setup for Windows: generates .env with a random DB password if
# missing, then builds and starts everything with Docker Compose.
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

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"

    $bytes = New-Object byte[] 16
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $password = -join ($bytes | ForEach-Object { $_.ToString("x2") })

    (Get-Content ".env") -replace '^DB_PASSWORD=.*', "DB_PASSWORD=$password" | Set-Content ".env"

    Write-Host "Created .env with a randomly generated database password."
    Write-Host "Edit .env now if you want to change ports, CORS origin, or add a TURN server."
}

docker compose up -d --build

Write-Host ""
Write-Host "Rumo is starting."
Write-Host "  Frontend: http://localhost:5173"
Write-Host "  Backend health check: http://localhost:5000/health"
Write-Host ""
Write-Host "Watch logs:  docker compose logs -f"
Write-Host "Stop:        docker compose down"
