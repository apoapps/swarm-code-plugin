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
  if (!process.env.TMUX) return false; // no tmux → skip silently

  const tmux = findTmux();

  try {
    // ¿Ya existe un pane con título oc-team en la ventana actual?
    const currentWindow = execSync(`${tmux} display-message -p '#{window_id}'`, {
      encoding: "utf8",
    }).trim();

    const panes = execSync(`${tmux} list-panes -t ${currentWindow} -F '#{pane_title}'`, {
      encoding: "utf8",
    });

    if (panes.split("\n").some((t) => t.trim() === "oc-team")) {
      return true; // ya existe, nada que hacer
    }

    // Iniciar opencode server en background antes de abrir el pane
    const senderScript = path.join(PLUGIN_ROOT, "scripts", "opencode-send.mjs");
    if (fs.existsSync(senderScript)) {
      spawn("node", [senderScript, "ensure-server"], {
        detached: true,
        stdio: "ignore",
      }).unref();
    }

    // Crear split-pane horizontal (lado derecho) — opencode TUI o fallback
    const paneCmd = [
      "echo '⚡ swarm-code | oc-team ready' &&",
      "(opencode 2>/dev/null || echo 'opencode no disponible — corre: swarm-code:init')",
      "&& read -p 'Press Enter to close'",
    ].join(" ");

    execSync(
      `${tmux} split-window -h -t ${currentWindow} ${JSON.stringify(paneCmd)}`,
      { encoding: "utf8" }
    );
    execSync(`${tmux} select-pane -T "oc-team"`, { encoding: "utf8" });
    execSync(`${tmux} select-pane -l`, { encoding: "utf8" }); // regresa al pane original

    return true;
  } catch (err) {
    // No fallar si tmux no coopera — solo silencioso
    process.stderr.write(`[swarm-code] tmux setup skipped: ${err.message}\n`);
    return false;
  }
}

// ─── Version banner ───────────────────────────────────────────────────
// Claude lee esto como contexto de sistema al inicio de cada sesión.
// Contiene las reglas y constraints que DEBEN respetarse.

function printVersionBanner(paneCreated) {
  const version = getVersion();
  const inTmux = !!process.env.TMUX;
  const tmuxStatus = inTmux
    ? paneCreated
      ? "✓ tmux activo · oc-team pane listo"
      : "✓ tmux activo · oc-team pane ya existía"
    : "✗ tmux REQUERIDO — bridge fallará";

  const banner = [
    "",
    `[swarm-code v${version}] ${tmuxStatus}`,
    ``,
    `REGLAS OBLIGATORIAS (enforced por hooks — no opcionales):`,
    `  1. opencode-worker SIEMPRE en agent team: TeamCreate → Agent(team_name=...)`,
    `  2. Workers comunican via SendMessage — nunca parallel agents sueltos`,
    `  3. Bridge en tmux split-pane — nunca new-window (auto-creado al iniciar)`,
    `  4. Skill opencode-orchestrate → PRIMERA acción es llamar el bridge`,
    `  5. Análisis pesado en Bash → BLOQUEADO → usa el bridge`,
    ``,
    `BRIDGE: bash "\${CLAUDE_PLUGIN_ROOT}/scripts/opencode-bridge.sh" "<prompt>"`,
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
