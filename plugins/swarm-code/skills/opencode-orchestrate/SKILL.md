---
name: opencode-orchestrate
description: Multi-team orchestration pattern — Claude directs, Haiku agents edit, OpenCode workers analyze. Maximum parallelism, minimum Claude token spend.
user-invocable: true
---

<!-- Made by Alejandro Apodaca Cordova (apoapps.com) -->

# OpenCode Multi-Team Orchestration

## El principio

**Claude (Sonnet/Opus) = director.** No hace análisis — delega todo lo analítico.
**Claude Haiku agents = ejecutores.** Leen archivos, editan código, son baratos.
**OpenCode workers = análisis barato.** Review, planning, preguntas — sin costo Claude.

```
Claude Sonnet (orquestador)
  ├── Team A: haiku-agent + opencode-worker  → feature A
  ├── Team B: haiku-agent + opencode-worker  → feature B
  └── Team C: haiku-agent + opencode-worker  → integration
```

## Cómo spawnar un team con opencode-worker

```python
# 1. Crear el team
TeamCreate(team_name="mi-team", description="...")

# 2. Spawnar agente principal (Haiku para editar código)
Agent(
  subagent_type="general-purpose",
  model="haiku",
  name="dev-agent",
  team_name="mi-team",
  prompt="..."
)

# 3. Spawnar opencode-worker (análisis gratis)
Agent(
  subagent_type="opencode:opencode-worker",
  name="oc-worker",
  team_name="mi-team",
  prompt="Espera tareas de análisis del team lead."
)
```

## Protocolo de delegación (token-efficient)

Cuando quieras análisis, envía al opencode-worker:
```
SendMessage(to: "oc-worker", message: "<tu prompt>")
```

El worker responde inmediatamente con ACK (1 línea, cero análisis):
```
⚡ oc | analizando el módulo de auth
```

Cuando termina, envía el resultado completo. Claude solo lee el resultado final — no el proceso.

## Cuándo usar cada tipo

| Tarea | Agente | Costo |
|-------|--------|-------|
| Editar archivos, leer código | Haiku agent | $0.25/M |
| Code review, análisis de bugs | opencode-worker | ~$0 |
| Planear implementación | opencode-worker | ~$0 |
| Preguntas de arquitectura | opencode-worker | ~$0 |
| Orquestar, sintetizar, decidir | Claude Sonnet | $3/M |

## Flujo completo de ejemplo

```
1. Claude recibe tarea compleja
2. Claude descompone en subtareas (usa su inteligencia, ~500 tokens)
3. Claude crea 2-3 teams en paralelo
4. Por cada team: spawna haiku-agent + opencode-worker
5. haiku-agent: lee archivos, edita código (usa Haiku, ~$0.02 por task)
6. opencode-worker: analiza, revisa, planea (usa OpenCode, ~$0)
7. Claude recibe ACKs (1 línea c/u) y resultados cuando terminan
8. Claude sintetiza y responde al usuario (~300 tokens)
```

## Ahorro de tokens estimado

Sin orquestación: Claude hace todo = 8,000-15,000 tokens por tarea compleja
Con orquestación: Claude solo dirige = 1,000-2,000 tokens por tarea compleja
**Ahorro: ~80%**

## Reglas

- Claude NO hace análisis que puede hacer OpenCode
- Claude NO edita archivos que puede editar Haiku
- Claude SÍ toma decisiones arquitectónicas
- Claude SÍ sintetiza resultados de múltiples workers
- Claude SÍ valida el resultado final antes de presentarlo al usuario

## Bridge path (para copiar)

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/opencode-bridge.sh
```
