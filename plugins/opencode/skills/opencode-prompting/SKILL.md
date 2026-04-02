---
name: opencode-prompting
description: Internal guidance for composing effective prompts for OpenCode models
user-invocable: false
---

<!-- Made by Alejandro Apodaca Cordova (apoapps.com) -->

# OpenCode Prompting

Use this skill when Claude needs to compose a prompt to delegate to OpenCode via the configured model.

The configured model varies by user setup. Prompts should be structured, direct, and focused to get the best results regardless of model.

## Prompt structure

Use clear sections with markdown headers:

```
## Task
[What to do — one clear sentence]

## Context
[Relevant code, file paths, error messages]

## Constraints
[Output format, length limits, what NOT to do]

## Expected Output
[Exact shape of the answer you want]
```

## Rules for effective prompts

1. **One task per prompt.** Don't combine review + planning + debugging.
2. **Include code context inline.** The model can't read files — paste the relevant code.
3. **Be specific about output format.** "List issues as bullet points with severity" not "review the code".
4. **Set length limits.** "Max 500 words" or "Max 10 bullet points" prevents rambling.
5. **Avoid open-ended questions.** "What are the 3 biggest issues?" not "What do you think?"

## Prompt templates by task type

### For code review
```
## Task
Review this code diff for bugs, security issues, and code quality problems.

## Code
{diff}

## Output Format
List findings as:
- **[SEVERITY]** file:line — description
Where SEVERITY is CRITICAL, HIGH, MEDIUM, or LOW.
Max 10 findings, ordered by severity.
```

### For architecture planning
```
## Task
Create an implementation plan for: {description}

## Current State
{relevant file structure or code}

## Output Format
1. Files to create/modify (with paths)
2. Key decisions and tradeoffs
3. Step-by-step implementation order
4. Risks and mitigations
Keep under 800 words.
```

### For debugging/questions
```
## Task
{question}

## Context
{error message, stack trace, relevant code}

## Output Format
1. Root cause (one sentence)
2. Fix (code snippet)
3. Why this works (one sentence)
```

## Smart Model Routing — Claude picks the best model per task

Claude has access to 50+ models through OpenCode. Before delegating, Claude should pick the right model for the task. Use `--model <id>` to override the default.

To check available models cheaply (uses 5-min cache, minimal tokens):
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-runner.mjs" models
```

### Routing guide by task type

| Task | Best model tier | Why | Example models |
|------|----------------|-----|----------------|
| Quick question, explanation | Fast/cheap | Speed over depth | `minimax/MiniMax-M2.7-highspeed`, free variants |
| Code review (small diff) | Fast/cheap | Structured output, speed | `minimax/MiniMax-M2.7`, `minimax/MiniMax-M2.5` |
| Code review (large diff) | Medium | Needs more context window | `openai/gpt-5.2-codex`, `github-copilot/gpt-5.1-codex` |
| Architecture planning | Medium-heavy | Needs reasoning depth | `openai/gpt-5-codex`, `github-copilot/gpt-5.4` |
| Deep debugging | Heavy | Complex multi-step reasoning | `openai/gpt-5.1-codex-max`, `github-copilot/gpt-5.4` |
| Security audit | Heavy | Must not miss vulnerabilities | `openai/gpt-5.1-codex`, `github-copilot/gpt-5.2-codex` |
| Boilerplate/scaffolding | Fast/free | Simple pattern matching | `opencode/*-free` variants |

### Decision flow for Claude

1. Check task complexity: trivial / moderate / complex
2. If trivial (<50 tokens to answer): don't delegate, answer directly
3. If moderate: use configured default (no `--model` needed)
4. If complex: add `--model openai/gpt-5.1-codex` or similar heavy model
5. If FREE models suffice: use `opencode/*-free` variants to save even more

### The output ALWAYS shows which model ran

Every response from the plugin includes a header:
```
---
**opencode** | ask | model: `minimax/MiniMax-M2.7` | attempts: 1/3 | OK
---
```
Claude MUST read this header to know what model produced the output and adjust validation depth accordingly:
- Free/fast model output → more scrutiny needed
- Codex/heavy model output → lighter validation, higher trust

## What to delegate (good for OpenCode)

- Fast code review with structured output
- Implementation planning and architecture suggestions
- Explaining code patterns and concepts
- Finding common bugs and anti-patterns
- Generating boilerplate and scaffolding

## What NOT to delegate (keep in Claude directly)

- Complex multi-file refactoring reasoning
- Deep debugging with many interdependencies
- Novel algorithm design
- Tasks requiring writing/editing actual code
- Anything under 50 tokens to answer

## Integration notes

- When Claude proactively delegates, compose the prompt using these templates.
- Claude should NOT forward the raw user message. Enrich it with context first.
- After receiving the response, Claude validates per `opencode-result-handling` skill.
- Claude should check the model header to calibrate how much validation is needed.
