#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

BACKEND_ENV="$ROOT_DIR/backend/.env"
LOG_DIR="$ROOT_DIR/.dev-logs"
CLOUDFLARED_LOG_FILE="$LOG_DIR/cloudflared-backend.log"
BACKEND_LOG_FILE="$LOG_DIR/backend-only.log"

BACKEND_PID=""
CLOUDFLARED_PID=""

log() {
  printf '[backend-tunnel] %s\n' "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

ensure_command() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || fail "'$cmd' is required but not found in PATH."
}

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM

  for pid in "$BACKEND_PID" "$CLOUDFLARED_PID"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done

  exit "$exit_code"
}

trap cleanup EXIT INT TERM

ensure_command npm
ensure_command cloudflared

mkdir -p "$LOG_DIR"
rm -f "$CLOUDFLARED_LOG_FILE" "$BACKEND_LOG_FILE"

# Extract port from .env or default to 5000
BACKEND_PORT=5000
if [ -f "$BACKEND_ENV" ]; then
  PORT_OVERRIDE=$(awk -F= '$1=="PORT"{print $2}' "$BACKEND_ENV" | tr -d '\r' | tail -n 1)
  if [ -n "$PORT_OVERRIDE" ]; then
    BACKEND_PORT="$PORT_OVERRIDE"
  fi
fi

log "Starting Cloudflare tunnel for backend port ${BACKEND_PORT}..."
cloudflared tunnel \
  --no-autoupdate \
  --url "http://127.0.0.1:${BACKEND_PORT}" >"$CLOUDFLARED_LOG_FILE" 2>&1 &
CLOUDFLARED_PID=$!

wait_for_cloudflare_url() {
  local public_url=""
  for _ in {1..90}; do
    if [ -f "$CLOUDFLARED_LOG_FILE" ]; then
      public_url="$(grep -Eo 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$CLOUDFLARED_LOG_FILE" | tail -n 1 || true)"
      if [ -n "$public_url" ]; then
        printf '%s\n' "$public_url"
        return 0
      fi
    fi
    if [ -n "$CLOUDFLARED_PID" ] && ! kill -0 "$CLOUDFLARED_PID" 2>/dev/null; then
      break
    fi
    sleep 1
  done
  return 1
}

CLOUDFLARE_PUBLIC_URL="$(wait_for_cloudflare_url || true)"
[ -n "$CLOUDFLARE_PUBLIC_URL" ] || fail "Could not read Cloudflare tunnel URL. Is cloudflared working? Check $CLOUDFLARED_LOG_FILE"

# Make sure the backend config knows about this new Cloudflare URL so CORS works correctly
export PUBLIC_HOSTS="${CLOUDFLARE_PUBLIC_URL#https://}"

log "Starting backend..."
npm run dev --workspace backend >"$BACKEND_LOG_FILE" 2>&1 &
BACKEND_PID=$!

echo ""
log "✅ Backend and Tunnel are successfully running!"
echo "--------------------------------------------------------"
echo "  Backend Local URL:  http://localhost:${BACKEND_PORT}"
echo "  Public API URL:     ${CLOUDFLARE_PUBLIC_URL}"
echo "--------------------------------------------------------"
echo "  (Use the Public API URL inside your frontend's .env \`VITE_API_BASE_URL\` block)"
echo ""
echo "  Logs:"
echo "    Tunnel logs:  ${CLOUDFLARED_LOG_FILE}"
echo "    Backend logs: ${BACKEND_LOG_FILE}"
echo ""
echo "Press Ctrl+C to stop both processes safely."

wait -n "$BACKEND_PID" "$CLOUDFLARED_PID" || true
