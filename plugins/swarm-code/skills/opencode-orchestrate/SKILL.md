---
name: opencode-orchestrate
description: Multi-team orchestration — Claude directs via experimental agent teams, OpenCode workers analyze in tmux split panes, communicate via SendMessage.
user-invocable: true
experimental:
  - agent-teams
---

<!-- Made by Alejandro Apodaca Cordova (apoapps.com) -->
<!-- v2.1.1 -->

# OpenCode Multi-Team Orchestration

---

## ⛔ STOP — ANTES de hacer CUALQUIER COSA, verifica esto

**¿Estás dentro de una sesión tmux?**
```bash
echo ${TMUX:-"NO TMUX — DETENTE"}
```
Si no hay `$TMUX` → **NO continúes**. Dile al usuario: "swarm-code requiere tmux. Corre `tmux new -s work` y vuelve a abrir Claude Code."

**¿Tienes agent-teams habilitado?**
El frontmatter de este skill declara `experimental: [agent-teams]`. Si no está habilitado, las herramientas `TeamCreate` y `SendMessage` no existen → no continúes.

---

## ⛔ PROHIBIDO — No hagas esto

```python
# ❌ PROHIBIDO — parallel agents sueltos (no agent teams)
Agent(subagent_type="opencode:opencode-worker", name="w1", prompt="...")
Agent(subagent_type="opencode:opencode-worker", name="w2", prompt="...")
# Esto no tiene team, no tiene comunicación entre agentes.

# ❌ PROHIBIDO — Promise.all / batch commands paralelos
# El bridge nunca se debe llamar en loop concurrente desde bash.
```

---

## ✅ OBLIGATORIO — Haz esto

Al invocar este skill, **LLAMA el bridge inmediatamente**:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-bridge.sh" "<tarea>"
```

Si la tarea requiere múltiples workers, **crea un team primero**:

```python
# 1. Team
TeamCreate(team_name="oc-team", description="análisis + review")

# 2. Workers dentro del team
Agent(
  subagent_type="swarm-code:opencode-worker",
  name="worker-análisis",
  team_name="oc-team",   # ← OBLIGATORIO
  prompt="Analiza src/api/ — reporta via SendMessage al team-lead."
)
Agent(
  subagent_type="swarm-code:opencode-worker",
  name="worker-review",
  team_name="oc-team",   # ← OBLIGATORIO
  prompt="Revisa el último diff — reporta via SendMessage al team-lead."
)
```

---

## Protocolo de comunicación entre agentes

Los workers **NO retornan batch output** — usan `SendMessage`:

```
# Worker → Team lead (cuando termina)
SendMessage(to: "team-lead", message: "✓ análisis listo\n---\n<resultado>")

# Team lead → Worker (tarea adicional)
SendMessage(to: "worker-análisis", message: "Ahora revisa también src/lib/")

# ACK inmediato del worker
⚡ oc | revisando src/lib/
```

---

## El principio

```
Claude Sonnet (director)
  ├── worker-análisis  ──bridge──► tmux split-pane ──SendMessage──► team-lead
  ├── worker-review    ──bridge──► tmux split-pane ──SendMessage──► team-lead
  └── worker-plan      ──bridge──► tmux split-pane ──SendMessage──► team-lead
```

- **Claude** = director. No hace análisis. Sintetiza resultados.
- **opencode-workers** = análisis barato. Corren en tmux split-panes.
- **Comunicación** = siempre via SendMessage dentro del team.

---

## Cuándo usar cada tipo

| Tarea | Agente | Costo |
|-------|--------|-------|
| Code review, análisis de bugs | opencode-worker | ~$0 |
| Planear implementación | opencode-worker | ~$0 |
| Preguntas de arquitectura | opencode-worker | ~$0 |
| Orquestar, sintetizar, decidir | Claude Sonnet | $3/M |

---

## Ahorro de tokens estimado

Sin orquestación: 8,000–15,000 tokens por tarea compleja
Con agent teams: 1,000–2,000 tokens por tarea compleja
**Ahorro: ~80%**

---

## Bridge path

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-bridge.sh" "<prompt>"
```
