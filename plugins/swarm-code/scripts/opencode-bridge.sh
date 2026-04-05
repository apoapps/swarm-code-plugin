#!/usr/bin/env bash
# opencode-bridge.sh — bridge entre Claude Code y OpenCode
#
# Arquitectura:
#   1. opencode serve  → servidor HTTP persistente (background, auto-start)
#   2. opencode attach → TUI en split-pane tmux (Claude y usuario comparten sesión)
#   3. HTTP API        → Claude envía mensajes vía opencode-send.mjs
#
# Made by Alejandro Apodaca Cordova (apoapps.com)

set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNNER="$SCRIPTS_DIR/opencode-runner.mjs"
SENDER="$SCRIPTS_DIR/opencode-send.mjs"
TMUX_BIN="$(command -v tmux 2>/dev/null || echo /opt/homebrew/bin/tmux)"

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

# ─── System prompt injection ───────────────────────────────────────────────

inject_system_context() {
  local cmd="$1"
  local user_prompt="$2"
  case "$cmd" in
    plan)
      printf '[SYSTEM — architect mode]\nProduce a clear implementation plan. No code. Steps + tradeoffs + files.\n\n[TASK]\n%s' "$user_prompt"
      ;;
    review)
      printf '[SYSTEM — code reviewer]\nFormat: - [SEVERITY] file:line — description. Max 12. CRITICAL first. No fixes.\n\n[CODE]\n%s' "$user_prompt"
      ;;
    ask)
      printf '[SYSTEM — subagent for Claude Code]\nConcise. No preamble. Bullets + file:line. 400 words max.\n\n[TASK]\n%s' "$user_prompt"
      ;;
  esac
}

# ─── Write enriched prompt to temp file ────────────────────────────────────

JOB_ID="$(date +%s%3N)"
PROMPT_FILE="/tmp/oc-${JOB_ID}.prompt"
OUTFILE="/tmp/oc-${JOB_ID}.out"

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

# ─── Open opencode attach in tmux split pane ─────────────────────────────
# User can interact with the same session Claude is talking to.

open_attach_pane() {
  local url="$1"

  # ── Case 1: Inside a tmux session ($TMUX is set) ──
  if [[ -n "${TMUX:-}" ]]; then
    local already
    already="$("$TMUX_BIN" list-panes -F '#{pane_current_command}' 2>/dev/null | grep -c "opencode" || true)"
    if [[ "$already" -eq 0 ]]; then
      # Try split-window first; if it fails (e.g., pane too small), try new-window
      if ! "$TMUX_BIN" split-window -v -l 35% "opencode attach '$url'" 2>/dev/null; then
        "$TMUX_BIN" new-window -n "oc-tui" "opencode attach '$url'" 2>/dev/null || \
          printf '\033[2m  ℹ tmux split failed — view output: opencode attach %s\033[0m\n' "$url" >&2
      fi
    fi
    return
  fi

  # ── Case 2: Not inside tmux but tmux server is reachable ──
  if "$TMUX_BIN" info &>/dev/null 2>&1; then
    local existing_windows
    existing_windows="$("$TMUX_BIN" list-windows -a -F '#{window_name}' 2>/dev/null | grep -c "oc-tui" || true)"
    if [[ "$existing_windows" -eq 0 ]]; then
      "$TMUX_BIN" new-window -n "oc-tui" "opencode attach '$url'" 2>/dev/null || true
    fi
    return
  fi

  # ── Case 3: No tmux at all — log gracefully ──
  printf '\033[2m  ℹ tmux not active — view live output: opencode attach %s\033[0m\n' "$url" >&2
}

open_attach_pane "$OC_URL"

# ─── Send message via HTTP API ────────────────────────────────────────────

printf '\033[2m⚡ opencode [%s] → %s\033[0m\n' "$CMD" "$OC_URL" >&2

if node "$SENDER" send "$PROMPT_FILE" > "$OUTFILE" 2>&1; then
  cat "$OUTFILE"
else
  printf '\033[33m⚠ HTTP send failed — falling back to runner\033[0m\n' >&2
  node "$RUNNER" "$CMD" "$(cat "$PROMPT_FILE")"
fi

rm -f "$PROMPT_FILE" "$OUTFILE"
