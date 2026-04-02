---
description: Check the status of OpenCode background jobs
argument-hint: '[job-id] [--all] [--json]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

<!-- Made by Alejandro Apodaca Cordova (apoapps.com) -->

Show the status of OpenCode background jobs.

Raw arguments: `$ARGUMENTS`

Run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" status $ARGUMENTS
```

Return the output verbatim.
