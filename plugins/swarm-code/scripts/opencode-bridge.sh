#!/usr/bin/env bash
# opencode-bridge.sh — bridge entre Claude Code y OpenCode
#
# Arquitectura:
#   1. opencode serve  → servidor HTTP persistente (background, auto-start)
#   2. opencode attach → TUI en split-pane tmux (pane dentro de la sesión actual)
#   3. HTTP API        → Claude envía mensajes vía opencode-send.mjs
#
# REQUIERE tmux activo ($TMUX debe estar set).
# Nunca crea ventanas nuevas — solo split-pane dentro de la sesión actual.
#
# Made by Alejandro Apodaca Cordova (apoapps.com)
# v2.1.0

set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNNER="$SCRIPTS_DIR/opencode-runner.mjs"
SENDER="$SCRIPTS_DIR/opencode-send.mjs"
TMUX_BIN="$(command -v tmux 2>/dev/null || echo /opt/homebrew/bin/tmux)"

# ─── Tmux obligatorio ──────────────────────────────────────────────────────────
# swarm-code requiere tmux activo. Si no estás dentro de una sesión tmux, falla.

if [[ -z "${TMUX:-}" ]]; then
  printf '\033[31m✗ swarm-code requiere tmux.\033[0m\n' >&2
  printf '\033[31m  Abre una sesión tmux primero: tmux new -s work\033[0m\n' >&2
  printf '\033[31m  Luego vuelve a abrir Claude Code dentro de esa sesión.\033[0m\n' >&2
  exit 1
fi

# ─── Args ──────────────────────────────────────────────────────────────────

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

# ─── Auto-detect task type ─────────────────────────────────────────────────

detect_type() {
  local lower
  lower="$(echo "$1" | tr '[:upper:]' '[:lower:]')"
  if echo "$lower" | grep -qE "(git diff|code review|revisa|review|cambios|pull request|\bpr\b|staged|diff)"; then
    echo "review"; return
  fi
  if echo "$lower" | grep -qE "(plan|architect|diseña|implementa|roadmap|pasos para|scaffold|estructura de)"; then
    echo "plan"; return
  fi
  echo "ask"
}

CMD="${TYPE_OVERRIDE:-$(detect_type "$PROMPT")}"

# ─── Job ID + report paths ─────────────────────────────────────────────────

JOB_ID="$(date +%s%3N)$(( RANDOM % 900 + 100 ))"
PROMPT_FILE="/tmp/oc-${JOB_ID}.prompt"
OUTFILE="/tmp/oc-${JOB_ID}.out"
REPORT_FILE="/tmp/oc-report-${JOB_ID}.md"

# ─── System prompt injection ───────────────────────────────────────────────
# Every prompt includes the DONE protocol so the agent always reports back.

_done_footer() {
  printf '\n\n---\n[DONE PROTOCOL — MANDATORY]\nYou are a worker in the swarm-code team. Claude Code is the lead in another tmux pane.\nWhen you finish your task:\n  1. Write your complete report to: %s\n  2. End the file with exactly (last line): DONE:%s\nDo NOT skip this. Claude reads this file to receive your output.\n' \
    "$REPORT_FILE" "$JOB_ID"
}

inject_system_context() {
  local cmd="$1"
  local user_prompt="$2"
  case "$cmd" in
    plan)
      printf '[SYSTEM — architect mode]\nProduce a clear implementation plan. No code. Steps + tradeoffs + files.\n\n[TASK]\n%s%s' \
        "$user_prompt" "$(_done_footer)"
      ;;
    review)
      printf '[SYSTEM — code reviewer]\nFormat: - [SEVERITY] file:line — description. Max 12. CRITICAL first. No fixes.\n\n[CODE]\n%s%s' \
        "$user_prompt" "$(_done_footer)"
      ;;
    ask)
      printf '[SYSTEM — subagent for Claude Code]\nConcise. No preamble. Bullets + file:line. 400 words max.\n\n[TASK]\n%s%s' \
        "$user_prompt" "$(_done_footer)"
      ;;
  esac
}

inject_system_context "$CMD" "$PROMPT" > "$PROMPT_FILE"

# ─── Ensure server + session running ──────────────────────────────────────

SERVER_STATE="$(node "$SENDER" ensure-server 2>/tmp/oc-server.log)"

if [[ -z "$SERVER_STATE" ]]; then
  printf '\033[33m⚠ opencode server failed — falling back to runner\033[0m\n' >&2
  node "$RUNNER" "$CMD" "$(cat "$PROMPT_FILE")"
  rm -f "$PROMPT_FILE"
  exit $?
fi

OC_URL="$(echo "$SERVER_STATE" | node -e "const s=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.stdout.write(s.url)")"
OC_SID="$(echo "$SERVER_STATE" | node -e "const s=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.stdout.write(s.sessionID)")"

# ─── oc-team shared log + pane management ─────────────────────────────────────

SHARED_LOG="${CLAUDE_PLUGIN_DATA:-/tmp}/swarm-code-logs/oc-team.log"
mkdir -p "$(dirname "$SHARED_LOG")"

TS() { date '+%H:%M:%S'; }

log_to_pane() {
  printf '%s\n' "$1" >> "$SHARED_LOG"
}

log_job_start() {
  log_to_pane ""
  log_to_pane "$(printf '\033[38;5;240m  ── %s ──────────────────────────────────────\033[0m' "$(TS)")"
  log_to_pane "$(printf '\033[38;5;221m  ⚡ [%s] %s\033[0m' "$CMD" "$(echo "$PROMPT" | head -c 80)")"
  log_to_pane "$(printf '\033[2m     job %s\033[0m' "$JOB_ID")"
}

