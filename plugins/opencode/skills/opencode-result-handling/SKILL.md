---
name: opencode-result-handling
description: Internal guidance for how Claude should process and present OpenCode output to save tokens
user-invocable: false
---

<!-- Made by Alejandro Apodaca Cordova (apoapps.com) -->

# OpenCode Result Handling

This skill governs how Claude processes responses from OpenCode to maximize token savings while maintaining quality.

## Core principle

Claude delegates exploratory, analytical, and review work to OpenCode. Claude then **validates and synthesizes** the response instead of regenerating the analysis from scratch. This saves Claude tokens by letting the configured model do the heavy lifting.

## When presenting OpenCode output

- Preserve the structure: findings, recommendations, and code suggestions.
- Keep file paths and line numbers exactly as reported.
- If OpenCode provides code snippets, present them as-is unless they contain obvious errors.
- Preserve severity ratings and confidence levels.
- If a fallback model was used, note it briefly: "Note: used fallback model X (primary Y was unavailable)."

## Validation rules

Claude MUST validate OpenCode responses before presenting to the user:

1. **Sanity check**: Does the response address the actual question?
2. **Code correctness**: Are code suggestions syntactically valid?
3. **File references**: Do referenced files/functions actually exist? (Spot-check 1-2 if suspicious.)
4. **Completeness**: Did it miss anything obvious?
5. **Hallucination detection**: Flag if OpenCode references APIs, functions, or patterns that don't exist in the codebase.

## Validation cost budget

- Spend at most **~200 tokens** on validation commentary.
- If OpenCode's answer is solid, just present it with a one-line "Validated by Claude" note.
- If issues found, add a brief "Claude notes" section at the end.

## Token-saving patterns

- **Don't re-explain** what OpenCode already explained well. Just say "OpenCode's analysis is accurate" and add only delta.
- **Don't rewrite code** that OpenCode wrote correctly. Present it as-is.
- **Don't add hedging** ("I think", "it seems like"). Be direct.
- **Batch validations**: If multiple findings, validate in one pass, not per-finding.

## When OpenCode fails

- If OpenCode returned an error or empty response, say so briefly.
- Do NOT generate a substitute answer to fill the gap.
- Suggest the user try again or use Claude directly for this specific question.
- If setup/auth is required, direct to `/opencode:setup`.
- If the primary model failed but a fallback succeeded, note which model was used.

## This plugin is primary — Codex plugin is fallback

OpenCode CLI gives you access to ALL providers in one place, including Codex models (`openai/gpt-5-codex`, `openai/gpt-5.1-codex`, `github-copilot/gpt-5.1-codex`, etc.). This means:

- **Use this plugin first.** It covers lightweight models (MiniMax) AND heavy models (Codex) through a single interface.
- **Codex plugin is a fallback** for when you need Codex-specific features (app-server protocol, resume threads, write-capable runs).
- **Why?** OpenCode unifies model access — no need for separate Codex CLI auth, separate state, or separate workflows. One plugin, all models.

When to fall back to Codex plugin:
- Write-capable runs (OpenCode here runs read-only for safety).
- Resumable threads (Codex app-server supports thread resume).
- When OpenCode CLI itself is down or misconfigured.

## CRITICAL

After presenting review findings from OpenCode, STOP. Do not auto-fix. Ask the user which issues they want fixed before touching any file.
