#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

BACKEND_ENV="$ROOT_DIR/backend/.env"
BACKEND_ENV_EXAMPLE="$ROOT_DIR/backend/.env.example"
FRONTEND_ENV="$ROOT_DIR/frontend/.env"
FRONTEND_ENV_EXAMPLE="$ROOT_DIR/frontend/.env.example"
LOG_DIR="$ROOT_DIR/.dev-logs"
CLOUDFLARED_LOG_FILE="$LOG_DIR/cloudflared.log"

BACKEND_PID=""
FRONTEND_PID=""
CLOUDFLARED_PID=""

log() {
  printf '[super-dev-cf] %s\n' "$*"
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

trim_value() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s\n' "$value"
}

add_csv_value() {
  local csv="$1"
  local value="$2"
  [ -z "$value" ] && { printf '%s\n' "$csv"; return; }
  case ",$csv," in
    *,"$value",*) printf '%s\n' "$csv" ;;
    *)
      if [ -n "$csv" ]; then
        printf '%s,%s\n' "$csv" "$value"
      else
        printf '%s\n' "$value"
      fi
      ;;
  esac
}

extract_host() {
  local value="$1"
  value="${value#http://}"
  value="${value#https://}"
  value="${value%%/*}"
  printf '%s\n' "$value"
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

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM

  for pid in "$FRONTEND_PID" "$BACKEND_PID" "$CLOUDFLARED_PID"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done

  wait 2>/dev/null || true
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

ensure_command npm
ensure_command curl
ensure_command cloudflared

mkdir -p "$LOG_DIR"
ensure_env_file "$BACKEND_ENV" "$BACKEND_ENV_EXAMPLE"
ensure_env_file "$FRONTEND_ENV" "$FRONTEND_ENV_EXAMPLE"

BACKEND_PORT="${PORT:-$(read_env_value "$BACKEND_ENV" "PORT" "5000")}"
FRONTEND_PORT="${VITE_PORT:-$(read_env_value "$FRONTEND_ENV" "VITE_PORT" "5173")}"
BACKEND_HOST="${HOST:-$(read_env_value "$BACKEND_ENV" "HOST" "0.0.0.0")}"
FRONTEND_HOST="${VITE_HOST:-$(read_env_value "$FRONTEND_ENV" "VITE_HOST" "0.0.0.0")}"
LAN_IP="${LAN_IP_OVERRIDE:-$(get_lan_ip)}"
PUBLIC_HOSTS_RAW="${PUBLIC_HOSTS:-}"

if [ "$BACKEND_PORT" = "$FRONTEND_PORT" ]; then
  fail "Backend and frontend ports must be different. Set PORT and VITE_PORT."
fi

if port_in_use "$BACKEND_PORT"; then
  fail "Port ${BACKEND_PORT} is already in use. Stop that process or run with PORT=<free-port>."
fi

if port_in_use "$FRONTEND_PORT"; then
  fail "Port ${FRONTEND_PORT} is already in use. Stop that process or run with VITE_PORT=<free-port>."
fi

log "Starting Cloudflare tunnel for frontend port ${FRONTEND_PORT}..."
rm -f "$CLOUDFLARED_LOG_FILE"
cloudflared tunnel \
  --no-autoupdate \
  --url "http://127.0.0.1:${FRONTEND_PORT}" >"$CLOUDFLARED_LOG_FILE" 2>&1 &
CLOUDFLARED_PID=$!

CLOUDFLARE_PUBLIC_URL="$(wait_for_cloudflare_url || true)"
[ -n "$CLOUDFLARE_PUBLIC_URL" ] || fail "Could not read Cloudflare URL. Check $CLOUDFLARED_LOG_FILE"
CLOUDFLARE_HOST="${CLOUDFLARE_PUBLIC_URL#https://}"
CLOUDFLARE_HOST="${CLOUDFLARE_HOST#http://}"

CORS_ORIGINS=""
CORS_ORIGINS="$(add_csv_value "$CORS_ORIGINS" "http://localhost:${FRONTEND_PORT}")"
CORS_ORIGINS="$(add_csv_value "$CORS_ORIGINS" "http://127.0.0.1:${FRONTEND_PORT}")"
CORS_ORIGINS="$(add_csv_value "$CORS_ORIGINS" "http://${LAN_IP}:${FRONTEND_PORT}")"
CORS_ORIGINS="$(add_csv_value "$CORS_ORIGINS" "$CLOUDFLARE_PUBLIC_URL")"

VITE_ALLOWED_HOSTS=""
VITE_ALLOWED_HOSTS="$(add_csv_value "$VITE_ALLOWED_HOSTS" "$CLOUDFLARE_HOST")"
VITE_ALLOWED_HOSTS="$(add_csv_value "$VITE_ALLOWED_HOSTS" "localhost")"
VITE_ALLOWED_HOSTS="$(add_csv_value "$VITE_ALLOWED_HOSTS" "127.0.0.1")"
VITE_ALLOWED_HOSTS="$(add_csv_value "$VITE_ALLOWED_HOSTS" "$LAN_IP")"

if [ -n "$PUBLIC_HOSTS_RAW" ]; then
  IFS=',' read -r -a public_hosts <<<"$PUBLIC_HOSTS_RAW"
  for item in "${public_hosts[@]}"; do
    host="$(trim_value "$item")"
    [ -z "$host" ] && continue
    host="$(extract_host "$host")"
    [ -z "$host" ] && continue
    host_name="$host"
    if [[ "$host_name" == *:* ]] && [[ "$host_name" != \[*\] ]]; then
      host_name="${host_name%%:*}"
    fi
    CORS_ORIGINS="$(add_csv_value "$CORS_ORIGINS" "http://${host}")"
    CORS_ORIGINS="$(add_csv_value "$CORS_ORIGINS" "https://${host}")"
    CORS_ORIGINS="$(add_csv_value "$CORS_ORIGINS" "http://${host}:${FRONTEND_PORT}")"
    CORS_ORIGINS="$(add_csv_value "$CORS_ORIGINS" "https://${host}:${FRONTEND_PORT}")"
    VITE_ALLOWED_HOSTS="$(add_csv_value "$VITE_ALLOWED_HOSTS" "$host_name")"
  done
fi

upsert_env_value "$BACKEND_ENV" "HOST" "$BACKEND_HOST"
upsert_env_value "$BACKEND_ENV" "PORT" "$BACKEND_PORT"
upsert_env_value "$BACKEND_ENV" "CORS_ORIGINS" "$CORS_ORIGINS"
upsert_env_value "$BACKEND_ENV" "PUBLIC_HOSTS" "$PUBLIC_HOSTS_RAW"

upsert_env_value "$FRONTEND_ENV" "VITE_HOST" "$FRONTEND_HOST"
upsert_env_value "$FRONTEND_ENV" "VITE_PORT" "$FRONTEND_PORT"
upsert_env_value "$FRONTEND_ENV" "VITE_API_BASE_URL" "/api"
upsert_env_value "$FRONTEND_ENV" "VITE_API_PROXY_TARGET" "http://127.0.0.1:${BACKEND_PORT}"
upsert_env_value "$FRONTEND_ENV" "VITE_ALLOWED_HOSTS" "$VITE_ALLOWED_HOSTS"
upsert_env_value "$FRONTEND_ENV" "VITE_PUBLIC_PREVIEW_URL" "$CLOUDFLARE_PUBLIC_URL"

export HOST="$BACKEND_HOST"
export PORT="$BACKEND_PORT"
export BACKEND_PORT="$BACKEND_PORT"
export CORS_ORIGINS="$CORS_ORIGINS"
export VITE_HOST="$FRONTEND_HOST"
export VITE_PORT="$FRONTEND_PORT"
export VITE_API_BASE_URL="/api"
export VITE_API_PROXY_TARGET="http://127.0.0.1:${BACKEND_PORT}"
export VITE_ALLOWED_HOSTS="$VITE_ALLOWED_HOSTS"

if [ "${SKIP_INSTALL:-0}" != "1" ] && [ ! -d "$ROOT_DIR/node_modules" ]; then
  log "Installing dependencies..."
  npm install
else
  log "Skipping npm install (set SKIP_INSTALL=0 to force install)."
fi

log "Starting backend..."
npm run dev --workspace backend >"$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!

log "Starting frontend..."
npm run dev --workspace frontend >"$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!

wait_for_service "Backend" "http://127.0.0.1:${BACKEND_PORT}/health" "$BACKEND_PID" 90 "$LOG_DIR/backend.log" \
  || fail "Backend did not become healthy. See $LOG_DIR/backend.log"
wait_for_service "Frontend" "http://127.0.0.1:${FRONTEND_PORT}" "$FRONTEND_PID" 90 "$LOG_DIR/frontend.log" \
  || fail "Frontend did not start. See $LOG_DIR/frontend.log"

echo ""
log "Services are running:"
echo "  Frontend local:      http://localhost:${FRONTEND_PORT}"
echo "  Frontend LAN:        http://${LAN_IP}:${FRONTEND_PORT}"
echo "  Backend local:       http://localhost:${BACKEND_PORT}"
echo "  Cloudflare preview:  ${CLOUDFLARE_PUBLIC_URL}"
echo ""
echo "  Logs:"
echo "    cloudflared:       ${LOG_DIR}/cloudflared.log"
echo "    backend:           ${LOG_DIR}/backend.log"
echo "    frontend:          ${LOG_DIR}/frontend.log"
echo ""

set +e
wait -n "$BACKEND_PID" "$FRONTEND_PID" "$CLOUDFLARED_PID"
child_exit_code=$?
set -e

if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  log "Backend process exited unexpectedly. Tail of backend log:"
  tail -n 40 "$LOG_DIR/backend.log" || true
fi

if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
  log "Frontend process exited unexpectedly. Tail of frontend log:"
  tail -n 40 "$LOG_DIR/frontend.log" || true
fi

if ! kill -0 "$CLOUDFLARED_PID" 2>/dev/null; then
  log "Cloudflared process exited unexpectedly. Tail of cloudflared log:"
  tail -n 40 "$CLOUDFLARED_LOG_FILE" || true
fi

exit "$child_exit_code"
