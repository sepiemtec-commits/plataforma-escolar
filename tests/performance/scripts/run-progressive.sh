#!/usr/bin/env bash
# Runner progressivo TOKEN 07 — começa pequeno e sobe.
# NÃO executa E (10k) automaticamente.
#
# Uso:
#   ./tests/performance/scripts/run-progressive.sh
#   SCENARIOS=smoke,A ./tests/performance/scripts/run-progressive.sh
#   SCENARIOS=A,B,C ALLOW_HEAVY=1 ./tests/performance/scripts/run-progressive.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PERF="$ROOT/tests/performance"
K6_DIR="$PERF/k6/scenarios"
RESULTS="$PERF/results"
mkdir -p "$RESULTS"

BASE_URL="${BASE_URL:-http://localhost:3000}"
export BASE_URL

# Localizar k6
if command -v k6 >/dev/null 2>&1; then
  K6_BIN="$(command -v k6)"
elif [[ -x "$ROOT/tools/bin/k6" ]]; then
  K6_BIN="$ROOT/tools/bin/k6"
elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  K6_BIN="docker"
else
  echo "ERRO: k6 não encontrado. Instale: https://k6.io/docs/get-started/installation/"
  echo "  ou coloque o binário em tools/bin/k6"
  exit 1
fi

run_k6() {
  local script="$1"
  local out_json="$2"
  local out_txt="$3"
  shift 3 || true
  echo "── k6 → $script"
  if [[ "$K6_BIN" == "docker" ]]; then
    docker run --rm --network host \
      -v "$ROOT:/work" -w /work \
      -e BASE_URL="$BASE_URL" \
      -e LOAD_EMAIL="${LOAD_EMAIL:-secretaria@escola.com}" \
      -e LOAD_PASSWORD="${LOAD_PASSWORD:-senha123}" \
      -e ALLOW_HEAVY="${ALLOW_HEAVY:-}" \
      -e ALLOW_10K="${ALLOW_10K:-}" \
      grafana/k6:0.54.0 run \
      --summary-export "/work/tests/performance/results/$(basename "$out_json")" \
      "tests/performance/k6/scenarios/$(basename "$script")" \
      "$@" | tee "$out_txt"
  else
    "$K6_BIN" run \
      -e "BASE_URL=$BASE_URL" \
      -e "LOAD_EMAIL=${LOAD_EMAIL:-secretaria@escola.com}" \
      -e "LOAD_PASSWORD=${LOAD_PASSWORD:-senha123}" \
      -e "ALLOW_HEAVY=${ALLOW_HEAVY:-}" \
      -e "ALLOW_10K=${ALLOW_10K:-}" \
      --summary-export "$out_json" \
      "$script" "$@" | tee "$out_txt"
  fi
}

TS="$(date +%Y%m%d-%H%M%S)"
SCENARIOS_CSV="${SCENARIOS:-smoke,A}"

echo "=== TOKEN 07 progressive ==="
echo "BASE_URL=$BASE_URL"
echo "K6=$K6_BIN"
echo "SCENARIOS=$SCENARIOS_CSV"
echo

# Health prévio
if ! curl -sf -m 5 "$BASE_URL/health" >/dev/null; then
  echo "ERRO: $BASE_URL/health indisponível. Suba o servidor (DISABLE_RATE_LIMIT=1 recomendado)."
  exit 1
fi

IFS=',' read -ra LIST <<< "$SCENARIOS_CSV"
FAILED=0

for S in "${LIST[@]}"; do
  S="$(echo "$S" | tr -d '[:space:]')"
  case "$S" in
    smoke) SCRIPT="$K6_DIR/smoke.js"; DUR=45 ;;
    A) SCRIPT="$K6_DIR/A-100.js"; DUR=200 ;;
    B) SCRIPT="$K6_DIR/B-500.js"; DUR=360 ;;
    C) SCRIPT="$K6_DIR/C-1000.js"; DUR=480 ;;
    D) SCRIPT="$K6_DIR/D-5000.js"; DUR=720 ;;
    E)
      echo "CENÁRIO E (10.000) excluído do runner progressivo."
      echo "Execute manualmente após check-capacity + ALLOW_HEAVY=1 ALLOW_10K=1."
      continue
      ;;
    *) echo "Cenário desconhecido: $S"; FAILED=1; continue ;;
  esac

  echo
  echo "▶ Capacidade $S"
  if ! node "$PERF/scripts/check-capacity.js" "$S"; then
    echo "Pulando $S (capacidade/flags)."
    FAILED=1
    # para progressão: se A/B falhar capacidade, não sobe
    if [[ "$S" == "A" || "$S" == "B" || "$S" == "smoke" ]]; then
      break
    fi
    continue
  fi

  JSON="$RESULTS/k6-${S}-${TS}.json"
  TXT="$RESULTS/k6-${S}-${TS}.txt"
  SYS="$RESULTS/sys-${S}-${TS}.json"

  # coletor em paralelo
  node "$PERF/scripts/collect-system-metrics.js" --out "$SYS" --interval 2 --duration "$DUR" &
  COLLECTOR_PID=$!

  set +e
  run_k6 "$SCRIPT" "$JSON" "$TXT"
  RC=$?
  set -e

  kill "$COLLECTOR_PID" 2>/dev/null || true
  wait "$COLLECTOR_PID" 2>/dev/null || true

  if [[ $RC -ne 0 ]]; then
    echo "✗ Cenário $S falhou (exit $RC) — interrompendo progressão."
    FAILED=1
    break
  fi
  echo "✓ Cenário $S OK → $JSON"
done

node "$PERF/scripts/summarize-results.js" --ts "$TS" || true

exit "$FAILED"