open_attach_pane() {
  local current_window
  current_window="$("$TMUX_BIN" display-message -p '#{window_id}' 2>/dev/null)"
  local pane_exists
  pane_exists="$("$TMUX_BIN" list-panes -t "$current_window" -F '#{pane_title}' 2>/dev/null | grep -c "^oc-team$" || true)"

  if [[ "$pane_exists" -gt 0 ]]; then
    log_job_start
    return
  fi

  # pane missing — create it with oc-team-ui.sh
  local ui_script="$SCRIPTS_DIR/oc-team-ui.sh"
  local pane_cmd="${ui_script:-bash --login}"
  if "$TMUX_BIN" split-window -h -d -t "$current_window" -P -F '#{pane_id}' "bash '$pane_cmd'" 2>/dev/null | xargs -I{} "$TMUX_BIN" select-pane -T "oc-team" -t {} 2>/dev/null; then
    sleep 0.5  # let ui script start before writing
    log_job_start
  else
    printf '\033[33m⚠ could not create oc-team pane — continuing without TUI\033[0m\n' >&2
  fi
}

open_attach_pane "$OC_URL"

# ─── Send message via HTTP API (background — non-blocking) ──────────────────
# El split-pane es la vista en vivo; el resultado también va a notify file para el lead.

NOTIFY_FILE="/tmp/oc-notify-${JOB_ID}.md"

printf '\033[2m⚡ opencode [%s] → %s\033[0m\n' "$CMD" "$OC_URL" >&2
printf '\033[2m  Result will be written to: %s\033[0m\n' "$NOTIFY_FILE" >&2

(
  send_with_retry() {
    local attempt=0
    while [[ $attempt -lt 3 ]]; do
      if node "$SENDER" send "$PROMPT_FILE" > "$OUTFILE" 2>&1; then
        return 0
      fi
      attempt=$((attempt + 1))
      printf '\033[33m⚠ send attempt %d failed — restarting server...\033[0m\n' "$attempt" >&2
      local new_state
      new_state="$(node "$SENDER" ensure-server 2>/dev/null)"
      if [[ -z "$new_state" ]]; then
        printf '\033[31m✗ server restart failed\033[0m\n' >&2
        break
      fi
      local new_url
      new_url="$(echo "$new_state" | node -e "const s=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.stdout.write(s.url)")"
      # Actualizar el pane existente con la nueva URL
      if [[ -n "$new_url" ]]; then
        local current_window
        current_window="$("$TMUX_BIN" display-message -p '#{window_id}' 2>/dev/null)"
        local pane_id
        pane_id="$("$TMUX_BIN" list-panes -t "$current_window" -F '#{pane_title}:#{pane_id}' 2>/dev/null \
          | grep "^oc-team:" | head -1 | cut -d: -f2)" || true
        if [[ -n "$pane_id" ]]; then
          "$TMUX_BIN" respawn-pane -t "$pane_id" \
            "bash '$SCRIPTS_DIR/opencode-splash.sh' '$new_url' '$JOB_ID'; read -p 'Press Enter to close'" 2>/dev/null || true
        fi
      fi
      sleep 1
    done
    return 1
  }

  build_notify() {
    local source_file="$1"
    local tag="$2"
    {
      printf '## oc-team result [job:%s] [%s]\n\n' "$JOB_ID" "$tag"
      cat "$source_file"
      printf '\n\n---\n_Task completed. Job: %s · DONE:%s_\n' "$JOB_ID" "$JOB_ID"
    } > "$NOTIFY_FILE"
    # También escribir al shared log para que oc-team-ui.sh lo muestre en tiempo real
    {
      printf '\033[38;5;114m  ✓ job %s done\033[0m\n' "$JOB_ID"
      printf '\033[2m'
      cat "$source_file" | head -50
      printf '\033[0m'
      printf '\033[38;5;240m  ────────────────────────────────────────────────\033[0m\n'
    } >> "$SHARED_LOG"
    printf '\033[32m  ✓ oc-team done [DONE:%s] → %s\033[0m\n' "$JOB_ID" "$NOTIFY_FILE" >&2
  }

  if send_with_retry; then
    if [[ -f "$REPORT_FILE" ]] && grep -q "DONE:${JOB_ID}" "$REPORT_FILE" 2>/dev/null; then
      build_notify "$REPORT_FILE" "report"
    else
      build_notify "$OUTFILE" "http"
    fi
  else
    printf '\033[33m⚠ HTTP send failed after retries — falling back to runner (no TUI)\033[0m\n' >&2
    node "$RUNNER" "$CMD" "$(cat "$PROMPT_FILE")" > "$OUTFILE" 2>&1
    if [[ -f "$REPORT_FILE" ]] && grep -q "DONE:${JOB_ID}" "$REPORT_FILE" 2>/dev/null; then
      build_notify "$REPORT_FILE" "report-fallback"
    else
      build_notify "$OUTFILE" "runner-fallback"
    fi
  fi
  rm -f "$PROMPT_FILE" "$OUTFILE"
) &

# Imprimir job info inmediatamente para que Claude (lead) sepa que la tarea corre
printf '{"job":"%s","notify":"%s","report":"%s","url":"%s","session":"%s","status":"running"}\n' \
  "$JOB_ID" "$NOTIFY_FILE" "$REPORT_FILE" "$OC_URL" "$OC_SID"
