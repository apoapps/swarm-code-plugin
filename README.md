# OpenCode Plugin for Claude Code

> **Save 60-80% of your Claude tokens** by delegating analytical work to OpenCode models — then let Claude validate the results.

[![Made by ApoApps](https://img.shields.io/badge/Made%20by-Alejandro%20Apodaca%20Cordova-blue)](https://apoapps.com)
[![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-Plugin-purple)](https://claude.ai/code)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![OpenCode Compatible](https://img.shields.io/badge/OpenCode-CLI-orange)](https://opencode.ai)

> **This is NOT an official Anthropic or OpenCode product.** Community plugin made by [Alejandro Apodaca Cordova](https://apoapps.com). Not affiliated with, endorsed by, or sponsored by Anthropic or OpenCode in any way. Use at your own discretion.

---

## The Problem: You Can't Use Claude Inside OpenCode

Anthropic's terms of service **prohibit running Claude models from within third-party coding agents** like OpenCode. You can't configure OpenCode to call Claude as its backend — it's explicitly blocked.

But here's the thing: **you _can_ call OpenCode from within Claude Code.**

### The Reverse Approach

So I flipped it. Instead of trying to put Claude inside OpenCode (which is forbidden), this plugin puts **OpenCode inside Claude Code** as a tool Claude can call.

```
 Blocked by Anthropic:           What this plugin does:
 OpenCode → Claude               Claude Code → OpenCode
        ✗                               ✓
```

This way Claude stays in control, validates everything, and delegates the grunt work to whichever model you configure in OpenCode — MiniMax, Codex, GPT, Gemini, whatever you have access to. **50+ models, zero Anthropic policy violations.**

### Why This Matters

- **Claude Code is powerful but expensive.** Every analytical question, every code review, every planning draft burns Claude tokens at full price.
- **Most of that work doesn't need Claude's full intelligence.** A MiniMax model can draft a code review or answer a question for a fraction of the cost.
- **Claude adds value where it matters** — validating the output, catching hallucinations, and synthesizing results with project-specific knowledge.

### The Token-Saving Pattern

```
Without plugin:  User → Claude (expensive, full analysis) → Answer
With plugin:     User → Claude → OpenCode (cheap draft) → Claude validates → Answer
                                    ↑                           ↑
                              Does the heavy lifting      Spends ~200 tokens
                              (0 Claude tokens)           on validation only
```

**Result:** 60-80% fewer Claude tokens for analytical tasks. Same quality. Full compliance.

---

## Features

| Feature | Command | What It Does |
|---------|---------|-------------|
| **Ask** | `/opencode:ask` | Delegate questions, explanations, debugging analysis |
| **Review** | `/opencode:review` | Code review of git changes with severity ratings |
| **Plan** | `/opencode:plan` | Implementation planning and architecture drafts |
| **Setup** | `/opencode:setup` | Auto-detect models, configure priorities, verify installation |
| **Status** | `/opencode:status` | Check background job progress |
| **Result** | `/opencode:result` | Fetch completed job output |

### Key Capabilities

- **Generic Model Support** — Works with ANY model available in OpenCode (MiniMax, Codex, GPT, Gemini, etc.)
- **Auto-Detection** — Runs `opencode models` to discover what's available on your system
- **Smart Fallback** — Configure a priority list; if your primary model is down, automatically falls to the next one
- **Interactive Setup** — `/opencode:setup` walks you through model selection and configuration
- **Retry Logic** — 3 attempts per model with exponential backoff before falling to next model
- **Background Jobs** — Run reviews in the background with `--background`, check progress anytime
- **Session Management** — Automatic cleanup of jobs when Claude Code session ends
- **Codex Access Through OpenCode** — Access Codex models (`openai/gpt-5-codex`, etc.) without the separate Codex CLI

---

## Quick Start

### 1. Install OpenCode CLI

```bash
# See https://opencode.ai/docs/install for your platform
```

### 2. Install the Plugin

```bash
# From Claude Code, add the plugin:
claude plugin add /path/to/opencode-plugin-cc
```

### 3. Run Setup

```
/opencode:setup
```

This will:
- Detect your OpenCode CLI installation
- List all available models (MiniMax, Codex, GPT, Gemini, etc.)
- Ask which model you want as primary
- Let you pick 1-2 fallback models
- Verify everything works with a quick test

### 4. Start Saving Tokens

```
/opencode:ask How does the authentication middleware work in this project?
/opencode:review
/opencode:plan Add a caching layer to the API routes
```

---

## Architecture

```
┌─────────────────────────────────────────────┐
│                Claude Code                   │
│                                              │
│  User Request                                │
│       ↓                                      │
│  Claude decides: delegate or handle?         │
│       ↓                                      │
│  /opencode:ask|review|plan                   │
│       ↓                                      │
│  ┌──────────────────────────┐                │
│  │   opencode-runner.mjs    │                │
│  │                          │                │
│  │  1. Load model priority  │                │
│  │  2. Try primary model    │ ← retry x3    │
│  │  3. Fallback if needed   │ ← next model  │
│  │  4. Return output        │                │
│  └──────────┬───────────────┘                │
│             ↓                                │
│  OpenCode CLI                                │
│       ↓                                      │
│  ┌──────────────────────────┐                │
│  │   Available Models       │                │
│  │                          │                │
│  │  minimax/MiniMax-M2.7    │  ← Your pick  │
│  │  openai/gpt-5-codex      │  ← Fallback   │
│  │  github-copilot/gpt-5.4  │  ← Fallback   │
│  │  ... 50+ models          │                │
│  └──────────────────────────┘                │
│             ↓                                │
│  Claude validates response (~200 tokens)     │
│       ↓                                      │
│  User gets validated answer                  │
└─────────────────────────────────────────────┘
```

### Plugin Structure

```
plugins/opencode/
├── .claude-plugin/plugin.json     # Plugin metadata
├── commands/                      # Slash commands
│   ├── ask.md                     # /opencode:ask
│   ├── review.md                  # /opencode:review
│   ├── plan.md                    # /opencode:plan
│   ├── setup.md                   # /opencode:setup
│   ├── status.md                  # /opencode:status
│   └── result.md                  # /opencode:result
├── agents/
│   └── opencode-worker.md         # Haiku subagent for delegation
├── skills/
│   ├── opencode-runtime/          # CLI invocation contract
│   ├── opencode-result-handling/  # How Claude validates responses
│   └── opencode-prompting/        # Prompt composition templates
├── scripts/
│   ├── opencode-runner.mjs        # Main command handler
│   ├── session-hook.mjs           # Session lifecycle management
│   └── lib/
│       ├── opencode.mjs           # CLI wrapper with retry + fallback
│       ├── state.mjs              # Config & job persistence
│       └── job-control.mjs        # Background job tracking
├── hooks/hooks.json               # SessionStart/SessionEnd hooks
├── prompts/                       # Prompt templates (ask, review, plan)
└── schemas/                       # Output validation schemas
```

---

## Why OpenCode?

OpenCode CLI is a universal model gateway — 50+ models from MiniMax, OpenAI, GitHub Copilot, Gemini, and more, all through one interface and one auth flow.

---

## Model Fallback System

Configure your models once, and the plugin handles the rest:

```
Primary:   minimax/MiniMax-M2.7        ← Fast, cheap, great for most tasks
Fallback:  openai/gpt-5.1-codex        ← Deep analysis when MiniMax falls short
Fallback:  github-copilot/gpt-5.4      ← Nuclear option
```

If your primary model fails (timeout, rate limit, service down):
1. Retries 3 times with exponential backoff (2s, 4s, 8s)
2. Falls to next model in priority list
3. Notifies Claude which model was actually used
4. Claude adjusts validation based on model capabilities

---


---

## Configuration

### Model Priority

After running `/opencode:setup`, your config is saved per workspace:

```json
{
  "modelPriority": [
    "minimax/MiniMax-M2.7",
    "openai/gpt-5.1-codex"
  ],
  "reviewOnStop": false
}
```

### Change Primary Model

```
/opencode:setup --set-primary openai/gpt-5-codex
```

### Add Fallback

```
/opencode:setup --add-fallback github-copilot/gpt-5.4
```

### Reset Configuration

```
/opencode:setup --reset
```

---

## Examples

### Quick Question
```
/opencode:ask What's the time complexity of this sorting algorithm in utils/sort.ts?
```
Claude enriches the prompt with code context, sends to OpenCode, validates the answer, presents it. You save ~500 Claude tokens.

### Code Review
```
/opencode:review --base main
```
Reviews all changes since `main` branch. Findings listed by severity (CRITICAL → LOW). Claude spot-checks references.

### Implementation Planning
```
/opencode:plan Add WebSocket support for real-time notifications
```
OpenCode drafts the plan, Claude refines it with project-specific knowledge. ~80% token savings.

### Background Review (Large Changes)
```
/opencode:review --background --base main
/opencode:status
/opencode:result
```

---

## Troubleshooting

### "OpenCode CLI not found"
```bash
which opencode
# Should show: /Users/you/.opencode/bin/opencode
```

### "No models available"
```bash
opencode models
# Should list 50+ models
```

### "Primary model unavailable"
Run `/opencode:setup` to reconfigure. The plugin will suggest available alternatives.

### "Timeout on all attempts"
- Check your network connection
- Try a faster model: `--model minimax/MiniMax-M2.7-highspeed`
- Check model status: `opencode models`

---

## Requirements

- **Node.js** >= 18
- **OpenCode CLI** installed and configured
- **Claude Code** with plugin support
- **Git** (for review commands)

---

## How It Came To Be

I wanted Claude and other AI models to collaborate — each one doing what it's best at. The obvious approach was to run Claude from inside OpenCode, but Anthropic's terms of service block that. So I reversed the architecture: **Claude Code calls OpenCode**, not the other way around.

The result is better than the original idea. Claude stays in charge — it decides what to delegate, composes smart prompts, and validates every response. The cheaper model does the heavy lifting. You save tokens. Everybody wins.

Built with the help of [Claude Code](https://claude.ai/code), a lot of documentation reading, and [a bit of concentration](https://en.wikipedia.org/wiki/Methylphenidate).

### Where the Idea Came From

Seeing the [Codex Plugin for Claude Code](https://github.com/openai/codex-plugin-cc) sparked the idea. From there it grew into something with a lot more going for it:

- **`/opencode:execute` — the one command you need.** Auto-classifies the task, picks the right model tier, and routes to single-agent or multi-agent mode automatically. You don't have to think about which subcommand to use.
- **Colored terminal output** — agents show up with names, status, and progress in real time. You can see what's happening.
- **Multi-agent orchestration that actually works.** Getting Claude to consistently do what you ask without pre-built scaffolding is a battle. This plugin gives it the structure it needs — named agents, typed tasks, model attribution — so it reliably follows through instead of going off-script.
- **Claude stays in charge.** It decides what to delegate, enriches the prompts with project context, and validates every response. The cheaper model does the heavy lifting.
- **50+ models through one interface** — switch between MiniMax, GPT, Gemini, Codex and more without changing your workflow.

---

## Disclaimer

**This is an unofficial, community-made plugin.** It is NOT affiliated with, endorsed by, or sponsored by Anthropic, OpenAI, OpenCode, or any other organization. It is an independent project by Alejandro Apodaca Cordova.

- Anthropic, Claude, and Claude Code are trademarks of Anthropic.
- OpenCode is a trademark of its respective owners.
- Codex is a trademark of OpenAI.

Use this plugin at your own risk and discretion.

---

## License

MIT

---

**Made by [Alejandro Apodaca Cordova](https://apoapps.com)**

An unofficial, community plugin. Built because Anthropic said I can't use Claude inside OpenCode. So I put OpenCode inside Claude. Problem solved.
