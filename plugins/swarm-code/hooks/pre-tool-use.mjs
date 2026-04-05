#!/usr/bin/env node
/**
 * pre-tool-use.mjs — PreToolUse guardrail hook (v2.1.1)
 *
 * Intercepts two types of tool calls:
 *
 * 1. Bash — heavy analytical work → suggest/force OpenCode delegation
 * 2. Agent — spawned without team_name → enforce experimental agent-teams pattern
 *
 * Modes:
 *   - Default: outputs a hint (non-blocking) — Claude reads it and decides
 *   - SWARM_FORCE=1: blocks the tool call with a reason
 *   - SWARM_DELEGATE=0: passes through silently (opt-out)
 *
 * Made by Alejandro Apodaca Cordova (apoapps.com)
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(__dirname, "..");
const RUNNER = path.join(PLUGIN_ROOT, "scripts", "opencode-runner.mjs");

// ─── Read hook input ──────────────────────────────────────────────────
let toolData = {};
try {
  const raw = readFileSync("/dev/stdin", { encoding: "utf8", flag: "r" });
  if (raw.trim()) toolData = JSON.parse(raw);
} catch { /* no stdin data — pass through */ }

const { tool_name, tool_input } = toolData;

// Opt-out
if (process.env.SWARM_DELEGATE === "0") process.exit(0);

// ═══════════════════════════════════════════════════════════════════════
// GUARDRAIL 1 — Agent tool without agent teams
// ═══════════════════════════════════════════════════════════════════════
if (tool_name === "Agent") {
  const hasTeam = tool_input?.team_name != null && tool_input.team_name !== "";
  const isOcWorker = (tool_input?.subagent_type ?? "").includes("opencode-worker");

  // If it's an opencode-worker without a team → enforce team membership
  if (isOcWorker && !hasTeam) {
    const reason = [
      "[swarm-code] opencode-worker DEBE pertenecer a un agent team.",
      "",
      "USA team_name:",
      "  TeamCreate(team_name='oc-team', description='...')",
      "  Agent(subagent_type='swarm-code:opencode-worker', name='worker-1', team_name='oc-team', ...)",
      "",
      "Los workers se comunican via SendMessage — no como parallel agents.",
    ].join("\n");

    if (process.env.SWARM_FORCE === "1") {
      console.log(JSON.stringify({ decision: "block", reason }));
    } else {
      process.stdout.write(`[swarm-code guardrail] ${reason}\n`);
    }
    process.exit(0);
  }

  // If spawning multiple agents without team → warn to use agent teams
  const promptLen = (tool_input?.prompt ?? "").length;
  if (!hasTeam && promptLen > 100) {
    const hint =
      "[swarm-code] Considera usar agent teams (experimental) en lugar de agentes sueltos. " +
      "TeamCreate → Agent(team_name=...) → SendMessage para comunicación entre agentes.";

    if (process.env.SWARM_FORCE === "1") {
      console.log(JSON.stringify({ decision: "block", reason: hint }));
    } else {
      process.stdout.write(`${hint}\n`);
    }
  }

  process.exit(0);
}

// ═══════════════════════════════════════════════════════════════════════
// GUARDRAIL 2 — Bash heavy analytical work → delegate to OpenCode
// ═══════════════════════════════════════════════════════════════════════
if (tool_name !== "Bash") process.exit(0);

const cmd = tool_input?.command ?? "";
const desc = tool_input?.description ?? "";

// Check if swarm-code is configured
const configPath = path.join(process.cwd(), ".opencode", "config.json");
const globalConfigPath = path.join(process.env.HOME ?? "", ".opencode", "config.json");
const hasConfig = existsSync(configPath) || existsSync(globalConfigPath);
if (!hasConfig) process.exit(0);

const HEAVY_PATTERNS = [
  /\b(find|grep|rg)\b.*-r.{5,}/,
  /\bwc\b.*-l\b/,
  /\|.*\|.*\|/,
  /\b(analiz[ae]|audit|benchmark|profile|investigat)\b/i,
  /for .+ in \$\(.*\).*do/,
];

const isHeavy = HEAVY_PATTERNS.some((p) => p.test(cmd) || p.test(desc));
if (!isHeavy) process.exit(0);

const bashReason =
  `[swarm-code] Heavy analysis detected — delegate to OpenCode to save Claude tokens:\n\n` +
  `  bash "\${CLAUDE_PLUGIN_ROOT}/scripts/opencode-bridge.sh" "<task description>"\n\n` +
  `El bridge abre tmux split-pane y entrega resultado via notify file.`;

if (process.env.SWARM_FORCE === "1") {
  console.log(JSON.stringify({ decision: "block", reason: bashReason }));
} else {
  process.stdout.write(`${bashReason}\n`);
}

process.exit(0);
