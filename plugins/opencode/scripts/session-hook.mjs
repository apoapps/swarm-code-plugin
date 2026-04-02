#!/usr/bin/env node

/**
 * Session lifecycle hook for OpenCode plugin.
 * - SessionStart: publishes session ID + plugin data dir as env vars.
 * - SessionEnd: cleans up running jobs for this session.
 */

import fs from "node:fs";
import process from "node:process";

import { loadState, resolveStateFile, saveState, resolveWorkspaceRoot } from "./lib/state.mjs";

const SESSION_ID_ENV = "OPENCODE_SESSION_ID";
const PLUGIN_DATA_ENV = "CLAUDE_PLUGIN_DATA";

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

  // Kill running jobs
  for (const job of sessionJobs) {
    if (job.status === "running" || job.status === "queued") {
      if (job.pid) terminateProcess(job.pid);
    }
  }

  // Remove session jobs from state
  saveState(root, {
    ...state,
    jobs: state.jobs.filter((j) => j.sessionId !== sessionId),
  });
}

function handleSessionStart(input) {
  appendEnvVar(SESSION_ID_ENV, input.session_id);
  appendEnvVar(PLUGIN_DATA_ENV, process.env[PLUGIN_DATA_ENV]);
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
