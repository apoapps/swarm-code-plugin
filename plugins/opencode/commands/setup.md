---
description: Detect available OpenCode models, configure priority list, and verify installation
argument-hint: '[--set-primary <model>] [--add-fallback <model>] [--remove-fallback <model>] [--test] [--reset] [--json]'
allowed-tools: Bash(node:*), AskUserQuestion
---

<!-- Made by Alejandro Apodaca Cordova (apoapps.com) -->

Interactive setup wizard for the OpenCode plugin.

Raw arguments: `$ARGUMENTS`

## If the user passed flags (--set-primary, --add-fallback, --remove-fallback, --test, --reset)

Run the command directly and show the output:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" setup $ARGUMENTS
```
Return the output verbatim — the script handles formatting.

## If no flags (first-time setup or status check)

### Step 1: Show the dashboard

Run the formatted setup display:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" setup
```
Return this output verbatim to the user — it's a formatted CLI dashboard.

### Step 2: Check if configuration is needed

Also run JSON mode to get structured data:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" setup --json
```

Check `modelPriority` in the JSON:
- If empty → needs first-time configuration (go to Step 3)
- If `activeModel` is null → primary is unavailable (go to Step 4)
- If everything is good → setup complete, no further action needed

### Step 3: First-time model selection wizard

If `modelPriority` is empty, guide the user through configuration:

1. Use `AskUserQuestion` to pick a PRIMARY model. Present the top recommended models:
   - `minimax/MiniMax-M2.7` — Fast, cheap, great default
   - `minimax/MiniMax-M2.7-highspeed` — Ultra-fast variant
   - `openai/gpt-5.1-codex` — Deep analysis, Codex-powered
   - `github-copilot/gpt-5.4` — Heavy reasoning
   - `opencode/minimax-m2.5-free` — Free tier

2. Set the primary:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" setup --set-primary "<chosen model>"
```

3. Use `AskUserQuestion` to ask about fallbacks:
   - `Add a fallback model`
   - `Skip — primary only is fine`

4. If they want a fallback, suggest complementary models:
   - If primary is MiniMax → suggest Codex as fallback (different provider = better resilience)
   - If primary is Codex → suggest MiniMax highspeed as fallback (faster)
   - If primary is free tier → suggest MiniMax M2.7 as paid fallback

5. Set the fallback:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" setup --add-fallback "<chosen model>"
```

### Step 4: Model unavailability handling

If `activeModel` is null or `fallbackUsed` is true:

1. Tell the user which model is unavailable.
2. If a fallback is active, show which one is being used.
3. Use `AskUserQuestion`:
   - `Reconfigure models` → go to Step 3
   - `Keep using fallback` → done

### Step 5: Test (optional)

After any configuration change, offer to test:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" setup --test
```

## Important

- The script handles all CLI formatting (colors, boxes, icons). Return its stdout verbatim.
- Do NOT reformat or summarize the script's output — it's designed for direct display.
- Use `AskUserQuestion` for interactive choices, NOT text-based prompts.
