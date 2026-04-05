---
name: opencode-runtime
description: Internal helper contract for calling opencode-bridge from Claude Code subagents
user-invocable: false
---

<!-- Made by Alejandro Apodaca Cordova (apoapps.com) -->

# OpenCode Runtime

Úsalo solo dentro del subagente `opencode:opencode-worker`.

## Interfaz mínima

Solo necesitas el prompt. Todo lo demás es automático:

```bash
bash "/Volumes/SandiskSSD/Documents/Local/dev/apoapps/cc-skills/opencode-plugin-cc/plugins/opencode/scripts/opencode-bridge.sh" "<prompt>"
```

## Qué hace el bridge automáticamente

| Paso | Qué hace | Cómo |
|------|----------|------|
| **Tipo de tarea** | Detecta ask / review / plan | Hook `task-type.mjs` — analiza keywords del prompt |
| **Modelo** | Elige según config del proyecto | `opencode-runner.mjs` — lee modelPriority, fallback dinámico |
| **Visibilidad** | Abre ventana tmux `oc:<tipo>` | tmux new-window con output pipe + tee |
| **Espera** | Polling por sentinel en output file | Loop de 1s, timeout 5min |
| **Output** | Stdout limpio sin metadatos internos | grep -v sentinel |

## Override de tipo (solo si es necesario)

```bash
bash opencode-bridge.sh --type review "<prompt>"
bash opencode-bridge.sh --type plan   "<prompt>"
bash opencode-bridge.sh --type ask    "<prompt>"
```

## Chat multi-turno

Para mantener contexto entre mensajes:

```bash
CHAT="/Volumes/SandiskSSD/Documents/Local/dev/apoapps/cc-skills/opencode-plugin-cc/plugins/opencode/scripts/opencode-chat.sh"

SID=$(bash "$CHAT" new)
bash "$CHAT" send "$SID" "primer mensaje"
bash "$CHAT" send "$SID" "siguiente mensaje con contexto del anterior"
bash "$CHAT" history "$SID"
```

## Setup del modelo (una vez por proyecto)

```bash
node opencode-runner.mjs setup
```

Detecta todos los modelos disponibles en tu instalación de OpenCode y guarda la priority list. No tiene modelos hardcodeados — usa lo que tengas.

## No hacer desde el worker

- No leer archivos (usa Read/Grep en el agente principal)
- No escribir archivos
- No llamar `status`, `result`, ni `setup` desde el worker
- No pasar `--model` al bridge (el runner lo maneja)
