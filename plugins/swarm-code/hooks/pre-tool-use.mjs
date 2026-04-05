#!/usr/bin/env node
/**
 * pre-tool-use.mjs — PreToolUse guardrail hook (v2.2.0)
 *
 * BLOQUEA por defecto (no hint). Opt-out con SWARM_DELEGATE=0.
 *
 * Guardrails:
 *  1. Agent sin team_name                → BLOCK siempre
 *  2. opencode-worker sin team_name      → BLOCK siempre + código exacto corregido
 *  3. Bash análisis pesado               → BLOCK por defecto + bridge command exacto
 *
 * Opt-out:
 *  SWARM_DELEGATE=0  → pasa todo sin interceptar
 *
 * Made by Alejandro Apodaca Cordova (apoapps.com)
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(__dirname, "..");
const BRIDGE = `bash "\${CLAUDE_PLUGIN_ROOT}/scripts/opencode-bridge.sh"`;

// ─── Read hook input ──────────────────────────────────────────────────
let toolData = {};
try {
  const raw = readFileSync("/dev/stdin", { encoding: "utf8", flag: "r" });
  if (raw.trim()) toolData = JSON.parse(raw);
} catch { /* no stdin — pass through */ }

const { tool_name, tool_input } = toolData;

// Opt-out global
if (process.env.SWARM_DELEGATE === "0") process.exit(0);

// ═══════════════════════════════════════════════════════════════════════
// GUARDRAIL 1 — Agent tool
// ═══════════════════════════════════════════════════════════════════════
if (tool_name === "Agent") {
  const subtype = tool_input?.subagent_type ?? "";
  const hasTeam  = !!tool_input?.team_name;
  const isWorker = subtype.includes("opencode-worker");

  // opencode-worker sin team → SIEMPRE bloqueado con corrección exacta
  if (isWorker && !hasTeam) {
    const teamName = tool_input?.name?.replace(/worker[-_]?/, "").replace(/\d+$/, "").trim() || "oc-team";
    const workerName = tool_input?.name ?? "worker-1";
    const reason = [
      `[swarm-code] BLOQUEADO: opencode-worker DEBE estar en un agent team.`,
      ``,
      `Corrige así:`,
      ``,
      `  TeamCreate(team_name="${teamName}", description="...")`,
      `  Agent(`,
      `    subagent_type="swarm-code:opencode-worker",`,
      `    name="${workerName}",`,
      `    team_name="${teamName}",   ← OBLIGATORIO`,
      `    prompt="<tarea> — reporta via SendMessage al team-lead"`,
      `  )`,
      ``,
      `El hook bloqueará cualquier opencode-worker sin team_name.`,
    ].join("\n");

    console.log(JSON.stringify({ decision: "block", reason }));
    process.exit(0);
  }

  // Agent genérico sin team con prompt largo → bloquear + sugerir teams
  if (!hasTeam && !isWorker) {
    const promptLen = (tool_input?.prompt ?? "").length;
    if (promptLen > 200) {
      const agentDesc = tool_input?.description ?? "análisis";
      const reason = [
        `[swarm-code] BLOQUEADO: para tareas analíticas usa agent teams.`,
        ``,
        `En lugar de Agent sin team, usa:`,
        `  TeamCreate(team_name="oc-team", description="${agentDesc}")`,
        `  Agent(subagent_type="swarm-code:opencode-worker", team_name="oc-team", ...)`,
        ``,
        `O si es una tarea simple, usa el bridge directamente:`,
        `  ${BRIDGE} "<prompt>"`,
      ].join("\n");

      console.log(JSON.stringify({ decision: "block", reason }));
      process.exit(0);
    }
  }

  process.exit(0);
}

// ═══════════════════════════════════════════════════════════════════════
// GUARDRAIL 2 — Bash análisis pesado → redirect al bridge
// ═══════════════════════════════════════════════════════════════════════
if (tool_name !== "Bash") process.exit(0);

const cmd  = tool_input?.command ?? "";
const desc = tool_input?.description ?? "";

// Solo intercept si opencode está configurado
const configPath       = path.join(process.cwd(), ".opencode", "config.json");
const globalConfigPath = path.join(process.env.HOME ?? "", ".opencode", "config.json");
if (!existsSync(configPath) && !existsSync(globalConfigPath)) process.exit(0);

const HEAVY_PATTERNS = [
  /\b(find|grep|rg)\b.*-r.{5,}/,          // búsqueda recursiva
  /\bwc\b.*-l\b/,                           // conteo de líneas
  /\|.*\|.*\|/,                             // pipelines de 3+ comandos
  /\b(analiz[ae]|audit|benchmark|profile|investigat)\b/i,
  /for .+ in \$\(.*\).*do/,                 // loops de análisis
  /\b(awk|sed)\b.{20,}/,                    // awk/sed complejos
];

const isHeavy = HEAVY_PATTERNS.some((p) => p.test(cmd) || p.test(desc));
if (!isHeavy) process.exit(0);

// Extraer descripción breve del comando para el bridge
const taskHint = desc || cmd.slice(0, 80).replace(/\n/g, " ");

const reason = [
  `[swarm-code] BLOQUEADO: análisis pesado detectado — usa el bridge.`,
  ``,
  `En lugar de este Bash, corre:`,
  `  ${BRIDGE} "${taskHint}"`,
  ``,
  `El bridge:`,
  `  • Abre tmux split-pane automáticamente (pane ya existe desde SessionStart)`,
  `  • Entrega resultado via notify file al terminar`,
  `  • No gasta tokens de Claude en el análisis`,
].join("\n");

console.log(JSON.stringify({ decision: "block", reason }));
process.exit(0);
