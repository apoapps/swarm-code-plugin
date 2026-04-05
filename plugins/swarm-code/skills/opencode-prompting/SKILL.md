---
name: opencode-prompting
description: How to compose effective prompts for OpenCode workers. Include context inline, be specific, set output format.
user-invocable: false
---

<!-- Made by Alejandro Apodaca Cordova (apoapps.com) -->

# OpenCode Prompting

Workers can't read files — all context must be in the prompt. A good prompt = a good result.

---

## Prompt structure

```
## Task
[One clear sentence: what to do]

## Context
[Paste the relevant code, diff, error message, or file content directly here]

## Output Format
[Exact shape: "List as bullets with severity", "Max 500 words", "Steps in order"]
```

---

## Rules

1. **One task per worker.** Don't combine review + planning + debugging in one prompt.
2. **Paste code inline.** Workers cannot `cat` files — include the relevant excerpt.
3. **Specify output format.** "3 bullet points max" → worker stays focused.
4. **Set length limits.** "Under 400 words" → prevents rambling.
5. **Avoid vague questions.** "What are the 3 biggest issues?" beats "What do you think?"

---

## Templates by task type

### Code review
```
## Task
Review this code for bugs, security issues, and code quality problems.

## Code
<paste diff or file content here>

## Output Format
Bullet list: [SEVERITY] file:line — description
SEVERITY: CRITICAL | HIGH | MEDIUM | LOW
Max 10 findings, CRITICAL first.
```

### Implementation plan
```
## Task
Create an implementation plan for: <description>

## Current state
<paste relevant file structure or existing code>

## Output Format
1. Files to create/modify (with paths)
2. Key decisions and tradeoffs
3. Step-by-step order
4. Risks
Max 600 words.
```

### Debugging / Q&A
```
## Task
<specific question>

## Context
<error message, stack trace, or relevant code>

## Output Format
1. Root cause (one sentence)
2. Fix (code snippet if applicable)
3. Why this works (one sentence)
```

---

## What to delegate (good fit for OpenCode)

- Code review with structured output
- Implementation planning
- Explaining code patterns
- Finding bugs and anti-patterns in a specific file/diff
- Generating boilerplate

## What NOT to delegate (keep in Claude)

- Multi-file refactoring that requires real-time edits
- Tasks under 50 tokens to answer
- Anything requiring iterative back-and-forth with the user
- Tasks where you need live file access during the answer

---

## Model selection

The worker uses the model configured via `/swarm-code:init`. Pass `model="haiku"` to the Agent tool — Haiku is cheap and fast, sufficient for most delegation tasks.

For complex tasks (security audit, architecture review), pass the prompt directly to Claude instead of delegating — the token savings don't justify the quality tradeoff for high-stakes decisions.

---

## Composing the prompt

Claude should **NOT** forward the raw user message to the worker. Always:
1. Add the relevant code/context inline
2. Specify the output format clearly
3. Set length limits

Then pass the enriched prompt to the worker.
