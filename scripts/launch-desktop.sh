#!/usr/bin/env bash
# Inicia o VEHO Edu (MongoDB + API) e abre em janela de aplicativo.
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
STARTUP_LOG="/tmp/veho-edu-startup.log"
PID_FILE="/tmp/veho-edu-server.pid"

compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    return 127
  fi
}

notify_error() {
  local msg="$1"
  echo "$msg" >> "$STARTUP_LOG"
  if command -v zenity >/dev/null 2>&1; then
    zenity --error --title="VEHO Edu" --text="$msg" --width=420 2>/dev/null || true
  elif command -v notify-send >/dev/null 2>&1; then
    notify-send "VEHO Edu" "$msg" 2>/dev/null || true
  fi
}

mongo_ready() {
  if command -v nc >/dev/null 2>&1; then
    nc -z 127.0.0.1 27017 >/dev/null 2>&1
    return $?
  fi
  (echo >/dev/tcp/127.0.0.1/27017) >/dev/null 2>&1
}

health_ok() {
  local body code
  body="$(curl -sS --connect-timeout 2 "$HEALTH_URL" 2>/dev/null || echo "")"
  code="$(curl -sS -o /dev/null -w "%{http_code}" --connect-timeout 2 "$HEALTH_URL" 2>/dev/null || echo "000")"
  [[ "$code" == "200" ]] && echo "$body" | grep -q '"connected"'
}

api_routes_ok() {
  local code
  code="$(curl -sS -o /dev/null -w "%{http_code}" --connect-timeout 2 "${URL}/api/horarios/professor/atualizacao" 2>/dev/null || echo "000")"
  [[ "$code" != "404" && "$code" != "000" ]]
}

free_port() {
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
    sleep 1
  fi
}

ensure_mongo() {
  if mongo_ready; then
    return 0
  fi

  if ! compose_cmd ps >/dev/null 2>&1; then
    notify_error "MongoDB não está rodando e Docker Compose não foi encontrado.\n\nExecute: docker-compose up -d"
    return 1
  fi

  echo "[$(date -Is)] Subindo MongoDB..." >> "$STARTUP_LOG"
  compose_cmd up -d >> "$STARTUP_LOG" 2>&1 || true

  for _ in $(seq 1 30); do
    if mongo_ready; then
      return 0
    fi
    sleep 1
  done

  notify_error "Não foi possível iniciar o MongoDB na porta 27017.\n\nVerifique o Docker e tente: docker-compose up -d"
  return 1
}

server_running() {
  [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

start_server() {
  if server_running && health_ok && api_routes_ok; then
    return 0
  fi

  if server_running; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    rm -f "$PID_FILE"
  fi

  if health_ok && ! api_routes_ok; then
    echo "[$(date -Is)] Servidor desatualizado detectado; reiniciando..." >> "$STARTUP_LOG"
    free_port
  fi

  ensure_mongo || return 1

  echo "[$(date -Is)] Iniciando servidor Node..." >> "$STARTUP_LOG"
  nohup npm start >> "$STARTUP_LOG" 2>&1 &
  echo $! > "$PID_FILE"
}

wait_for_server() {
  for _ in $(seq 1 90); do
    if health_ok; then
      return 0
    fi
    if server_running; then
      sleep 1
      continue
    fi
    break
  done
  return 1
}

open_app_window() {
  local chrome_args=(
    --app="$URL"
    --class=veho-edu
    --user-data-dir="$HOME/.config/veho-edu-chrome"
  )

  if command -v google-chrome >/dev/null 2>&1; then
    nohup google-chrome "${chrome_args[@]}" >/dev/null 2>&1 &
    return 0
  fi

  if command -v google-chrome-stable >/dev/null 2>&1; then
    nohup google-chrome-stable "${chrome_args[@]}" >/dev/null 2>&1 &
    return 0
  fi

  if command -v chromium >/dev/null 2>&1; then
    nohup chromium --app="$URL" --class=veho-edu >/dev/null 2>&1 &
    return 0
  fi

  if command -v chromium-browser >/dev/null 2>&1; then
    nohup chromium-browser --app="$URL" --class=veho-edu >/dev/null 2>&1 &
    return 0
  fi

  if command -v firefox >/dev/null 2>&1; then
    nohup firefox --new-window "$URL" >/dev/null 2>&1 &
    return 0
  fi

  nohup xdg-open "$URL" >/dev/null 2>&1 &
}

if health_ok && api_routes_ok; then
  open_app_window
  exit 0
fi

start_server || exit 1

if ! wait_for_server; then
  notify_error "O servidor não respondeu em ${URL}.\n\nConsulte: /tmp/veho-edu-startup.log"
  exit 1
fi

open_app_window
