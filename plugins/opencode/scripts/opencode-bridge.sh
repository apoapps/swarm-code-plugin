#!/usr/bin/env bash
# opencode-bridge.sh — bridge entre Claude Code y OpenCode CLI
#
# Equivalente a SendMessage para instancias de OpenCode.
# Crea una ventana tmux para visibilidad en tiempo real,
# captura el output, y regresa el resultado como stdout.
#
# Made by Alejandro Apodaca Cordova (apoapps.com)
#
# Usage:
#   opencode-bridge.sh ask    "<prompt>" [--model <model>]
#   opencode-bridge.sh review "<prompt>" [--model <model>] [--base <ref>]
#   opencode-bridge.sh plan   "<prompt>" [--model <model>]
#
# Exit codes:
#   0 — success
#   1 — opencode error o timeout
#   2 — bad args

set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNNER="$SCRIPTS_DIR/opencode-runner.mjs"

# ─── Args ────────────────────────────────────────────────────────────────────

COMMAND="${1:-ask}"
if [[ "$COMMAND" != "ask" && "$COMMAND" != "review" && "$COMMAND" != "plan" ]]; then
  echo "ERROR: command must be ask|review|plan, got: $COMMAND" >&2
  exit 2
fi
shift

PROMPT=""
MODEL_FLAG=""
BASE_FLAG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --model)  MODEL_FLAG="--model $2"; shift 2 ;;
    --base)   BASE_FLAG="--base $2";   shift 2 ;;
    *)        PROMPT="$1";             shift   ;;
  esac
done

if [[ -z "$PROMPT" && "$COMMAND" != "review" ]]; then
  echo "ERROR: prompt required for $COMMAND" >&2
  exit 2
fi

# ─── Job setup ───────────────────────────────────────────────────────────────

JOB_ID="$(date +%s%3N)"
OUTFILE="/tmp/oc-${JOB_ID}.out"
PROMPT_FILE="/tmp/oc-${JOB_ID}.prompt"
SCRIPT_FILE="/tmp/oc-${JOB_ID}.sh"
SENTINEL="__OC_DONE_${JOB_ID}__"
WINDOW_NAME="oc:${COMMAND}"
MAX_WAIT=300  # 5 min timeout

# Prompt va a archivo para evitar problemas de escaping en shell
printf '%s' "$PROMPT" > "$PROMPT_FILE"

# ─── Runner script ────────────────────────────────────────────────────────────
# Se ejecuta dentro de tmux — el user puede verlo en tiempo real

cat > "$SCRIPT_FILE" << RUNNER_EOF
#!/usr/bin/env bash
PROMPT_CONTENT=\$(cat "$PROMPT_FILE")
echo ""
node "$RUNNER" $COMMAND $MODEL_FLAG $BASE_FLAG "\$PROMPT_CONTENT" 2>&1 | tee "$OUTFILE"
echo ""
echo "$SENTINEL" >> "$OUTFILE"
echo "─────────────────────────────────────"
echo "✓ OpenCode listo. Enter para cerrar."
read
RUNNER_EOF
chmod +x "$SCRIPT_FILE"

# ─── Launch en tmux ───────────────────────────────────────────────────────────

IN_TMUX=0
if command -v tmux &>/dev/null && tmux info &>/dev/null 2>&1; then
  tmux new-window -n "$WINDOW_NAME" "bash '$SCRIPT_FILE'"
  IN_TMUX=1
else
  # Fallback sin tmux: ejecutar en background
  bash "$SCRIPT_FILE" &>/dev/null &
fi

# ─── Esperar resultado ────────────────────────────────────────────────────────

WAIT=0
while ! grep -q "$SENTINEL" "$OUTFILE" 2>/dev/null; do
  sleep 1
  WAIT=$((WAIT + 1))
  if [[ $WAIT -ge $MAX_WAIT ]]; then
    echo "ERROR: OpenCode timeout después de ${MAX_WAIT}s" >&2
    exit 1
  fi
done

# ─── Output (sin sentinel) ────────────────────────────────────────────────────

grep -v "$SENTINEL" "$OUTFILE"

# Cleanup
rm -f "$PROMPT_FILE" "$SCRIPT_FILE"
# OUTFILE se deja en /tmp por si quieres revisarlo: /tmp/oc-<job>.out
