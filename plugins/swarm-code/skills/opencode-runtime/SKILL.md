---
name: opencode-runtime
description: Internal helper contract for calling opencode-bridge from Claude Code subagents. Requires tmux active.
user-invocable: false
---

<!-- Made by Alejandro Apodaca Cordova (apoapps.com) -->

# OpenCode Runtime

Use only inside `swarm-code:opencode-worker` subagents.

> **REQUIRES tmux active.** If `$TMUX` is not set, the bridge exits with code 1.
> The worker must verify this before calling the bridge.

## Pre-flight check (required)

```bash
if [[ -z "${TMUX:-}" ]]; then
  SendMessage(to: "team-lead", message: "✗ tmux not active — cannot run bridge")
  exit
fi
```

## Minimal interface

Only the prompt is required. Everything else is automatic:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-bridge.sh" "<prompt>"
```

## What the bridge does automatically

| Step | What | How |
|------|------|-----|
| **tmux check** | Fails if not in a tmux session | Checks `$TMUX` on startup |
| **Task type** | Detects ask / review / plan | Keyword analysis of the prompt |
| **Model** | Picks from project config | Reads modelPriority, dynamic fallback |
| **Visibility** | Writes to shared log → oc-team pane | Real-time output via `tail -f` |
| **Output** | Writes to notify file | Signals team-lead with DONE:JOB_ID |

## Type override (only when needed)

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-bridge.sh" --type review "<prompt>"
bash "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-bridge.sh" --type plan   "<prompt>"
bash "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-bridge.sh" --type ask    "<prompt>"
```

## Model setup (once per project)

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" init
```

Detects all available models in your OpenCode installation and saves the priority list.

## What NOT to do from the worker

- Don't read files (use Read/Grep in the main agent)
- Don't write files
- Don't call `status`, `result`, or `setup` from the worker
- Don't pass `--model` to the bridge (the runner handles it)
- Don't call the bridge without tmux active
