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
    already="$("$TMUX_BIN" list-windows -F '#{window_name}' 2>/dev/null | grep -c "oc-team" || true)"
    if [[ "$already" -eq 0 ]]; then
      # New window for the team — user can switch to it with prefix+n
      "$TMUX_BIN" new-window -n "oc-team" "opencode attach '$url'; read -p 'Press Enter to close'" 2>/dev/null || \
        printf '\033[2m  ℹ tmux open failed — run: opencode attach %s\033[0m\n' "$url" >&2
      printf '\033[2m  ✓ tmux window [oc-team] opened — switch with prefix+n\033[0m\n' >&2
    fi
    return
  fi

  # ── Case 2: Not inside tmux but tmux server is reachable ──
  if "$TMUX_BIN" info &>/dev/null 2>&1; then
    # Find the first available session to attach the new window to
    local first_session
    first_session="$("$TMUX_BIN" list-sessions -F '#{session_name}' 2>/dev/null | head -1)"
    local existing_windows
    existing_windows="$("$TMUX_BIN" list-windows -a -F '#{window_name}' 2>/dev/null | grep -c "oc-team" || true)"
    if [[ "$existing_windows" -eq 0 ]] && [[ -n "$first_session" ]]; then
      "$TMUX_BIN" new-window -t "$first_session" -n "oc-team" "opencode attach '$url'; read -p 'Press Enter to close'" 2>/dev/null || true
      printf '\033[2m  ✓ tmux window [oc-team] opened in session: %s\033[0m\n' "$first_session" >&2
    fi
    return
  fi

  # ── Case 3: No tmux at all — log gracefully ──
  printf '\033[2m  ℹ tmux not active — view live output: opencode attach %s\033[0m\n' "$url" >&2
}

open_attach_pane "$OC_URL"

# ─── Send message via HTTP API (background — non-blocking) ──────────────────
# The tmux window is the live view; result also goes to a notify file for the lead.

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
      # Restart server and update tmux window to new URL
      local new_state
      new_state="$(node "$SENDER" ensure-server 2>/dev/null)"
      if [[ -z "$new_state" ]]; then
        printf '\033[31m✗ server restart failed\033[0m\n' >&2
        break
      fi
      local new_url
      new_url="$(echo "$new_state" | node -e "const s=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.stdout.write(s.url)")"
      # Reopen the tmux attach pane with the new URL if in tmux
      if [[ -n "${TMUX:-}" ]] && [[ -n "$new_url" ]]; then
        local win_id
        win_id="$("$TMUX_BIN" list-windows -F '#{window_index}:#{window_name}' 2>/dev/null | grep ":oc-team" | cut -d: -f1 | head -1)"
        if [[ -n "$win_id" ]]; then
          "$TMUX_BIN" respawn-window -t ":${win_id}" "opencode attach '$new_url'; read -p 'Press Enter to close'" 2>/dev/null || true
        else
          open_attach_pane "$new_url"
        fi
      fi
      sleep 1
    done
    return 1
  }

  if send_with_retry; then
    {
      printf '## oc-team result [job:%s]\n\n' "$JOB_ID"
      cat "$OUTFILE"
      printf '\n\n---\n_Task completed. Job: %s_\n' "$JOB_ID"
    } > "$NOTIFY_FILE"
    printf '\033[32m  ✓ oc-team done → %s\033[0m\n' "$NOTIFY_FILE" >&2
  else
    printf '\033[33m⚠ HTTP send failed after retries — falling back to runner (no TUI)\033[0m\n' >&2
    node "$RUNNER" "$CMD" "$(cat "$PROMPT_FILE")" > "$OUTFILE" 2>&1
    cat "$OUTFILE" > "$NOTIFY_FILE"
    printf '\033[33m  ✓ runner fallback done → %s\033[0m\n' "$NOTIFY_FILE" >&2
  fi
  rm -f "$PROMPT_FILE" "$OUTFILE"
) &

# Print job info immediately so Claude (lead) knows the task is running
printf '{"job":"%s","notify":"%s","url":"%s","session":"%s","status":"running"}\n' \
  "$JOB_ID" "$NOTIFY_FILE" "$OC_URL" "$OC_SID"
