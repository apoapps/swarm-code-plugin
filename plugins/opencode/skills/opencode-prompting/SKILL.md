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

## What to delegate (good for OpenCode)

- Fast code review with structured output
- Implementation planning and architecture suggestions
- Explaining code patterns and concepts
- Finding common bugs and anti-patterns
- Generating boilerplate and scaffolding

## What NOT to delegate (keep in Claude or use Codex)

- Complex multi-file refactoring reasoning
- Deep debugging with many interdependencies
- Novel algorithm design
- Nuanced architecture decisions with many tradeoffs
- Tasks requiring repository-wide understanding

## Integration notes

- When Claude proactively delegates, compose the prompt using these templates.
- Claude should NOT forward the raw user message. Enrich it with context first.
- After receiving the response, Claude validates per `opencode-result-handling` skill.
