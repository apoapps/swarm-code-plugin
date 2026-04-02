---
description: Run an OpenCode code review against local git state to save Claude tokens
argument-hint: '[--wait|--background] [--base <ref>] [--scope auto|working-tree|branch] [--model <model>]'
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), AskUserQuestion
---

<!-- Made by Alejandro Apodaca Cordova (apoapps.com) -->

Run a code review via OpenCode (configured model with auto-fallback) against local git changes.

Raw slash-command arguments:
`$ARGUMENTS`

Core constraint:
- This is a review-only command.
- Do not fix issues, apply patches, or suggest you are about to make changes.
- Your job is to run the review, validate findings, and present them.

Execution mode rules:
- If `--wait`, run foreground. If `--background`, run background.
- Otherwise, estimate review size:
  - Run `git status --short` and `git diff --shortstat` to gauge size.
  - If 1-2 small files: recommend foreground.
  - Otherwise: recommend background.
  - Use `AskUserQuestion` exactly once with two options (recommended first):
    - `Wait for results` / `Run in background`

Foreground flow:
- Run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" review $ARGUMENTS
```
- Validate the output per `opencode-result-handling`:
  - Check that findings reference real files.
  - Spot-check 1-2 referenced files if suspicious.
  - If MiniMax missed obvious issues, add them in a "Claude additions" section.
- Present findings ordered by severity.
- Keep validation commentary under 200 tokens.

Background flow:
```typescript
Bash({
  command: `node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" review $ARGUMENTS`,
  description: "OpenCode review",
  run_in_background: true
})
```
- Tell user: "OpenCode review started in background. Check `/opencode:status` for progress."

CRITICAL: After presenting review findings, STOP. Do not fix any issues. Ask the user which issues they want fixed.

Integration with Codex:
- If both plugins are installed and the review is large (>20 files), suggest using `/codex:review` for deeper analysis.
- OpenCode review is best for quick, focused reviews of small-to-medium changes.
- Model used depends on `/opencode:setup` configuration with automatic fallback.
