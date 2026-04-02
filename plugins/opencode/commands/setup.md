---
description: Detect available OpenCode models, configure priority list, and verify installation
argument-hint: '[--json] [--set-primary <model>] [--add-fallback <model>] [--reset]'
allowed-tools: Bash(node:*), AskUserQuestion
---

<!-- Made by Alejandro Apodaca Cordova (apoapps.com) -->

Interactive setup for the OpenCode plugin.

Raw arguments: `$ARGUMENTS`

## Step 1: Run detection

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" setup --json
```

## Step 2: Present results to user

Show:
- OpenCode CLI status (installed/not)
- Detected models grouped by provider
- Current model priority list
- Active model (which one would be used right now)

## Step 3: Interactive configuration

If the user hasn't configured models yet, or if `--reset` is passed:

1. Show all detected models grouped by provider (minimax, openai, github-copilot, etc.)
2. Ask: "Which model do you want as your primary?" (use `AskUserQuestion` with the top 5 models as options)
3. Ask: "Add fallback models? Pick 1-2 backups in case the primary is unavailable." (use `AskUserQuestion`)
4. Save the priority list to config

If the user passed `--set-primary <model>`:
- Validate model is available
- Move it to position 0 in the priority list
- Save config

If the user passed `--add-fallback <model>`:
- Validate model is available
- Add to the end of the priority list
- Save config

## Step 4: Verify

Run a quick test with the primary model:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" ask "Reply with OK"
```

If it works, setup is complete. If not, suggest the next fallback.

## Model unavailability handling

If a previously configured model becomes unavailable:
- Notify the user which model is missing.
- Show which fallback is being used instead.
- Ask if they want to reconfigure: "Your primary model X is unavailable. Using fallback Y. Reconfigure? [Yes / Keep fallback]"
