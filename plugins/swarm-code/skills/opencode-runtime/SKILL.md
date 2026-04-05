---
name: opencode-runtime
description: Internal helper contract for calling opencode-bridge from Claude Code subagents. Requires tmux active.
user-invocable: false
---

<!-- Made by Alejandro Apodaca Cordova (apoapps.com) -->
<!-- v2.1.0 -->

# OpenCode Runtime

Úsalo solo dentro del subagente `swarm-code:opencode-worker`.

> **REQUIERE tmux activo.** Si `$TMUX` no está set, el bridge falla con exit 1.
> El worker debe verificar esto antes de llamar el bridge.

## Verificación previa (obligatoria)

```bash
if [[ -z "${TMUX:-}" ]]; then
  SendMessage(to: "team-lead", message: "✗ tmux no activo — no puedo correr el bridge")
  exit
fi
```

## Interfaz mínima

Solo necesitas el prompt. Todo lo demás es automático:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-bridge.sh" "<prompt>"
```

## Qué hace el bridge automáticamente

| Paso | Qué hace | Cómo |
|------|----------|------|
| **Tmux check** | Falla si no está en sesión tmux | Verifica `$TMUX` al inicio |
| **Tipo de tarea** | Detecta ask / review / plan | Analiza keywords del prompt |
| **Modelo** | Elige según config del proyecto | Lee modelPriority, fallback dinámico |
| **Visibilidad** | Split-pane en ventana actual | `tmux split-window -h` — nunca new-window |
| **Output** | Escribe a notify file | Notifica al team-lead con DONE:JOB_ID |

## Override de tipo (solo si es necesario)

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-bridge.sh" --type review "<prompt>"
bash "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-bridge.sh" --type plan   "<prompt>"
bash "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-bridge.sh" --type ask    "<prompt>"
```

## Chat multi-turno

Para mantener contexto entre mensajes:

```bash
CHAT="${CLAUDE_PLUGIN_ROOT}/scripts/opencode-chat.sh"

SID=$(bash "$CHAT" new)
bash "$CHAT" send "$SID" "primer mensaje"
bash "$CHAT" send "$SID" "siguiente mensaje con contexto del anterior"
bash "$CHAT" history "$SID"
```

## Setup del modelo (una vez por proyecto)

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" setup
```

Detecta todos los modelos disponibles en tu instalación de OpenCode y guarda la priority list.

## No hacer desde el worker

- No leer archivos (usa Read/Grep en el agente principal)
- No escribir archivos
- No llamar `status`, `result`, ni `setup` desde el worker
- No pasar `--model` al bridge (el runner lo maneja)
- No llamar el bridge si no estás en tmux
