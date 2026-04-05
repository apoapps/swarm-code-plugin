#!/usr/bin/env node

/**
 * Session lifecycle hook for swarm-code plugin. (v2.2.0)
 *
 * SessionStart:
 *   - Auto-creates oc-team tmux split-pane (if in tmux)
 *   - Starts opencode server in background
 *   - Publishes session ID + env vars
 *   - Prints version banner + active rules to stdout (Claude reads as context)
 *
 * SessionEnd:
 *   - Cleans up running jobs for this session
 *
 * Made by Alejandro Apodaca Cordova (apoapps.com)
 */

import fs from "node:fs";
import path from "node:path";
import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { loadState, resolveStateFile, saveState, resolveWorkspaceRoot } from "./lib/state.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(__dirname, "..");

const SESSION_ID_ENV = "OPENCODE_SESSION_ID";
const PLUGIN_DATA_ENV = "CLAUDE_PLUGIN_DATA";

// ─── Version ──────────────────────────────────────────────────────────

function getVersion() {
  try {
    const p = path.join(PLUGIN_ROOT, ".claude-plugin", "plugin.json");
    return JSON.parse(fs.readFileSync(p, "utf8")).version ?? "?";
  } catch {
    return "?";
  }
}

// ─── Tmux auto-setup ──────────────────────────────────────────────────
// Crea el pane oc-team automáticamente al iniciar sesión si hay tmux.
// No depende de que Claude lo llame — se ejecuta siempre.

function findTmux() {
  try {
    return execSync("command -v tmux", { encoding: "utf8" }).trim();
  } catch {
    return "/opt/homebrew/bin/tmux";
  }
}

function setupTmuxPane() {
  // No-op on startup — pane only opens when user runs /swarm-code:init
  return false;
}

// ─── Version banner ───────────────────────────────────────────────────
// Claude lee esto como contexto de sistema al inicio de cada sesión.
// Contiene las reglas y constraints que DEBEN respetarse.

function printVersionBanner(_paneCreated) {
  const version = getVersion();

  const banner = [
    "",
    `[swarm-code v${version}] ready`,
    ``,
    `Delegate to OpenCode (saves 70-80% tokens):`,
    `  Agent(subagent_type="swarm-code:opencode-worker", model="haiku", prompt="<task>")`,
    ``,
    `Run /swarm-code:init once per project to configure model and project context.`,
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
  try { process.kill(pid, "SIGTERM"); } catch { /* already gone */ }
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
    if ((job.status === "running" || job.status === "queued") && job.pid) {
      terminateProcess(job.pid);
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

  // Auto-setup tmux pane — no depende de Claude
  const paneCreated = setupTmuxPane();

  // Imprimir banner con reglas para Claude
  printVersionBanner(paneCreated);
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
