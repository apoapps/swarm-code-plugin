---
name: opencode-orchestrate
description: Multi-team orchestration — Claude directs via experimental agent teams, OpenCode workers analyze in the oc-team pane, communicate via SendMessage.
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

# OpenCode Multi-Team Orchestration

**This skill has restricted `allowed-tools`. Only available: Bash (bridge), TeamCreate, Agent, SendMessage, TaskCreate/Update/List.**

---

## STEP 1 — Environment check (REQUIRED first)

Run this BEFORE anything else:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-bridge.sh" "verify environment"
```

If it fails with "swarm-code requires tmux" → stop and tell the user:
> "swarm-code requires an active tmux session. Run `tmux new -s work` and reopen Claude Code inside it."

---

## STEP 2 — Simple tasks: direct bridge

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-bridge.sh" "<task>"
```

Read the notify file when the job completes. Done.

---

## STEP 3 — Complex tasks: agent team

```python
# 1. Create team
TeamCreate(team_name="oc-team", description="<description>")

# 2. Spawn workers (always with team_name)
Agent(
  subagent_type="swarm-code:opencode-worker",
  name="worker-analysis",
  team_name="oc-team",
  prompt="<specific task> — report result via SendMessage to team-lead"
)

Agent(
  subagent_type="swarm-code:opencode-worker",
  name="worker-review",
  team_name="oc-team",
  prompt="<other task> — report result via SendMessage to team-lead"
)
```

---

## Agent communication protocol (always via SendMessage)

```
# Worker → team-lead when done
SendMessage(to: "team-lead", message: "✓ done\n---\n<result>")

# team-lead → worker (additional task)
SendMessage(to: "worker-analysis", message: "<new task>")
```

**DO NOT use Agent without `team_name`** — the PreToolUse hook will block it.

---

## ⛔ Prohibited in this skill

```
❌ Heavy Bash analysis (grep -r, rg, find recursive, 3+ pipe chains)
   → Hook blocks it → use the bridge instead

❌ Agent without team_name
   → Hook blocks it → use TeamCreate first

❌ Creating new tmux windows (new-window)
   → Bridge uses the existing oc-team pane
```

---

## Architecture

```
/swarm-code:init (user runs once)
  └─► creates oc-team split pane
  └─► activates keyword watcher

Claude (director)
  ├── bridge → writes to oc-team shared log
  ├── worker-1 (team) → bridge → log → SendMessage → team-lead
  └── worker-2 (team) → bridge → log → SendMessage → team-lead
```

Estimated savings: **~80% Claude tokens** vs direct analysis.

---

```bash
# Bridge path
bash "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-bridge.sh" "<prompt>"
```
