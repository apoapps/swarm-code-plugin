---
description: Initialize swarm-code team — detect tmux, configure models, show team status
argument-hint: '[--upgrade] [--reset] [--test] [--json]'
allowed-tools: Bash(node:*), Bash(git:*), Bash(tmux:*), AskUserQuestion
---

<!-- Made by Alejandro Apodaca Cordova (apoapps.com) -->

# swarm-code init

Sets up and shows status of the swarm-code team. The **only** user-facing command.

Raw arguments: `$ARGUMENTS`

## Run

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" init $ARGUMENTS
```

Return the output verbatim to the user.

## What it does

1. Detects tmux → creates `oc-team` window automatically if in tmux session
2. Checks OpenCode availability and detects available models
3. Shows version (`v2.x · git:<hash>`), active model, and team status
4. If no models configured → runs first-time setup wizard interactively

## After init — Claude delegates automatically

Once initialized, Claude routes tasks internally without user-visible commands:

| Task type | Internal call |
|-----------|--------------|
| Analysis / questions | `node runner.mjs execute "<task>"` |
| Code review | `node runner.mjs review` |
| Implementation planning | `node runner.mjs plan "<task>"` |
| Complex multi-faceted | `node runner.mjs orchestrate "<task>"` |
| Job status | `node runner.mjs status` |
| Job result | `node runner.mjs result [job-id]` |

Claude picks the right mode automatically — the user never needs to type these.

## Flags

| Flag | Action |
|------|--------|
| `--upgrade` | Pull latest from git, sync installed plugin, show changelog |
| `--reset` | Clear model configuration |
| `--test` | Test the active model chain with a probe |
| `--json` | Machine-readable output for Claude to parse |

## If models not configured (first-time setup)

Run to list all models available in the user's OpenCode installation:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" models
```

Then ask the user which one they want with `AskUserQuestion`, and set it:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" init --set-primary "<chosen-model>"
```

## If `--upgrade` flag

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" init --upgrade
```

Pulls latest changes from the git remote and applies them to the installed plugin.
Show the output verbatim — includes version bump and what changed.
