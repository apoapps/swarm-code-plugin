---
name: opencode-runtime
description: Spawn a Haiku worker to run a task via OpenCode. The worker calls oc-run.sh which executes opencode run headlessly. No tmux, no server, no custom UI.
user-invocable: false
---

<!-- Made by Alejandro Apodaca Cordova (apoapps.com) -->

# OpenCode Runtime

Spawn a Haiku subagent that relays your task to OpenCode via bash. Progress shows in Claude's native agent panel.

---

## How to delegate

```
Agent(
  subagent_type="swarm-code:opencode-worker",
  model="haiku",
  prompt="<your full task with all context inline>"
)
```

The Haiku worker will:
1. ACK via SendMessage
2. Run `bash oc-run.sh "<prompt>"` → calls `opencode run --model <m> "<prompt>"`
3. Return the result via SendMessage

---

## When to use

- Code review of a specific diff or file excerpt
- Writing an implementation plan with clear requirements
- Answering a specific technical question with context
- Any analytical task over ~50 tokens where you'd repeat work OpenCode can do

---

## When NOT to use

- Tasks that need live file editing (do those yourself)
- Short questions you can answer in one sentence
- Tasks requiring iterative back-and-forth with the user mid-task

---

## Prompt requirements

Workers CANNOT read files. Include all context inline:

```
## Task
Review this function for bugs.

## Code
<paste the actual code here>

## Output Format
Bullet list: [SEVERITY] file:line — description. Max 5 findings.
```

---

## Model setup

Run `/swarm-code:init` once per project to configure the OpenCode model.
The worker automatically uses the configured model — no manual override needed.
