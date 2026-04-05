#!/usr/bin/env node

/**
 * Session lifecycle hook for swarm-code plugin. (v2.1.1)
 *
 * SessionStart:
 *   - Publishes session ID + plugin data dir as env vars
 *   - Prints version banner + active constraints to stdout (Claude reads as context)
 *
 * SessionEnd:
 *   - Cleans up running jobs for this session
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { loadState, resolveStateFile, saveState, resolveWorkspaceRoot } from "./lib/state.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(__dirname, "..");

const SESSION_ID_ENV = "OPENCODE_SESSION_ID";
const PLUGIN_DATA_ENV = "CLAUDE_PLUGIN_DATA";

// ─── Version + constraints banner ─────────────────────────────────────
// Claude reads this as context at the start of every session.

function getVersion() {
  try {
    const pluginJson = path.join(PLUGIN_ROOT, ".claude-plugin", "plugin.json");
    const data = JSON.parse(fs.readFileSync(pluginJson, "utf8"));
    return data.version ?? "?";
  } catch {
    return "?";
  }
}

function printVersionBanner() {
  const version = getVersion();
  const inTmux = !!process.env.TMUX;
  const tmuxStatus = inTmux ? "✓ tmux activo" : "✗ tmux REQUERIDO";

  const banner = [
    "",
    `[swarm-code v${version}] agent-teams experimental | ${tmuxStatus}`,
    `REGLAS ACTIVAS:`,
    `  • opencode-worker SIEMPRE dentro de un agent team (TeamCreate + team_name)`,
    `  • Workers se comunican via SendMessage — no parallel agents sueltos`,
    `  • Bridge solo corre en tmux split-pane — nunca new-window`,
    `  • Al invocar swarm-code:opencode-orchestrate → LLAMA el bridge inmediatamente`,
    "",
  ].join("\n");

  process.stdout.write(banner);
}

// ─── Helpers ──────────────────────────────────────────────────────────

function readHookInput() {
  try {
    const raw = fs.readFileSync(0, "utf8").trim();
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function appendEnvVar(name, value) {
  if (!process.env.CLAUDE_ENV_FILE || value == null || value === "") return;
  fs.appendFileSync(
    process.env.CLAUDE_ENV_FILE,
    `export ${name}=${shellEscape(value)}\n`,
    "utf8"
  );
}

function terminateProcess(pid) {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Process may already be gone.
  }
}

function cleanupSessionJobs(cwd, sessionId) {
  if (!cwd || !sessionId) return;

  const root = resolveWorkspaceRoot(cwd);
  const stateFile = resolveStateFile(root);
  if (!fs.existsSync(stateFile)) return;

  const state = loadState(root);
  const sessionJobs = state.jobs.filter((j) => j.sessionId === sessionId);
  if (sessionJobs.length === 0) return;

  for (const job of sessionJobs) {
    if (job.status === "running" || job.status === "queued") {
      if (job.pid) terminateProcess(job.pid);
    }
  }

  saveState(root, {
    ...state,
    jobs: state.jobs.filter((j) => j.sessionId !== sessionId),
  });
}

// ─── Event handlers ───────────────────────────────────────────────────

function handleSessionStart(input) {
  appendEnvVar(SESSION_ID_ENV, input.session_id);
  appendEnvVar(PLUGIN_DATA_ENV, process.env[PLUGIN_DATA_ENV]);
  printVersionBanner();
}

function handleSessionEnd(input) {
  const cwd = input.cwd || process.cwd();
  const sessionId = input.session_id || process.env[SESSION_ID_ENV];
  cleanupSessionJobs(cwd, sessionId);
}

async function main() {
  const input = readHookInput();
  const event = process.argv[2] ?? input.hook_event_name ?? "";

  if (event === "SessionStart") {
    handleSessionStart(input);
  } else if (event === "SessionEnd") {
    handleSessionEnd(input);
  }
}

main().catch((err) => {
  process.stderr.write(`${err.message ?? err}\n`);
  process.exit(1);
});
