#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

BACKEND_ENV="$ROOT_DIR/backend/.env"
BACKEND_ENV_EXAMPLE="$ROOT_DIR/backend/.env.example"
FRONTEND_ENV="$ROOT_DIR/frontend/.env"
FRONTEND_ENV_EXAMPLE="$ROOT_DIR/frontend/.env.example"
LOG_DIR="$ROOT_DIR/.dev-logs"
NGINX_TEMPLATE="$ROOT_DIR/ops/nginx/nginx.dev.conf.template"
NGINX_CONFIG_FILE="$LOG_DIR/nginx.dev.conf"
NGINX_CACHE_DIR="$LOG_DIR/nginx-cache"
CLOUDFLARED_LOG_FILE="$LOG_DIR/cloudflared-nginx.log"

BACKEND_PID=""
NGINX_PID=""
CLOUDFLARED_PID=""
CLOUDFLARE_PUBLIC_URL=""

log() {
  printf '[super-dev-nginx] %s\n' "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

ensure_command() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || fail "'$cmd' is required but not found in PATH."
}

ensure_env_file() {
  local file="$1"
  local example="$2"
  if [ ! -f "$file" ] && [ -f "$example" ]; then
    cp "$example" "$file"
    log "Created $(basename "$file") from $(basename "$example")."
  fi
}

read_env_value() {
  local file="$1"
  local key="$2"
  local fallback="$3"

  if [ ! -f "$file" ]; then
    printf '%s\n' "$fallback"
    return
  fi

  local value
  value="$(
    awk -F= -v env_key="$key" '$1 == env_key {sub(/^[^=]*=/, "", $0); print $0}' "$file" \
      | tail -n 1 \
      | tr -d '\r'
  )"

  if [ -z "$value" ]; then
    printf '%s\n' "$fallback"
    return
  fi

  value="${value%\"}"
  value="${value#\"}"
  printf '%s\n' "$value"
}

upsert_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  local escaped_value
  escaped_value="$(printf '%s' "$value" | sed -e 's/[\/&]/\\&/g')"

  touch "$file"
  if grep -q "^${key}=" "$file"; then
    sed -i "s/^${key}=.*/${key}=${escaped_value}/" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >>"$file"
  fi
}

escape_sed_replacement() {
  printf '%s' "$1" | sed -e 's/[\/&]/\\&/g'
}

get_lan_ip() {
  local lan_ip
  lan_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  if [ -z "$lan_ip" ] && command -v ip >/dev/null 2>&1; then
    lan_ip="$(
      ip route get 1.1.1.1 2>/dev/null \
        | awk '/src/ {for (i = 1; i <= NF; i++) if ($i == "src") {print $(i + 1); exit}}'
    )"
  fi
  if [ -z "$lan_ip" ]; then
    lan_ip="127.0.0.1"
  fi
  printf '%s\n' "$lan_ip"
}

port_in_use() {
  local port="$1"
  local ss_output

  if command -v ss >/dev/null 2>&1; then
    if ss_output="$(ss -ltn "sport = :${port}" 2>/dev/null)"; then
      if printf '%s\n' "$ss_output" | awk 'NR > 1 {found = 1} END {exit found ? 0 : 1}'; then
        return 0
      fi
    fi
  fi

  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"${port}" -sTCP:LISTEN -t >/dev/null 2>&1
    return $?
  fi

  return 1
}

wait_for_service() {
  local service_name="$1"
  local url="$2"
  local pid="$3"
  local attempts="${4:-60}"
  local log_file="$5"

  for _ in $(seq 1 "$attempts"); do
    if ! kill -0 "$pid" 2>/dev/null; then
      log "${service_name} process exited before becoming ready."
      if [ -f "$log_file" ]; then
        tail -n 40 "$log_file" || true
      fi
      return 1
    fi

    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  log "${service_name} did not become ready at ${url}."
  return 1
}

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

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM

  for pid in "$NGINX_PID" "$BACKEND_PID" "$CLOUDFLARED_PID"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done

  wait 2>/dev/null || true
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

