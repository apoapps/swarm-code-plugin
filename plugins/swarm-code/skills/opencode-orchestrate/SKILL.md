---
name: opencode-orchestrate
description: Multi-team orchestration — Claude directs via experimental agent teams, OpenCode workers analyze in tmux split panes, communicate via SendMessage.
user-invocable: true
experimental:
  - agent-teams
allowed-tools:
  - Bash(bash:*)
  - TeamCreate
  - Agent
  - SendMessage
  - TaskCreate
  - TaskUpdate
  - TaskList
---

<!-- Made by Alejandro Apodaca Cordova (apoapps.com) -->
<!-- v2.2.0 -->

# OpenCode Multi-Team Orchestration

**Este skill tiene `allowed-tools` restringido. Solo puedes usar: Bash (bridge), TeamCreate, Agent, SendMessage, TaskCreate/Update/List.**

---

## PASO 1 — Verificación automática (OBLIGATORIA)

Ejecuta esto PRIMERO, antes de cualquier otra acción:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-bridge.sh" "verificar entorno"
```

Si falla con "swarm-code requiere tmux" → detente y dile al usuario:
> "swarm-code requiere tmux activo. Corre `tmux new -s work` y vuelve a abrir Claude Code dentro de esa sesión."

Si el pane ya se creó en SessionStart → el bridge reutilizará el existente.

---

## PASO 2 — Para tareas simples: bridge directo

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-bridge.sh" "<tarea>"
```

Lee el notify file del job cuando termina. Listo.

---

## PASO 3 — Para tareas complejas: agent team

```python
# 1. Team
TeamCreate(team_name="oc-team", description="<descripción>")

# 2. Workers (siempre con team_name)
Agent(
  subagent_type="swarm-code:opencode-worker",
  name="worker-análisis",
  team_name="oc-team",
  prompt="<tarea específica> — reporta resultado via SendMessage al team-lead"
)

Agent(
  subagent_type="swarm-code:opencode-worker",
  name="worker-review",
  team_name="oc-team",
  prompt="<otra tarea> — reporta resultado via SendMessage al team-lead"
)
```

---

## Protocolo entre agentes (siempre via SendMessage)

```
# Worker → team-lead cuando termina
SendMessage(to: "team-lead", message: "✓ done\n---\n<resultado>")

# team-lead → worker (tarea adicional)
SendMessage(to: "worker-análisis", message: "<nueva tarea>")
```

**NO uses Agent sin `team_name`** — el hook PreToolUse lo bloqueará automáticamente.

---

## ⛔ Prohibido en este skill

```
❌ Bash de análisis pesado (grep -r, rg, find recursivo, pipelines de 3+)
   → El hook lo bloquea → usa el bridge

❌ Agent sin team_name
   → El hook lo bloquea → usa TeamCreate primero

❌ Crear ventanas tmux nuevas (new-window)
   → El bridge ya tiene el pane desde SessionStart
```

---

## Arquitectura

```
SessionStart (automático)
  └─► setup_tmux_pane()  → crea oc-team pane
  └─► opencode-server    → inicia en background

Claude (director)
  ├── bridge → oc-team pane (ya existe)
  ├── worker-1 (team) → bridge → oc-team pane → SendMessage → team-lead
  └── worker-2 (team) → bridge → oc-team pane → SendMessage → team-lead
```

Ahorro estimado: **~80% tokens de Claude** vs análisis directo.

---

```bash
# Bridge path
bash "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-bridge.sh" "<prompt>"
```
