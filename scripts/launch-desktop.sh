#!/usr/bin/env bash
# Inicia a Plataforma Escolar (MongoDB + API) e abre no navegador em modo app.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a
  source .env
  set +a
fi

PORT="${PORT:-3000}"
URL="${PLATAFORMA_URL:-http://localhost:${PORT}}"
HEALTH_URL="${URL}/health"
STARTUP_LOG="/tmp/plataforma-escolar-startup.log"
PID_FILE="/tmp/plataforma-escolar-server.pid"

is_up() {
  local code
  code="$(curl -sS -o /dev/null -w "%{http_code}" --connect-timeout 2 "$HEALTH_URL" 2>/dev/null || echo "000")"
  [[ "$code" == "200" ]]
}

ensure_mongo() {
  if command -v docker >/dev/null 2>&1; then
    if ! docker compose ps --status running 2>/dev/null | grep -q mongo; then
      docker compose up -d >> "$STARTUP_LOG" 2>&1 || true
      sleep 2
    fi
  fi
}

start_server() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    return 0
  fi

  ensure_mongo

  nohup npm start >> "$STARTUP_LOG" 2>&1 &
  echo $! > "$PID_FILE"
}

open_app_window() {
  if command -v google-chrome >/dev/null 2>&1; then
    nohup google-chrome --app="$URL" >/dev/null 2>&1 &
    exit 0
  fi

  if command -v chromium >/dev/null 2>&1; then
    nohup chromium --app="$URL" >/dev/null 2>&1 &
    exit 0
  fi

  if command -v chromium-browser >/dev/null 2>&1; then
    nohup chromium-browser --app="$URL" >/dev/null 2>&1 &
    exit 0
  fi

  if command -v firefox >/dev/null 2>&1; then
    nohup firefox --new-window "$URL" >/dev/null 2>&1 &
    exit 0
  fi

  nohup xdg-open "$URL" >/dev/null 2>&1 &
}

if ! is_up; then
  start_server

  for _ in $(seq 1 60); do
    if is_up; then
      break
    fi
    sleep 1
  done
fi

open_app_window
