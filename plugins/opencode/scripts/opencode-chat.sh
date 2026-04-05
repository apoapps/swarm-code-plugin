#!/usr/bin/env bash
# opencode-chat.sh — sesión de chat persistente con OpenCode
#
# Mantiene historial de conversación por sesión.
# Cada mensaje incluye el historial como contexto,
# simulando una conversación multi-turno sobre una CLI one-shot.
#
# Made by Alejandro Apodaca Cordova (apoapps.com)
#
# Usage:
#   opencode-chat.sh new              — Crea sesión, imprime SESSION_ID
#   opencode-chat.sh send <sid> "<msg>"  — Envía mensaje, regresa respuesta
#   opencode-chat.sh history <sid>    — Muestra historial
#   opencode-chat.sh clear <sid>      — Borra historial de sesión
#   opencode-chat.sh list             — Lista sesiones activas

set -euo pipefail

BRIDGE="$(cd "$(dirname "$0")" && pwd)/opencode-bridge.sh"
SESSIONS_DIR="/tmp/oc-sessions"
mkdir -p "$SESSIONS_DIR"

CMD="${1:-send}"
shift || true

case "$CMD" in

  # ─── new ────────────────────────────────────────────────────────────────────
  new)
    SID="oc-$(date +%s%3N)"
    touch "$SESSIONS_DIR/${SID}.history"
    echo "$SID"
    ;;

  # ─── send ───────────────────────────────────────────────────────────────────
  send)
    SID="${1:?'Usage: opencode-chat.sh send <session-id> <message>'}"
    MESSAGE="${2:?'Usage: opencode-chat.sh send <session-id> <message>'}"
    HISTORY_FILE="$SESSIONS_DIR/${SID}.history"

    if [[ ! -f "$HISTORY_FILE" ]]; then
      echo "ERROR: sesión '$SID' no encontrada. Usa 'new' para crear una." >&2
      exit 1
    fi

    # Construir prompt con historial como contexto
    HISTORY="$(cat "$HISTORY_FILE")"
    if [[ -n "$HISTORY" ]]; then
      FULL_PROMPT="$(cat << EOF
[Conversation history]
$HISTORY

[New message]
$MESSAGE
EOF
)"
    else
      FULL_PROMPT="$MESSAGE"
    fi

    # Ejecutar vía bridge (tmux window + output file + wait)
    RESPONSE="$(bash "$BRIDGE" ask "$FULL_PROMPT")"

    # Guardar en historial
    {
      echo "USER: $MESSAGE"
      echo "ASSISTANT: $RESPONSE"
      echo "---"
    } >> "$HISTORY_FILE"

    # Respuesta al caller
    echo "$RESPONSE"
    ;;

  # ─── history ────────────────────────────────────────────────────────────────
  history)
    SID="${1:?'Usage: opencode-chat.sh history <session-id>'}"
    HISTORY_FILE="$SESSIONS_DIR/${SID}.history"
    if [[ ! -f "$HISTORY_FILE" ]]; then
      echo "Sesión '$SID' no encontrada." >&2; exit 1
    fi
    cat "$HISTORY_FILE"
    ;;

  # ─── clear ──────────────────────────────────────────────────────────────────
  clear)
    SID="${1:?'Usage: opencode-chat.sh clear <session-id>'}"
    HISTORY_FILE="$SESSIONS_DIR/${SID}.history"
    : > "$HISTORY_FILE"
    echo "Sesión $SID limpiada."
    ;;

  # ─── list ───────────────────────────────────────────────────────────────────
  list)
    echo "Sesiones activas en $SESSIONS_DIR:"
    ls -1 "$SESSIONS_DIR"/*.history 2>/dev/null | while read -r f; do
      SID="$(basename "$f" .history)"
      TURNS="$(grep -c '^USER:' "$f" 2>/dev/null || echo 0)"
      printf "  %s  (%s turnos)\n" "$SID" "$TURNS"
    done
    ;;

  *)
    echo "Comandos: new | send | history | clear | list" >&2
    exit 2
    ;;
esac