ensure_command npm
ensure_command nginx
ensure_command curl

ENABLE_CLOUDFLARE="${ENABLE_CLOUDFLARE:-1}"
if [ "$ENABLE_CLOUDFLARE" = "1" ]; then
  ensure_command cloudflared
fi

[ -f "$NGINX_TEMPLATE" ] || fail "Missing nginx template at $NGINX_TEMPLATE"

mkdir -p "$LOG_DIR" "$NGINX_CACHE_DIR"
ensure_env_file "$BACKEND_ENV" "$BACKEND_ENV_EXAMPLE"
ensure_env_file "$FRONTEND_ENV" "$FRONTEND_ENV_EXAMPLE"

BACKEND_PORT="${PORT:-$(read_env_value "$BACKEND_ENV" "PORT" "5000")}"
BACKEND_HOST="${HOST:-$(read_env_value "$BACKEND_ENV" "HOST" "0.0.0.0")}"
NGINX_PORT="${NGINX_PORT:-8080}"
LAN_IP="${LAN_IP_OVERRIDE:-$(get_lan_ip)}"

if [ "$BACKEND_PORT" = "$NGINX_PORT" ]; then
  fail "Backend and Nginx ports must be different. Set PORT and NGINX_PORT."
fi

if port_in_use "$BACKEND_PORT"; then
  fail "Port ${BACKEND_PORT} is already in use. Stop that process or run with PORT=<free-port>."
fi

if port_in_use "$NGINX_PORT"; then
  fail "Port ${NGINX_PORT} is already in use. Stop that process or run with NGINX_PORT=<free-port>."
fi

if [ "$ENABLE_CLOUDFLARE" = "1" ]; then
  log "Starting Cloudflare tunnel for Nginx port ${NGINX_PORT}..."
  rm -f "$CLOUDFLARED_LOG_FILE"
  cloudflared tunnel \
    --no-autoupdate \
    --url "http://127.0.0.1:${NGINX_PORT}" >"$CLOUDFLARED_LOG_FILE" 2>&1 &
  CLOUDFLARED_PID=$!

  CLOUDFLARE_PUBLIC_URL="$(wait_for_cloudflare_url || true)"
  [ -n "$CLOUDFLARE_PUBLIC_URL" ] || fail "Could not read Cloudflare URL. Check $CLOUDFLARED_LOG_FILE"
fi

CORS_ORIGINS="http://localhost:${NGINX_PORT},http://127.0.0.1:${NGINX_PORT},http://${LAN_IP}:${NGINX_PORT}"
if [ -n "$CLOUDFLARE_PUBLIC_URL" ]; then
  CORS_ORIGINS="${CORS_ORIGINS},${CLOUDFLARE_PUBLIC_URL}"
fi
upsert_env_value "$BACKEND_ENV" "HOST" "$BACKEND_HOST"
upsert_env_value "$BACKEND_ENV" "PORT" "$BACKEND_PORT"
upsert_env_value "$BACKEND_ENV" "CORS_ORIGINS" "$CORS_ORIGINS"

upsert_env_value "$FRONTEND_ENV" "VITE_API_BASE_URL" "/api"
if [ -n "$CLOUDFLARE_PUBLIC_URL" ]; then
  upsert_env_value "$FRONTEND_ENV" "VITE_PUBLIC_PREVIEW_URL" "$CLOUDFLARE_PUBLIC_URL"
fi

export HOST="$BACKEND_HOST"
export PORT="$BACKEND_PORT"
export BACKEND_PORT="$BACKEND_PORT"
export CORS_ORIGINS="$CORS_ORIGINS"

if [ "${SKIP_INSTALL:-0}" != "1" ] && [ ! -d "$ROOT_DIR/node_modules" ]; then
  log "Installing dependencies..."
  npm install
else
  log "Skipping npm install (set SKIP_INSTALL=0 to force install)."
fi

log "Building frontend production bundle..."
if ! npm run build --workspace frontend >"$LOG_DIR/frontend-build.log" 2>&1; then
  tail -n 80 "$LOG_DIR/frontend-build.log" || true
  fail "Frontend build failed. See $LOG_DIR/frontend-build.log"
