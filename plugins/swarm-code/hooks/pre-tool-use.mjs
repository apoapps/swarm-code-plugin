#!/usr/bin/env node
/**
 * pre-tool-use.mjs — PreToolUse hook
 *
 * Intercepts Bash tool calls that look like heavy analytical work and
 * redirects Claude to use OpenCode via swarm-code instead.
 *
 * Behavior:
 *   - Default: outputs a suggestion (non-blocking) — Claude reads it and decides
 *   - SWARM_FORCE=1: blocks the tool call and forces OpenCode delegation
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

// ─── Only intercept Bash calls ────────────────────────────────────────
if (tool_name !== "Bash") process.exit(0);

const cmd = tool_input?.command ?? "";
const desc = tool_input?.description ?? "";

// Opt-out: SWARM_DELEGATE=0 disables this hook entirely
if (process.env.SWARM_DELEGATE === "0") process.exit(0);

// ─── Check if swarm-code is configured ───────────────────────────────
const configPath = path.join(process.cwd(), ".opencode", "config.json");
const globalConfigPath = path.join(process.env.HOME ?? "", ".opencode", "config.json");
const hasConfig =
  existsSync(configPath) || existsSync(globalConfigPath);

// Only intercept if swarm-code has been initialized
if (!hasConfig) process.exit(0);

// ─── Detect heavy analytical work ────────────────────────────────────
const HEAVY_PATTERNS = [
  // Full-codebase analysis
  /\b(find|grep|rg)\b.*-r.{5,}/,
  // Counting / stats across files
  /\bwc\b.*-l\b/,
  // Long pipelines (3+ pipes usually = analysis)
  /\|.*\|.*\|/,
  // Explicit analysis keywords in description
  /\b(analiz[ae]|audit|benchmark|profile|investigat)\b/i,
  // Big loops
  /for .+ in \$\(.*\).*do/,
];

const isHeavy = HEAVY_PATTERNS.some((p) => p.test(cmd) || p.test(desc));

if (!isHeavy) process.exit(0);

// ─── Force mode: block the call ───────────────────────────────────────
if (process.env.SWARM_FORCE === "1") {
  console.log(
    JSON.stringify({
      decision: "block",
      reason: `[swarm-code] Heavy analysis detected — delegate to OpenCode to save Claude tokens:\n\n  node "${RUNNER}" execute "<task description>"\n\nOr use the execute skill directly.`,
    })
  );
  process.exit(0);
}

// ─── Suggestion mode: hint to Claude (non-blocking) ──────────────────
// Claude reads this output as context before deciding to proceed
process.stdout.write(
  `[swarm-code hint] This Bash command looks like analytical work. ` +
    `Consider delegating to OpenCode to save Claude tokens: ` +
    `\`node "${RUNNER}" execute "<task>"\`\n`
);
process.exit(0);
