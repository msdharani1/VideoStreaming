#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"
DEFAULT_LAN_IP="192.168.1.19"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but not found in PATH."
  exit 1
fi

if [ ! -f "backend/.env" ] && [ -f "backend/.env.example" ]; then
  cp "backend/.env.example" "backend/.env"
  echo "Created backend/.env from backend/.env.example"
fi

if [ ! -f "frontend/.env" ] && [ -f "frontend/.env.example" ]; then
  cp "frontend/.env.example" "frontend/.env"
  echo "Created frontend/.env from frontend/.env.example"
fi

read_env_value() {
  local file="$1"
  local key="$2"
  local fallback="$3"

  if [ ! -f "$file" ]; then
    echo "$fallback"
    return
  fi

  local value
  value="$(grep -E "^${key}=" "$file" | tail -n 1 | cut -d '=' -f2- || true)"
  if [ -z "$value" ]; then
    echo "$fallback"
    return
  fi

  value="${value%\"}"
  value="${value#\"}"
  echo "$value"
}

BACKEND_PORT="${PORT:-$(read_env_value "backend/.env" "PORT" "5000")}"
FRONTEND_PORT="${VITE_PORT:-$(read_env_value "frontend/.env" "VITE_PORT" "5173")}"
BACKEND_HOST="${HOST:-0.0.0.0}"
FRONTEND_HOST="${VITE_HOST:-0.0.0.0}"
LAN_IP="${LAN_IP_OVERRIDE:-$DEFAULT_LAN_IP}"

export HOST="$BACKEND_HOST"
export PORT="$BACKEND_PORT"
export VITE_HOST="$FRONTEND_HOST"
export VITE_PORT="$FRONTEND_PORT"

if [ -z "${VITE_API_BASE_URL:-}" ]; then
  export VITE_API_BASE_URL="http://${LAN_IP}:${BACKEND_PORT}"
fi

if [ -z "${CORS_ORIGINS:-}" ]; then
  export CORS_ORIGINS="http://localhost:${FRONTEND_PORT},http://127.0.0.1:${FRONTEND_PORT},http://${LAN_IP}:${FRONTEND_PORT}"
fi

echo "Installing dependencies for root, backend, and frontend..."
npm install

echo ""
echo "Starting backend and frontend with LAN/mobile support"
echo "Backend (local):   http://localhost:${BACKEND_PORT}"
echo "Frontend (local):  http://localhost:${FRONTEND_PORT}"
echo "Frontend (mobile): http://${LAN_IP}:${FRONTEND_PORT}"
echo "Backend (LAN):     http://${LAN_IP}:${BACKEND_PORT}"
echo "Use the Frontend (mobile) URL on your phone (same Wi-Fi)."
echo "Set LAN_IP_OVERRIDE if your IP changes."
echo ""

npm run dev
