---
description: Delegate a question or analysis to OpenCode (MiniMax M2.7) to save Claude tokens
argument-hint: '[--background|--wait] [--model <model>] <your question>'
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), AskUserQuestion
---

<!-- Made by Alejandro Apodaca Cordova (apoapps.com) -->

Delegate this question to OpenCode (configured model with auto-fallback) and validate the response.

Raw slash-command arguments:
`$ARGUMENTS`

Core constraint:
- This command delegates analysis to a cheaper model (configured via /opencode:setup) to save Claude tokens.
- Claude's job is to compose a good prompt, forward it, and validate the response — NOT to answer the question itself.
- Use the `opencode-prompting` skill to enrich the user's question with relevant context before delegating.

Before delegating:
- Read 1-3 relevant files if the question references specific code, to include context in the prompt.
- If the question is about a specific error, include the error message and relevant code.
- Do NOT read the entire codebase — just the files directly relevant to the question.

Execution mode rules:
- If the raw arguments include `--wait`, run in the foreground.
- If the raw arguments include `--background`, run in a Claude background task.
- Otherwise, default to foreground.

Foreground flow:
- Compose an enriched prompt using `opencode-prompting` patterns.
- Run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" ask "<enriched prompt>"
```
- Validate the output per `opencode-result-handling`:
  - Sanity check: does it address the question?
  - If solid, present with brief "Validated" note.
  - If issues found, add a "Claude notes" correction section.
- Keep your validation commentary under 200 tokens.

Background flow:
- Launch with `Bash` in the background:
```typescript
Bash({
  command: `node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" ask "<enriched prompt>"`,
  description: "OpenCode ask",
  run_in_background: true
})
```
- Tell the user: "OpenCode is processing your question in the background. Check `/opencode:status` for progress."

Model override:
- Default: configured via `/opencode:setup` (auto-detects available models with fallback).
- Add `--model <model>` if the user explicitly requests a specific model.

When NOT to delegate:
- If the question is trivial (can be answered in <50 tokens), just answer directly.
- If it requires writing/editing code, answer directly — OpenCode runs read-only.
- If it requires deep multi-file reasoning that MiniMax can't handle well.
