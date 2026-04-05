---
description: "RECOMMENDED: Smart auto-router — classifies task, picks model, single or multi-agent, handles everything"
argument-hint: '[--model <model>] <what you need done>'
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), AskUserQuestion
---

<!-- Made by Alejandro Apodaca Cordova (apoapps.com) -->

## MANDATORY: Always use this skill for delegation

When the swarm-code plugin is loaded, Claude **MUST** delegate coding tasks, analysis, and research to the swarm team via:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" execute "<enriched task with context>"
```

**Rules:**
- Do NOT attempt complex analysis yourself when swarm-code is available — delegate it
- Each execution creates a **named agent** (Greek mythology names) that works autonomously
- For multi-faceted tasks, the system auto-decomposes into 2-4 parallel agents
- Always enrich the prompt with file paths, code snippets, and error context before delegating
- After receiving results, validate and synthesize — never blindly forward raw output

---

**This is the recommended command for all delegation.** It auto-detects task complexity and routes to the right execution mode.

Raw arguments: `$ARGUMENTS`

## What it does automatically

1. **Classifies** the task using fast heuristics (no API call, instant):
   - `QUICK` — simple question, single fast agent
   - `STANDARD` — moderate task, single default agent  
   - `DEEP ANALYSIS` — complex task, single heavy model (codex)
   - `MULTI-AGENT` — multi-faceted, 2-4 named agents in parallel

2. **Picks the best model** based on complexity:
   - Light → highspeed/free models
   - Medium → configured default (MiniMax M2.7)
   - Heavy → codex models
   - Multi → mixed models per sub-task

3. **Assigns a named agent** (Greek mythology) — even for single tasks
4. **Executes** with retry + fallback
5. **Streams progress** so the user sees work happening
6. **Returns results** with model attribution header

## How Claude should use this

**Default to this command for ALL delegation.** Don't think about which specific command to use — `execute` decides for you.

Before running:
- Read 1-3 relevant files to include as context
- Enrich the prompt with code snippets, file paths, error details
- Don't forward raw user messages — always add context

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" execute "<enriched task with context>"
```

## Progress output (stderr)

The user sees a recommendation box + agent progress:
```
┌─ opencode:execute ────────────────────────────
│
│   QUICK  recommended
│  Simple task — single fast agent
│  Agents: 1 · Tier: light
│
└─────────────────────────────────────────────

[Athena] working... (MiniMax-M2.7-highspeed)
[Athena] done (MiniMax-M2.7-highspeed)
```

Or for complex tasks:
```
┌─ opencode:execute ────────────────────────────
│
│   MULTI-AGENT  recommended
│  Multi-faceted task — multiple agents recommended
│  Agents: 2-4 · Tier: mixed
│
└─────────────────────────────────────────────

┌─ Orchestrator ─────────────────────────────────
│ Decomposed into 3 sub-tasks
│ ...
```

## After receiving results

Claude validates per `opencode-result-handling`:
- Check the model header to calibrate validation depth
- For multi-agent: synthesize across agent outputs
- For single agent: light validation pass
- Keep synthesis under 300 tokens

## Override model

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" execute --model openai/gpt-5.1-codex "<task>"
```

## When NOT to use execute

- For git-aware code review → use `/opencode:review` (it reads git diff automatically)
- For setup/config → use `/opencode:setup`
- To force multi-agent → use `/opencode:orchestrate`
