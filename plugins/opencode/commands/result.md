---
description: Fetch the result of a completed OpenCode job
argument-hint: '[job-id] [--json]'
allowed-tools: Bash(node:*), Read, Glob, Grep
---

<!-- Made by Alejandro Apodaca Cordova (apoapps.com) -->

Fetch the result of a completed OpenCode job and validate it.

Raw arguments: `$ARGUMENTS`

Run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" result $ARGUMENTS
```

After getting the result:
- Validate per `opencode-result-handling` skill.
- Present with brief validation commentary.
- If the result was a review, do NOT auto-fix — ask the user first.
