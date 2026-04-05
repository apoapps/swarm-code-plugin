#!/usr/bin/env node
/**
 * opencode-send.mjs — send a message to the running opencode session
 *
 * Usage:
 *   node opencode-send.mjs ensure-server          → start server if needed, print JSON state
 *   node opencode-send.mjs send <prompt-file>     → send prompt from file, print response
 *   node opencode-send.mjs url                    → print server URL from state
 *   node opencode-send.mjs session                → print session ID from state
 *   node opencode-send.mjs status                 → print alive/dead
 */

import { readFileSync } from "node:fs";
import { ensureServer, sendMessage, readState, isServerAlive } from "./lib/session.mjs";

const [, , cmd, ...args] = process.argv;
const cwd = process.cwd();

switch (cmd) {
  case "ensure-server": {
    const state = await ensureServer(cwd);
    process.stdout.write(JSON.stringify(state) + "\n");
    break;
  }

  case "send": {
    const promptFile = args[0];
    if (!promptFile) { process.stderr.write("Usage: opencode-send.mjs send <prompt-file>\n"); process.exit(1); }
    const text = readFileSync(promptFile, "utf8");
    const state = readState();
    if (!state?.url || !state?.sessionID) {
      process.stderr.write("No active session. Run ensure-server first.\n");
      process.exit(1);
    }
    try {
      const response = await sendMessage(state.url, state.sessionID, text);
      process.stdout.write(response + "\n");
    } catch (err) {
      process.stderr.write("ERROR: " + err.message + "\n");
      process.exit(1);
    }
    break;
  }

  case "url": {
    const s = readState();
    process.stdout.write((s?.url ?? "") + "\n");
    break;
  }

  case "session": {
    const s = readState();
    process.stdout.write((s?.sessionID ?? "") + "\n");
    break;
  }

  case "status": {
    const s = readState();
    if (!s?.url) {
      console.log("┌─ swarm-code status ──────────────────────────");
      console.log("│  Server:  NOT RUNNING");
      console.log("│");
      console.log("│  Start:   node opencode-send.mjs ensure-server");
      console.log("└──────────────────────────────────────────────");
      break;
    }
    const alive = await isServerAlive(s.url);
    const uptime = s.startedAt ? Math.round((Date.now() - s.startedAt) / 1000) : null;
    const uptimeStr = uptime != null
      ? uptime < 60 ? `${uptime}s` : uptime < 3600 ? `${Math.floor(uptime / 60)}m ${uptime % 60}s` : `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
      : "unknown";
    console.log("┌─ swarm-code status ──────────────────────────");
    console.log(`│  Server:    ${alive ? "✓ RUNNING" : "✗ DEAD"}`);
    console.log(`│  URL:       ${s.url}`);
    console.log(`│  Session:   ${s.sessionID ?? "(none)"}`);
    console.log(`│  Uptime:    ${uptimeStr}`);
    console.log(`│  CWD:       ${s.cwd ?? "(unknown)"}`);
    if (!alive) {
      console.log("│");
      console.log("│  Server died. Restart: node opencode-send.mjs ensure-server");
    }
    console.log("└──────────────────────────────────────────────");
    break;
  }

  // ── Session/window management ──────────────────────────────────────────

  case "sessions": {
    // List all sessions on the running server
    const s = readState();
    if (!s?.url) { console.log("No server running."); break; }
    const res = await fetch(`${s.url}/session`);
    if (!res.ok) { console.log("Failed to list sessions:", res.status); break; }
    const sessions = await res.json();
    if (!sessions?.length) { console.log("No sessions."); break; }
    for (const sess of sessions) {
      const active = sess.id === s.sessionID ? " ← active" : "";
      console.log(`  ${sess.id}${active}  [${sess.title ?? "untitled"}]`);
    }
    break;
  }

  case "new-session": {
    // Create a new session and make it active
    const s = readState();
    if (!s?.url) { console.log("No server. Run ensure-server first."); break; }
    const res = await fetch(`${s.url}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cwd }),
    });
    if (!res.ok) { console.log("Failed:", res.status); break; }
    const sess = await res.json();
    const { saveState } = await import("./lib/session.mjs");
    saveState({ ...s, sessionID: sess.id });
    console.log("New session:", sess.id);
    break;
  }

  case "switch-session": {
    // Switch active session: opencode-send.mjs switch-session <sessionID>
    const sid = args[0];
    if (!sid) { console.log("Usage: switch-session <sessionID>"); break; }
    const s = readState();
    if (!s) { console.log("No server."); break; }
    const { saveState } = await import("./lib/session.mjs");
    saveState({ ...s, sessionID: sid });
    console.log("Switched to session:", sid);
    break;
  }

  case "delete-session": {
    const sid = args[0];
    if (!sid) { console.log("Usage: delete-session <sessionID>"); break; }
    const s = readState();
    if (!s?.url) { console.log("No server."); break; }
    const res = await fetch(`${s.url}/session/${sid}`, { method: "DELETE" });
    console.log(res.ok ? `Deleted session ${sid}` : `Failed: ${res.status}`);
    // If deleted active session, clear it
    if (res.ok && s.sessionID === sid) {
      const { saveState } = await import("./lib/session.mjs");
      saveState({ ...s, sessionID: undefined });
    }
    break;
  }

  case "stop-server": {
    const { clearState } = await import("./lib/session.mjs");
    clearState();
    console.log("State cleared. Server will stop on its own when no longer needed.");
    break;
  }

  case "attach": {
    // Print the attach command for the user to run / bridge to open
    const s = readState();
    if (!s?.url) { console.log("No server running."); break; }
    console.log(`opencode attach '${s.url}'`);
    break;
  }

  default:
    process.stderr.write(`Unknown command: ${cmd}\n\nCommands:\n  ensure-server\n  send <prompt-file>\n  url | session | status\n  sessions | new-session | switch-session <id> | delete-session <id>\n  stop-server | attach\n`);
    process.exit(1);
}
