#!/usr/bin/env bash
# oc-keyword-watcher.sh — monitors Claude Code pane output for swarm-code keywords
# When Claude writes _Gi=<id>;OK → opens OpenCode TUI in oc-team pane
# Made by Alejandro Apodaca · apoapps.com

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMUX_BIN="$(command -v tmux 2>/dev/null || echo tmux)"
CC_PANE="${1:-}"  # Claude Code's TMUX_PANE id

SHARED_LOG="/tmp/swarm-code-logs/oc-team.log"
mkdir -p "$(dirname "$SHARED_LOG")"

log() { printf '%s\n' "$1" >> "$SHARED_LOG"; }

open_opencode_in_oc_team() {
  local session_id="$1"
  local current_window
  current_window="$("$TMUX_BIN" display-message -p '#{window_id}' 2>/dev/null)"

  # Find oc-team pane
  local pane_id
  pane_id="$("$TMUX_BIN" list-panes -t "$current_window" -F '#{pane_title}:#{pane_id}' 2>/dev/null \
    | grep "^oc-team:" | head -1 | cut -d: -f2)"

  if [[ -z "$pane_id" ]]; then
    # No oc-team pane — create one
    pane_id="$("$TMUX_BIN" split-window -h -d -P -F '#{pane_id}' "bash '$SCRIPTS_DIR/oc-team-ui.sh'" 2>/dev/null)"
    [[ -n "$pane_id" ]] && "$TMUX_BIN" select-pane -T 'oc-team' -t "$pane_id" 2>/dev/null
  fi

  if [[ -n "$pane_id" ]]; then
    log ""
    log "$(printf '\033[38;5;87m  ⚡ _Gi=%s;OK — launching opencode TUI\033[0m' "$session_id")"
    # Respawn the pane with opencode TUI
    if [[ -n "$session_id" && "$session_id" != "0" ]]; then
      "$TMUX_BIN" respawn-pane -k -t "$pane_id" \
        "bash '$SCRIPTS_DIR/opencode-splash.sh' '' '$session_id'" 2>/dev/null
    else
      "$TMUX_BIN" respawn-pane -k -t "$pane_id" \
        "bash '$SCRIPTS_DIR/opencode-splash.sh'" 2>/dev/null
    fi
    "$TMUX_BIN" select-pane -T 'oc-team' -t "$pane_id" 2>/dev/null
  fi
}

# ── Monitor the Claude Code pane output via pipe-pane ──
# pipe-pane feeds all terminal output to this script's stdin

while IFS= read -r line; do
  # Detect keyword: _Gi=<anything>;OK
  if [[ "$line" =~ _Gi=([^;]+);OK ]]; then
    session_id="${BASH_REMATCH[1]}"
    open_opencode_in_oc_team "$session_id"
  fi
done