fi

log "Starting backend..."
npm run start --workspace backend >"$LOG_DIR/backend-nginx.log" 2>&1 &
BACKEND_PID=$!

wait_for_service "Backend" "http://127.0.0.1:${BACKEND_PORT}/health" "$BACKEND_PID" 90 "$LOG_DIR/backend-nginx.log" \
  || fail "Backend did not become healthy. See $LOG_DIR/backend-nginx.log"

ROOT_ESCAPED="$(escape_sed_replacement "$ROOT_DIR")"
LOG_ESCAPED="$(escape_sed_replacement "$LOG_DIR")"
CACHE_ESCAPED="$(escape_sed_replacement "$NGINX_CACHE_DIR")"

sed \
  -e "s/__ROOT_DIR__/${ROOT_ESCAPED}/g" \
  -e "s/__LOG_DIR__/${LOG_ESCAPED}/g" \
  -e "s/__CACHE_DIR__/${CACHE_ESCAPED}/g" \
  -e "s/__BACKEND_PORT__/${BACKEND_PORT}/g" \
  -e "s/__NGINX_PORT__/${NGINX_PORT}/g" \
  "$NGINX_TEMPLATE" >"$NGINX_CONFIG_FILE"

log "Starting Nginx accelerator..."
nginx -c "$NGINX_CONFIG_FILE" -p "$ROOT_DIR" -g 'daemon off;' >"$LOG_DIR/nginx.log" 2>&1 &
NGINX_PID=$!

wait_for_service "Nginx" "http://127.0.0.1:${NGINX_PORT}/health" "$NGINX_PID" 60 "$LOG_DIR/nginx.log" \
  || fail "Nginx did not start. See $LOG_DIR/nginx.log"

echo ""
log "Services are running:"
echo "  App local:           http://localhost:${NGINX_PORT}"
echo "  App LAN:             http://${LAN_IP}:${NGINX_PORT}"
echo "  Backend local:       http://localhost:${BACKEND_PORT}"
if [ -n "$CLOUDFLARE_PUBLIC_URL" ]; then
  echo "  Cloudflare preview:  ${CLOUDFLARE_PUBLIC_URL}"
fi
echo ""
echo "  Logs:"
echo "    frontend build:    ${LOG_DIR}/frontend-build.log"
echo "    backend:           ${LOG_DIR}/backend-nginx.log"
echo "    nginx stdout:      ${LOG_DIR}/nginx.log"
echo "    nginx access:      ${LOG_DIR}/nginx-access.log"
echo "    nginx error:       ${LOG_DIR}/nginx-error.log"
if [ -n "$CLOUDFLARED_PID" ]; then
  echo "    cloudflared:       ${CLOUDFLARED_LOG_FILE}"
fi
echo ""

set +e
if [ -n "$CLOUDFLARED_PID" ]; then
  wait -n "$BACKEND_PID" "$NGINX_PID" "$CLOUDFLARED_PID"
else
  wait -n "$BACKEND_PID" "$NGINX_PID"
fi
child_exit_code=$?
set -e

if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  log "Backend process exited unexpectedly. Tail of backend log:"
  tail -n 40 "$LOG_DIR/backend-nginx.log" || true
fi

if ! kill -0 "$NGINX_PID" 2>/dev/null; then
  log "Nginx process exited unexpectedly. Tail of nginx log:"
  tail -n 40 "$LOG_DIR/nginx.log" || true
  if [ -f "$LOG_DIR/nginx-error.log" ]; then
    tail -n 40 "$LOG_DIR/nginx-error.log" || true
  fi
fi

if [ -n "$CLOUDFLARED_PID" ] && ! kill -0 "$CLOUDFLARED_PID" 2>/dev/null; then
  log "Cloudflared process exited unexpectedly. Tail of cloudflared log:"
  tail -n 40 "$CLOUDFLARED_LOG_FILE" || true
fi

exit "$child_exit_code"
