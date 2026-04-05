---
name: opencode-result-handling
description: How Claude should process and present OpenCode worker results — validate, synthesize, present. Token-efficient.
user-invocable: false
---

<!-- Made by Alejandro Apodaca Cordova (apoapps.com) -->

# OpenCode Result Handling

Workers return results via SendMessage. Claude validates and presents them — never regenerates from scratch.

---

## Core principle

Workers do the heavy analysis. Claude **validates and synthesizes**, spending ~200 tokens max on commentary. This is where the token savings compound.

---

## When you receive a worker result via SendMessage

1. **Sanity check** — does it actually answer the question asked?
2. **File references** — spot-check 1-2 if the response cites files/lines you haven't seen
3. **Code correctness** — are code suggestions syntactically valid for this language?
4. **Completeness** — anything obvious missing?

If all 4 pass → present with a one-line "✓ validated" note and stop.

If issues found → add a brief "Claude notes:" section at the end, flag what's wrong.

---

## Presenting results

- Keep file paths and line numbers exactly as the worker reported them
- Present code snippets as-is unless obviously wrong
- Preserve severity ratings (CRITICAL / HIGH / MEDIUM / LOW)
- Note if a fallback model was used: `(fallback: X, primary Y unavailable)`

**Don't:**
- Re-explain what the worker already explained clearly
- Rewrite correct code the worker provided
- Add hedging ("I think", "it seems") — be direct
- Auto-fix issues from a review — ask the user which ones to fix first

---

## If the worker fails or returns empty

- Say so briefly: "OpenCode worker failed to return a result."
- Do NOT generate a substitute answer to fill the gap
- Suggest: try again, or handle this task directly in Claude if it's simple enough

---

## After a code review

**STOP after presenting.** Do not auto-fix. Ask:
> "Which of these issues would you like me to fix?"

Wait for the user to choose before touching any files.

---

## Validation cost budget

Spend at most **~200 tokens** on validation. If the worker's output is solid, just say so in one line.
