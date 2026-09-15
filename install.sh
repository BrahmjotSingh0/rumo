#!/usr/bin/env bash
# One-command setup for Linux/macOS: installs Docker if it's missing (Ubuntu/
# Debian only - other distros get a link), generates .env with random
# secrets for whatever isn't already set, optionally wires up a domain with
# automatic HTTPS via Caddy, then builds and starts everything.
#
# Usage:
#   ./install.sh                          interactive
#   ./install.sh --domain meet.example.com --email you@example.com --yes
#
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

DOMAIN_ARG=""
ASSUME_YES=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN_ARG="${2:-}"; shift 2 ;;
    --yes|-y) ASSUME_YES=true; shift ;;
    -h|--help)
      echo "Usage: $0 [--domain example.com] [--yes]"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

random_hex() {
  if command -v openssl &> /dev/null; then
    openssl rand -hex "$1"
  else
    head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

# Sets KEY=value in .env, replacing an existing line for KEY if there is one
# and appending it otherwise. Safe to call on a partially-filled .env from an
# earlier run of this script.
set_env_var() {
  local key="$1" value="$2"
  if grep -q "^${key}=" .env 2>/dev/null; then
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' "s|^${key}=.*|${key}=${value}|" .env
    else
      sed -i "s|^${key}=.*|${key}=${value}|" .env
    fi
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

# Only touches KEY if it's currently unset or still the .env.example placeholder.
ensure_secret() {
  local key="$1"
  local current
  current=$(grep "^${key}=" .env 2>/dev/null | cut -d= -f2-)
  if [[ -z "$current" || "$current" == "change-me" ]]; then
    set_env_var "$key" "$(random_hex 16)"
  fi
}

# --- Docker ---------------------------------------------------------------

install_docker_ubuntu_debian() {
  echo "Docker (with the Compose plugin) was not found."
  if [ "$ASSUME_YES" = false ]; then
    if [ ! -t 0 ]; then
      echo "Re-run with --yes to install Docker automatically, or install it yourself: https://docs.docker.com/get-docker/" >&2
      exit 1
    fi
    read -rp "Install Docker now using the official get.docker.com script? [y/N] " reply
    case "$reply" in
      [yY]*) ;;
      *) echo "Install Docker yourself from https://docs.docker.com/get-docker/ and re-run this script." >&2; exit 1 ;;
    esac
  fi

  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" 2>/dev/null || true
  echo "Docker installed."
}

if ! command -v docker &> /dev/null || ! docker compose version &> /dev/null; then
  DISTRO_ID=""
  DISTRO_ID_LIKE=""
  if [ -f /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    DISTRO_ID="${ID:-}"
    DISTRO_ID_LIKE="${ID_LIKE:-}"
  fi

  if [[ "$DISTRO_ID" == "ubuntu" || "$DISTRO_ID" == "debian" || "$DISTRO_ID_LIKE" == *debian* ]]; then
    install_docker_ubuntu_debian
  else
    echo "Docker with the Compose plugin is required. Install it from https://docs.docker.com/get-docker/ and re-run this script." >&2
    exit 1
  fi
fi

# A user just added to the docker group by this same run isn't in that group
# in the current shell session yet, so fall back to sudo for this run only.
DOCKER_COMPOSE="docker compose"
if ! docker info &> /dev/null; then
  DOCKER_COMPOSE="sudo docker compose"
fi

# --- .env -------------------------------------------------------------------

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example."
fi

ensure_secret DB_PASSWORD
ensure_secret ADMIN_SETUP_TOKEN

EXISTING_DOMAIN=$(grep "^DOMAIN=" .env 2>/dev/null | cut -d= -f2-)

if [ -n "$DOMAIN_ARG" ]; then
  DOMAIN_VALUE="$DOMAIN_ARG"
elif [ -n "$EXISTING_DOMAIN" ]; then
  DOMAIN_VALUE="$EXISTING_DOMAIN"
elif [ -t 0 ] && [ "$ASSUME_YES" = false ]; then
  read -rp "Domain name for automatic HTTPS (leave blank to use http://localhost): " DOMAIN_VALUE
else
  DOMAIN_VALUE=""
fi

COMPOSE_PROFILE=()
if [ -n "$DOMAIN_VALUE" ]; then
  set_env_var DOMAIN "$DOMAIN_VALUE"
  set_env_var BIND_ADDR "127.0.0.1"
  set_env_var CORS_ORIGIN "https://${DOMAIN_VALUE}"
  set_env_var VITE_API_URL "https://${DOMAIN_VALUE}"
  set_env_var VITE_SOCKET_URL "https://${DOMAIN_VALUE}"
  COMPOSE_PROFILE=(--profile proxy)

  echo
  echo "Point ${DOMAIN_VALUE}'s DNS A record at this server's public IP before continuing,"
  echo "or Caddy won't be able to get a certificate."
else
  set_env_var BIND_ADDR "0.0.0.0"
fi

ADMIN_TOKEN=$(grep "^ADMIN_SETUP_TOKEN=" .env | cut -d= -f2-)

# --- Build and start ---------------------------------------------------------

$DOCKER_COMPOSE "${COMPOSE_PROFILE[@]}" up -d --build

echo
if [ -n "$DOMAIN_VALUE" ]; then
  echo "Rumo is starting at https://${DOMAIN_VALUE} (the certificate may take a minute on first run)."
  echo "Admin panel: https://${DOMAIN_VALUE}/admin"
else
  echo "Rumo is starting."
  echo "  Frontend: http://localhost:5173"
  echo "  Backend health check: http://localhost:5000/health"
  echo "  Admin panel: http://localhost:5173/admin"
fi
echo "  Admin token: ${ADMIN_TOKEN} (also saved in .env as ADMIN_SETUP_TOKEN)"
echo
echo "Watch logs:  $DOCKER_COMPOSE logs -f"
echo "Stop:        $DOCKER_COMPOSE down"
