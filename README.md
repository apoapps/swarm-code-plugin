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
| `/swarm-code:ask` | Delegate a question to OpenCode |
| `/swarm-code:review` | Code review of git changes (severity-ordered) |
| `/swarm-code:plan` | Implementation plan (ArchitectTool-style) |
| `/swarm-code:setup` | Detect models, configure priority list |
| `/swarm-code:execute` | Auto-router — picks ask/review/plan automatically |
| `/swarm-code:orchestrate` | Multi-agent decomposition for complex tasks |

---

## Quick start

### 1. Install OpenCode CLI
```bash
# https://opencode.ai/docs/install
```

### 2. Add the plugin to Claude Code
```bash
claude plugin add /path/to/opencode-plugin-cc
```

### 3. Configure models
```
/swarm-code:setup
```
Detects all available models on your system (50+). No hardcoded models — uses whatever you have.

### 4. Use it
```
/swarm-code:ask How does the auth middleware work?
/swarm-code:review
/swarm-code:plan Add WebSocket notifications
```

---

## Spawning opencode-worker as a teammate

The core of the swarm pattern. Use from Claude Code teams:

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
opencode-bridge.sh          ← the core adapter
  1. detect task type       (ask/review/plan from prompt content)
  2. inject system prompt   (ArchitectTool for plan, severity format for review)
  3. open tmux window       (user sees live progress)
  4. run opencode-runner    (handles model selection + retry + fallback)
  5. wait for completion
  6. return clean output

opencode-runner.mjs         ← CLI wrapper
  - reads modelPriority from config
  - detects available models dynamically
  - retry x3 with exponential backoff
  - fallback to next model on failure

opencode-worker agent       ← team member
  - ACK immediately on task receipt
  - run bridge
  - SendMessage result to team lead
  - loop: check TaskList for next task
```

---

## Plugin structure

```
plugins/opencode/
├── .claude-plugin/plugin.json     # Plugin metadata (name: swarm-code)
├── commands/                      # /swarm-code:* slash commands
├── agents/opencode-worker.md      # Team member agent definition
├── skills/
│   ├── opencode-runtime/          # Bridge invocation contract
│   ├── opencode-prompting/        # Prompt composition (sourcemap-based)
│   ├── opencode-result-handling/  # How Claude validates responses
│   └── opencode-orchestrate/      # Multi-team swarm pattern guide
├── scripts/
│   ├── opencode-bridge.sh         # Core adapter (tmux + prompt injection)
│   ├── opencode-runner.mjs        # CLI wrapper with retry + fallback
│   ├── opencode-chat.sh           # Persistent multi-turn chat sessions
│   └── lib/                       # State, job control, orchestrator
└── hooks/
    ├── hooks.json                 # All hooks enabled
    ├── task-type.mjs              # Auto-classifies ask/review/plan
    ├── pre-execution.mjs          # Auto-delegation scoring
    └── implicit-command.mjs       # NLP command detection
```

---

## Requirements

- Node.js ≥ 18
- OpenCode CLI installed
- Claude Code with plugin support
- Git (for review commands)
- tmux (optional, for live progress windows)

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
