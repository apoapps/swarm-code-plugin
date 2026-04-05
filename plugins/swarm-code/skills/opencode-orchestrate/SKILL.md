---
name: opencode-orchestrate
description: Delegate one or more tasks to OpenCode workers (Haiku subagents). Single worker for focused tasks, multiple workers in parallel for complex ones. No tmux required.
user-invocable: false
experimental:
  - agent-teams
---

<!-- Made by Alejandro Apodaca Cordova (apoapps.com) -->

# OpenCode Orchestration

Spawn Haiku subagents that call OpenCode via bash. Claude's agent panel shows progress — no custom UI needed.

---

## Decision: single vs parallel workers

| Situation | Pattern |
|-----------|---------|
| One focused task (review, plan, Q&A) | Single worker |
| 2+ independent tasks (review + plan) | Parallel workers |
| Same task from multiple angles | Parallel workers |

---

## Single worker

```
Agent(
  subagent_type="swarm-code:opencode-worker",
  model="haiku",
  prompt="<full task description with all context needed>"
)
```

The worker will ACK, call `oc-run.sh` (which runs `opencode run`), and SendMessage the result back.

---

## Parallel workers (agent team)

```
TeamCreate(team_name="oc-team", description="<what the team is doing>")

Agent(
  subagent_type="swarm-code:opencode-worker",
  name="worker-review",
  team_name="oc-team",
  model="haiku",
  prompt="<task A> — report result via SendMessage to team-lead"
)

Agent(
  subagent_type="swarm-code:opencode-worker",
  name="worker-plan",
  team_name="oc-team",
  model="haiku",
  prompt="<task B> — report result via SendMessage to team-lead"
)
```

Workers run concurrently. Wait for both SendMessage results before synthesizing.

---

## What workers can do

Workers call `opencode run "<prompt>"` headlessly. Prompt them with:
- Code review: "Review this diff for bugs and security issues: <paste diff>"
- Planning: "Create an implementation plan for: <description>. Include files to change, tradeoffs, order."
- Q&A: "Explain how X works in this codebase. Context: <paste relevant code>"
- Analysis: "Find potential issues in: <paste code>"

Always **include the relevant code/context inline** — workers can't read files themselves.

---

## Estimated token savings

~70-80% fewer Claude tokens vs doing the analysis directly.

---

## What NOT to do

- Don't spawn workers for tasks under 50 tokens — just answer directly
- Don't give workers file paths to read — paste the code inline in the prompt
- Don't use `opencode-bridge.sh` — that's deprecated, use `oc-run.sh` via the worker
