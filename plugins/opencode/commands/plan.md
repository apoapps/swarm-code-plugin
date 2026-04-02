---
description: Delegate implementation planning to OpenCode (MiniMax M2.7) to get a draft plan cheaply
argument-hint: '[--background|--wait] [--model <model>] <what to plan>'
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), AskUserQuestion
---

<!-- Made by Alejandro Apodaca Cordova (apoapps.com) -->

Delegate architecture and implementation planning to OpenCode (configured model with auto-fallback).

Raw slash-command arguments:
`$ARGUMENTS`

Core constraint:
- This command produces a draft plan using a cheaper model.
- Claude then validates, refines, and presents the plan — adding its own expertise where MiniMax falls short.
- This is the most token-efficient way to do planning: MiniMax drafts, Claude edits.

Before delegating:
- Read the project structure (key files, directory layout) to provide context.
- If the user references specific features or files, read those first.
- Include relevant file paths and current architecture in the prompt.

Execution flow:
1. Gather context: Read 2-5 relevant files, get directory structure.
2. Compose enriched prompt using `opencode-prompting` plan template.
3. Run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" plan "<enriched prompt with context>"
```
4. Validate the plan:
   - Are referenced files/paths real?
   - Are suggested dependencies appropriate?
   - Are there missing steps or unrealistic assumptions?
5. Present the plan with Claude's refinements:
   - Keep MiniMax's structure.
   - Add corrections inline with `[Claude: ...]` notes.
   - If the plan is fundamentally wrong, discard and note why.

Background flow (for complex planning):
```typescript
Bash({
  command: `node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" plan "<enriched prompt>"`,
  description: "OpenCode plan",
  run_in_background: true
})
```

Token-saving note:
- A plan from OpenCode costs ~0 Claude tokens for the draft.
- Claude spends ~300-500 tokens validating and refining.
- Total savings: 60-80% compared to Claude generating the full plan from scratch.
- Model used depends on `/opencode:setup` configuration with automatic fallback.
