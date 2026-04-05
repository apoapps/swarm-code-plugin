#!/usr/bin/env bash
# opencode-bridge.sh — bridge entre Claude Code y OpenCode CLI
#
# Interfaz mínima: solo el prompt. Todo lo demás es automático.
# - Tipo de tarea (ask/review/plan) → detectado del contenido
# - Modelo → detectado por opencode-runner según configuración
# - tmux window → abierta automáticamente para visibilidad
#
# Made by Alejandro Apodaca Cordova (apoapps.com)
#
# Usage:
#   opencode-bridge.sh "<prompt>"
#   opencode-bridge.sh --type <ask|review|plan> "<prompt>"  # override opcional

set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNNER="$SCRIPTS_DIR/opencode-runner.mjs"

# ─── Args ─────────────────────────────────────────────────────────────────────

TYPE_OVERRIDE=""
PROMPT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --type) TYPE_OVERRIDE="$2"; shift 2 ;;
    *)      PROMPT="$1"; shift ;;
  esac
done

if [[ -z "$PROMPT" ]]; then
  echo "Usage: opencode-bridge.sh \"<prompt>\" [--type ask|review|plan]" >&2
  exit 2
fi

# ─── Hook: auto-detect task type ──────────────────────────────────────────────
# Detector interno — analiza el prompt para elegir el comando correcto.
# Override con --type si necesitas control explícito.

detect_type() {
  local p="$1"
  local lower
  lower="$(echo "$p" | tr '[:upper:]' '[:lower:]')"

  # Review: menciona git, diff, cambios, PR
  if echo "$lower" | grep -qE "(git diff|code review|revisa (el|los|la|las|este|estos)|review (the|these|this|my)|cambios|pull request|\bpr\b|staged|unstaged)"; then
    echo "review"; return
  fi

  # Plan: arquitectura, diseño, implementación, pasos
  if echo "$lower" | grep -qE "(plan|architect|diseña|diseño|implementa|cómo (estructurar|construir|crear|hacer)|roadmap|pasos para|step.by.step|scaffold|estructura (de|para))"; then
    echo "plan"; return
  fi

  # Default
  echo "ask"
}

CMD="${TYPE_OVERRIDE:-$(detect_type "$PROMPT")}"

# ─── Job setup ────────────────────────────────────────────────────────────────

JOB_ID="$(date +%s%3N)"
OUTFILE="/tmp/oc-${JOB_ID}.out"
PROMPT_FILE="/tmp/oc-${JOB_ID}.prompt"
SCRIPT_FILE="/tmp/oc-${JOB_ID}.sh"
SENTINEL="__OC_DONE_${JOB_ID}__"
WINDOW_NAME="oc:${CMD}"
MAX_WAIT=300

printf '%s' "$PROMPT" > "$PROMPT_FILE"

# ─── Hook: model selection ─────────────────────────────────────────────────────
# El runner lee modelPriority desde la config del proyecto (.opencode/config.json
# o config guardada con /opencode:setup). Si no hay config, usa el primer modelo
# disponible que responda. No se hardcodean modelos aquí.

# ─── Runner script (se ejecuta en tmux) ───────────────────────────────────────

cat > "$SCRIPT_FILE" << RUNNER_EOF
#!/usr/bin/env bash
PROMPT_CONTENT=\$(cat "$PROMPT_FILE")
echo ""
node "$RUNNER" $CMD "\$PROMPT_CONTENT" 2>&1 | tee "$OUTFILE"
echo ""
echo "$SENTINEL" >> "$OUTFILE"
printf "\n─────────────────────────────────────\n"
printf "✓ OpenCode listo  [%s]  Enter para cerrar.\n" "$CMD"
read
RUNNER_EOF
chmod +x "$SCRIPT_FILE"

# ─── Hook: launch ─────────────────────────────────────────────────────────────
# Abre ventana tmux si está disponible, fallback a background process.

if command -v tmux &>/dev/null && tmux info &>/dev/null 2>&1; then
  tmux new-window -n "$WINDOW_NAME" "bash '$SCRIPT_FILE'"
else
  bash "$SCRIPT_FILE" &>/dev/null &
fi

# ─── Hook: wait for completion ────────────────────────────────────────────────

WAIT=0
while ! grep -q "$SENTINEL" "$OUTFILE" 2>/dev/null; do
  sleep 1
  WAIT=$((WAIT + 1))
  if [[ $WAIT -ge $MAX_WAIT ]]; then
    printf "ERROR: OpenCode timeout (%ds)\n" "$MAX_WAIT" >&2
    exit 1
  fi
done

# ─── Output (sin sentinel) ────────────────────────────────────────────────────

grep -v "$SENTINEL" "$OUTFILE"

# Cleanup parcial (OUTFILE se deja en /tmp por si quieres revisar)
rm -f "$PROMPT_FILE" "$SCRIPT_FILE"
