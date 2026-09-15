#!/usr/bin/env bash
# One-command setup: generates .env with a random DB password if missing,
# then builds and starts everything with Docker Compose.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if ! command -v docker &> /dev/null; then
  echo "Docker is required. Install it from https://docs.docker.com/get-docker/ and re-run this script." >&2
  exit 1
fi

if ! docker compose version &> /dev/null; then
  echo "Docker Compose v2 ('docker compose') is required (it ships with recent Docker Desktop/Engine)." >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env

  if command -v openssl &> /dev/null; then
    PASSWORD=$(openssl rand -hex 16)
  else
    PASSWORD=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')
  fi

  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s/^DB_PASSWORD=.*/DB_PASSWORD=${PASSWORD}/" .env
  else
    sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=${PASSWORD}/" .env
  fi

  echo "Created .env with a randomly generated database password."
  echo "Edit .env now if you want to change ports, CORS origin, or add a TURN server."
fi

docker compose up -d --build

cat <<EOF

Rumo is starting.
  Frontend: http://localhost:5173
  Backend health check: http://localhost:5000/health

Watch logs:  docker compose logs -f
Stop:        docker compose down
EOF
