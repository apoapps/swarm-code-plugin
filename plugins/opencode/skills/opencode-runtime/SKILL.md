---
name: opencode-runtime
description: Internal helper contract for calling the opencode-runner from Claude Code subagents
user-invocable: false
---

<!-- Made by Alejandro Apodaca Cordova (apoapps.com) -->

# OpenCode Runtime

Use this skill only inside the `opencode:opencode-worker` subagent.

Primary helpers:

- **Ask**: `node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" ask "<prompt>"`
- **Review**: `node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" review [--base <ref>]`
- **Plan**: `node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" plan "<prompt>"`
- **Setup**: `node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" setup --json`

Execution rules:

- The worker subagent is a forwarder, not an orchestrator. Its only job is to invoke one command and return stdout unchanged.
- Prefer the helper script over hand-rolled `opencode exec` strings or any other Bash activity.
- Do not call `status`, `result`, or `setup` from the worker subagent.
- Do not inspect the repository, read files, grep, monitor progress, or do follow-up work.
- Return the stdout of the command exactly as-is.
- If the Bash call fails or OpenCode cannot be invoked, return nothing.

Model control:

- Models are auto-detected and configured via `/opencode:setup`. The runner uses the configured priority list with automatic fallback.
- Add `--model <model>` only when the user explicitly requests a specific model.
- The runner script handles fallback to the next available model automatically.

Command selection:

- Use exactly one invocation per handoff.
- `ask` for general questions, explanations, debugging help.
- `review` for code review of git changes.
- `plan` for architecture and implementation planning.
- Choose the command that best matches the user's intent.
