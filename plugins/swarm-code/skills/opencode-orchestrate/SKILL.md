---
name: opencode-orchestrate
description: Multi-team orchestration pattern — Claude directs via experimental agent teams, OpenCode workers analyze in tmux split panes, agents communicate via SendMessage.
user-invocable: true
experimental:
  - agent-teams
---

<!-- Made by Alejandro Apodaca Cordova (apoapps.com) -->
<!-- v2.1.0 -->

# OpenCode Multi-Team Orchestration

> **REQUIERE**: tmux activo + `experimental.agent-teams` habilitado en Claude Code.
> Si no estás en tmux, el bridge falla. Si agent-teams no está habilitado, usa `/swarm-code:init` primero.

## El principio

**Claude (Sonnet/Opus) = director.** No hace análisis — crea teams y delega.
**opencode-worker agents = análisis barato.** Corren en tmux split panes, reportan via SendMessage.
**Los agentes se comunican entre ellos** — el team lead coordina via SendMessage, no batch commands.

```
Claude Sonnet (director)
  ├── Team "análisis": opencode-worker ──SendMessage──► team-lead
  ├── Team "review":   opencode-worker ──SendMessage──► team-lead
  └── Team "plan":     opencode-worker ──SendMessage──► team-lead
                            ↕ tmux split pane (visible en pantalla)
```

## OBLIGATORIO: Cuando este skill se invoca, llama el bridge

Al invocar este skill, Claude DEBE llamar el bridge inmediatamente. No solo describir — ejecutar:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-bridge.sh" "<tarea>"
```

No esperes input adicional. Detecta el tipo de tarea automáticamente y abre el split-pane.

## Cómo crear un agent team con opencode-workers

```python
# 1. Crear el team (experimental agent-teams)
TeamCreate(team_name="oc-team", description="OpenCode analysis team")

# 2. Spawnar workers — cada uno abre su propio tmux split-pane
Agent(
  subagent_type="swarm-code:opencode-worker",
  name="worker-análisis",
  team_name="oc-team",
  prompt="Analiza los endpoints en src/api/ y reporta via SendMessage al team-lead."
)

Agent(
  subagent_type="swarm-code:opencode-worker",
  name="worker-review",
  team_name="oc-team",
  prompt="Revisa el último diff y reporta issues via SendMessage al team-lead."
)
```

## Protocolo de comunicación entre agentes

Los workers NO retornan batch output — se comunican via SendMessage:

```
# Worker → Team lead (cuando termina)
SendMessage(to: "team-lead", message: "✓ análisis listo\n---\n<resultado>")

# Team lead → Worker (para dar tarea adicional)
SendMessage(to: "worker-análisis", message: "Ahora revisa también src/lib/")

# Worker ACK inmediato
⚡ oc | revisando src/lib/
```

## Cuándo usar cada tipo

| Tarea | Agente | Costo |
|-------|--------|-------|
| Code review, análisis de bugs | opencode-worker | ~$0 |
| Planear implementación | opencode-worker | ~$0 |
| Preguntas de arquitectura | opencode-worker | ~$0 |
| Orquestar, sintetizar, decidir | Claude Sonnet | $3/M |

## Flujo completo

```
1. Claude recibe tarea compleja
2. Claude verifica: ¿tmux activo? ¿agent-teams habilitado?
3. Claude crea team con TeamCreate
4. Claude spawna opencode-workers — cada uno abre split-pane en tmux
5. Workers analizan → reportan via SendMessage al team-lead
6. Claude sintetiza respuestas y responde al usuario
```

## Ahorro de tokens estimado

Sin orquestación: Claude hace todo = 8,000-15,000 tokens por tarea compleja
Con agent teams: Claude solo dirige = 1,000-2,000 tokens por tarea compleja
**Ahorro: ~80%**

## Reglas

- Claude NO usa `Promise.all` ni parallel agents — usa agent teams + SendMessage
- Los workers siempre abren tmux split-pane (nunca new-window)
- Los workers se comunican via SendMessage, no stdout batch
- Claude SÍ sintetiza resultados de múltiples workers
- Claude SÍ valida el resultado final antes de presentarlo al usuario

## Bridge path

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-bridge.sh" "<prompt>"
```
