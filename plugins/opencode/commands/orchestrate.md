---
description: Multi-agent orchestration — decompose complex tasks, assign named agents, run in parallel
argument-hint: '[--background|--wait] <complex task description>'
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), AskUserQuestion
---

<!-- Made by Alejandro Apodaca Cordova (apoapps.com) -->

Multi-agent orchestration for complex tasks. OpenCode decomposes the task, assigns named Greek-mythology agents, and runs them in parallel with models matched to complexity.

Raw arguments: `$ARGUMENTS`

## How it works

1. **OpenCode decomposes** the task into 2-5 sub-tasks (costs 0 Claude tokens)
2. **Named agents** get assigned — each with a Greek mythology name, a trait, and the best model for their sub-task complexity
3. **Parallel execution** — all agents run simultaneously
4. **Progress streaming** — user sees each agent's status in real-time
5. **Claude validates** — reads all agent outputs, resolves contradictions, synthesizes final answer

## When to use this (Claude should auto-detect)

Use orchestration when the task is:
- **Multi-faceted**: needs analysis from different angles (security + performance + architecture)
- **Large scope**: affects many files or systems
- **Ambiguous**: benefits from multiple perspectives
- **Critical**: important decisions that need cross-checking

Do NOT orchestrate when:
- The task is simple and single-focus
- It can be answered in <100 tokens
- It's a straightforward code review (use /opencode:review instead)

## Execution

Before running, gather relevant context:
- Read 2-3 key files referenced in the task
- Get git status if relevant
- Include this context in the task description

Run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" orchestrate "<enriched task with context>"
```

## Progress output (stderr)

The script streams real-time progress to stderr:
```
┌─ Orchestrator ─────────────────────────────────
│ Analyzing task complexity...
│ Decomposed into 3 sub-tasks
│
│ Agents assigned:
│   [Artemis] security audit (heavy) → gpt-5.1-codex
│   [Theseus] performance analysis (medium) → MiniMax-M2.7
│   [Callisto] architecture review (light) → MiniMax-M2.5
│
│ Executing 3 agents in parallel...
└────────────────────────────────────────────────

[Artemis] working on: security audit... (gpt-5.1-codex)
[Theseus] working on: performance analysis... (MiniMax-M2.7)
[Callisto] working on: architecture review... (MiniMax-M2.5)
[Callisto] done (8.2s)
[Theseus] done (12.4s)
[Artemis] done (18.7s)

┌─ Results ──────────────────────────────────────
│ 3/3 agents completed (18.7s total)
└────────────────────────────────────────────────
```

## After receiving results

Claude MUST:
1. Read each agent's findings in the output
2. Note which model produced each finding (in the header per agent)
3. Identify agreements and contradictions between agents
4. Synthesize a unified answer
5. Flag any agent output that looks hallucinated
6. Present the synthesis, crediting agents by name

Keep synthesis under 500 tokens. The agents already did the heavy lifting.

## Background mode

```typescript
Bash({
  command: `node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" orchestrate "<task>"`,
  description: "OpenCode orchestration (multi-agent)",
  run_in_background: true
})
```

Tell user: "Multi-agent analysis started in background with N agents. Check /opencode:status."
