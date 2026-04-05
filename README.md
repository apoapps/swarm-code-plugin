# swarm-code

> **Agent swarm adapter for Claude Code + OpenCode.** Claude Code leads the swarm — OpenCode workers execute the analytical grunt work. Save 70-80% Claude tokens without sacrificing quality.

[![Made by ApoApps](https://img.shields.io/badge/Made%20by-Alejandro%20Apodaca%20Cordova-blue)](https://apoapps.com)
[![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-Plugin-purple)](https://claude.ai/code)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![OpenCode Compatible](https://img.shields.io/badge/OpenCode-CLI-orange)](https://opencode.ai)

> **NOT an official Anthropic or OpenCode product.** Community plugin by [Alejandro Apodaca Cordova](https://apoapps.com). Not affiliated with Anthropic or OpenCode in any way.

---

## What is swarm-code?

**swarm-code is an adapter** that bridges Claude Code and OpenCode into a single agent swarm, with Claude Code as the permanent team lead.

```
WITHOUT swarm-code:           WITH swarm-code:

User → Claude (does it all)   User → Claude (directs)
       ↑ expensive                    ↓
                              OpenCode worker (executes)
                                     ↑ cheap / free
                              Claude (validates + delivers)
```

Anthropic's TOS blocks running Claude inside OpenCode. So this plugin does the reverse: **OpenCode runs inside Claude Code**, as a worker the team lead (Claude) can spawn, assign tasks to, and receive results from.

---

## The swarm architecture

```
Claude Code (Sonnet/Opus) ← permanent team lead
  │
  ├── opencode-worker (analytical tasks)
  │     - code review
  │     - implementation planning
  │     - debugging analysis
  │     - architecture questions
  │
  ├── haiku-agent (file editing, cheap)
  │
  └── opencode-worker (parallel analysis)
```

Claude directs. OpenCode executes. Haiku edits. Each does what it's cheapest at.

---

## Token economy

| Role | Model | Cost | Does |
|------|-------|------|------|
| Team lead | Claude Sonnet | $3/M | Directs, synthesizes, decides |
| Editor | Claude Haiku | $0.25/M | Reads files, edits code |
| Worker | OpenCode | ~$0 | Reviews, plans, analyzes |

**~80% token savings** on complex multi-step tasks.

---

## Commands

| Command | What it does |
|---------|-------------|
| `/swarm-code:init` | Initialize the swarm — detect models, create oc-team pane, activate keyword watcher |

Claude delegates automatically once initialized — no other slash commands needed.

| Internal call | Claude uses when... |
|--------------|---------------------|
| `execute "<task>"` | Analysis or questions |
| `review` | Code review of git changes |
| `plan "<task>"` | Implementation planning |
| `orchestrate "<task>"` | Complex multi-faceted tasks |

---

## Quick start

### 1. Install OpenCode CLI
```bash
# https://opencode.ai/docs/install
```

### 2. Add the plugin to Claude Code
```bash
claude plugin add /path/to/opencode-plugin-cc
# or install from marketplace
```

### 3. Initialize
```
/swarm-code:init
```

Detects all available models on your system (50+), creates the `oc-team` split pane, activates the keyword watcher. That's it — Claude delegates automatically from here.

---

## The oc-team pane

When you run `/swarm-code:init` inside a tmux session, swarm-code opens a horizontal split pane to the right of Claude Code:

```
┌─────────────────────┬──────────────────────────────┐
│                     │  swarm-code · oc-team monitor │
│   Claude Code       │                               │
│                     │  made by Alejandro Apodaca    │
│                     │  apoapps.com                  │
│                     │                               │
│                     │  waiting for jobs...          │
│                     │                               │
│                     │  [job output streams here]    │
└─────────────────────┴──────────────────────────────┘
```

- **On startup**: shows the ApoApps logo + "waiting for jobs..." — **no OpenCode TUI auto-launched**
- **When a job runs**: bridge writes output to a shared log that the pane tails in real time
- **On keyword signal**: Claude writes `_Gi=<id>;OK` → keyword watcher detects it → OpenCode TUI opens in the pane

### Keyword protocol

The plugin uses a keyword-based signal system so Claude can trigger the OpenCode TUI without executing shell commands:

```
Claude writes: _Gi=31337;OK
               │    │    └── acknowledgement
               │    └─────── session/job ID
               └──────────── _G prefix (swarm-code signal namespace)

Watcher detects via tmux pipe-pane → respawns oc-team pane with opencode-splash.sh
```

---

## How jobs flow

```
1. You ask Claude something
2. Claude classifies the task (ask / review / plan / orchestrate)
3. Claude calls opencode-bridge.sh with the prompt
4. Bridge checks for oc-team pane:
     - exists → writes "⚡ job <id> starting..." to shared log
     - missing → creates pane with oc-team-ui.sh
5. Bridge sends prompt to OpenCode via HTTP API (opencode serve)
6. OpenCode processes and returns output
7. Bridge writes result to shared log → appears in oc-team pane
8. Bridge returns clean output to Claude
9. Claude synthesizes and responds to you
```

---

## Spawning opencode-worker as a teammate

```python
# Spawn a worker alongside your main agent
Agent(
  subagent_type="swarm-code:opencode-worker",
  name="oc-worker",
  team_name="my-team",
  prompt="Wait for analysis tasks from the team lead."
)

# Assign a task
SendMessage(to: "oc-worker", message: "Review the auth module for security issues")

# Worker ACKs immediately (1 line)
# ⚡ oc | reviewing auth module

# Worker delivers result when done
# ✓ oc done
# --- [findings here] ---
```

---

## Under the hood

```
session-hook.mjs            ← fires on Claude Code startup
  - detects tmux
  - creates oc-team split pane with oc-team-ui.sh (NO opencode auto-launch)
  - activates keyword watcher via tmux pipe-pane

oc-team-ui.sh               ← the monitor pane
  - shows ApoApps logo splash
  - tails shared log ($CLAUDE_PLUGIN_DATA/swarm-code-logs/oc-team.log)
  - stays alive, never auto-launches opencode

oc-keyword-watcher.sh       ← reads Claude Code pane output via pipe-pane
  - regex: _Gi=([^;]+);OK
  - on match: respawns oc-team pane with opencode-splash.sh (TUI)

opencode-bridge.sh          ← the core job adapter
  - detects task type (ask/review/plan from prompt)
  - injects system prompt
  - finds oc-team pane → writes job status to shared log
  - sends prompt to opencode via HTTP API
  - streams result to shared log + notify file

opencode-runner.mjs         ← CLI wrapper + init
  - reads modelPriority from config
  - detects available models dynamically (50+ across 6 providers)
  - retry x3 with exponential backoff + model fallback
  - init: creates oc-team pane + activates pipe-pane watcher

opencode-splash.sh          ← brand splash (on-demand only)
  - shows ApoApps ASCII logo
  - exec opencode [attach URL] — only runs when keyword triggers it
```

---

## Plugin structure

```
plugins/swarm-code/
├── .claude-plugin/plugin.json     # Plugin metadata
├── commands/
│   └── init.md                    # /swarm-code:init
├── agents/opencode-worker.md      # Team member agent definition
├── skills/
│   ├── opencode-runtime/          # Bridge invocation contract
│   ├── opencode-prompting/        # Prompt composition
│   ├── opencode-result-handling/  # How Claude validates responses
│   └── opencode-orchestrate/      # Multi-team swarm pattern guide
├── scripts/
│   ├── opencode-bridge.sh         # Core job adapter
│   ├── opencode-runner.mjs        # CLI wrapper + init logic
│   ├── session-hook.mjs           # Startup hook (oc-team pane, no auto-opencode)
│   ├── oc-team-ui.sh              # Monitor pane (logo + log tail)
│   ├── oc-keyword-watcher.sh      # Keyword signal detector (_Gi=<id>;OK)
│   ├── opencode-splash.sh         # Brand splash + opencode TUI (on-demand)
│   ├── opencode-send.mjs          # HTTP API sender
│   └── lib/                       # State, job control
└── hooks/
    ├── hooks.json                 # SessionStart + PreToolUse hooks
    └── pre-tool-use.mjs           # Delegation guardrails
```

---

## Requirements

- Node.js ≥ 18
- OpenCode CLI installed (`opencode serve` must work)
- Claude Code with plugin support
- tmux (required for oc-team pane and keyword watcher)
- Git (for review commands)

---

## Anthropic Terms of Service Compliance

This plugin was reviewed against [Anthropic's Acceptable Use Policy (AUP)](https://www.anthropic.com/legal/aup) and the [Additional Use Case Guidelines for Agentic Use](https://support.anthropic.com/en/articles/12005017-using-agents-according-to-our-usage-policy).

**It is compliant.** Here's why:

| Concern | Policy reference | Assessment |
|---------|-----------------|------------|
| Monitoring terminal output via `tmux pipe-pane` | AUP: *"intercept communications or monitor devices **without authorization** of the system owner"* | ✓ You install this on your own machine, with full authorization. No unauthorized interception. |
| Orchestrating OpenCode (another AI) | AUP: Agentic use cases must comply with the AUP | ✓ Delegating to OpenCode for developer productivity is a permitted agentic use. No prohibited content, no deception, no harm. |
| Claude Code plugin distribution | [MCP Directory Policy](https://support.anthropic.com/en/articles/11697096-anthropic-mcp-directory-policy) | ✓ Not submitted to Anthropic's Connector Directory, so directory policy does not apply. Distributed independently as open source. |
| Using Claude to control other AI tools | AUP: Universal Usage Standards | ✓ No prohibited categories triggered — not malware, not multi-system compromise, not bypassing security controls. |

**Sources reviewed:**
- Anthropic Acceptable Use Policy — https://www.anthropic.com/legal/aup
- Agentic Use Guidelines — https://support.anthropic.com/en/articles/12005017-using-agents-according-to-our-usage-policy
- MCP Directory Policy — https://support.anthropic.com/en/articles/11697096-anthropic-mcp-directory-policy

> This plugin is a personal developer productivity tool. You own the machine, you authorize the plugin, you control the data. All activity stays local.

---

## Disclaimer

Unofficial community plugin. Not affiliated with Anthropic, OpenCode, or OpenAI. Anthropic and Claude are trademarks of Anthropic. OpenCode is a trademark of its respective owners.

---

**Made by [Alejandro Apodaca Cordova](https://apoapps.com)**
*Claude Code leads. OpenCode executes. The swarm works.*
