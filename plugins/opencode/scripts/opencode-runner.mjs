#!/usr/bin/env node

/**
 * OpenCode Companion — main entry point for all /opencode:* commands.
 * Generic model support with auto-detection, fallback priority, and interactive setup.
 *
 * Made by Alejandro Apodaca Cordova (apoapps.com)
 *
 * Usage:
 *   node opencode-runner.mjs setup  [--json]
 *   node opencode-runner.mjs ask    [--model <model>] "<prompt>"
 *   node opencode-runner.mjs review [--base <ref>] [--scope auto|working-tree|branch] [--model <model>]
 *   node opencode-runner.mjs plan   [--model <model>] "<prompt>"
 *   node opencode-runner.mjs orchestrate "<complex task>"
 *   node opencode-runner.mjs status [job-id] [--all] [--json]
 *   node opencode-runner.mjs result [job-id] [--json]
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  checkOpenCodeAvailable,
  detectAvailableModels,
  executeWithRetry,
  groupModelsByProvider,
  resolveModel,
} from "./lib/opencode.mjs";
import { orchestrate } from "./lib/orchestrator.mjs";
import {
  ensureStateDir,
  generateJobId,
  getConfig,
  loadState,
  resolveWorkspaceRoot,
  setConfig,
  upsertJob,
  writeJobFile,
} from "./lib/state.mjs";
import {
  buildResultReport,
  buildStatusReport,
  SESSION_ID_ENV,
} from "./lib/job-control.mjs";

const ROOT_DIR = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const CWD = process.cwd();

// ─── Argument parsing ────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0] ?? "";
  const flags = {};
  const positional = [];

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, flags, positional, raw: args.slice(1).join(" ") };
}

// ─── Model resolution ────────────────────────────────────────────────

async function resolveActiveModel(flags) {
  const config = getConfig(CWD);

  // User explicitly requested a model
  if (flags.model) {
    return { models: [flags.model], source: "user-override" };
  }

  // Use configured priority list
  const priority = config.modelPriority ?? [];
  if (priority.length > 0) {
    return { models: priority, source: "config" };
  }

  // Fallback
  return { models: ["minimax/MiniMax-M2.7"], source: "default" };
}

/**
 * Standard result header — ALWAYS included so Claude and user know what model ran.
 */
function formatResultHeader(kind, result) {
  const fallbackNote = result.fallbackUsed ? ` (fallback — primary unavailable)` : "";
  return [
    `---`,
    `**opencode** | ${kind} | model: \`${result.model}\`${fallbackNote} | attempts: ${result.attempts}/3 | ${result.success ? "OK" : "FAILED"}`,
    `---`,
    "",
  ].join("\n");
}

// ─── Prompt templates ────────────────────────────────────────────────

function loadPrompt(name) {
  const file = path.join(ROOT_DIR, "prompts", `${name}.md`);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8");
}

function interpolate(template, vars) {
  let out = template;
  for (const [key, val] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, val ?? "");
  }
  return out;
}

// ─── Git helpers ─────────────────────────────────────────────────────

function gitDiff(base, scope) {
  try {
    if (base) {
      return execSync(`git diff ${base}...HEAD`, { encoding: "utf8", maxBuffer: 1024 * 1024 }).trim();
    }
    if (scope === "working-tree" || !scope || scope === "auto") {
      const staged = execSync("git diff --cached", { encoding: "utf8", maxBuffer: 1024 * 1024 }).trim();
      const unstaged = execSync("git diff", { encoding: "utf8", maxBuffer: 1024 * 1024 }).trim();
      return [staged, unstaged].filter(Boolean).join("\n\n");
    }
    return execSync("git diff HEAD", { encoding: "utf8", maxBuffer: 1024 * 1024 }).trim();
  } catch {
    return "";
  }
}

function gitStatus() {
  try {
    return execSync("git status --short", { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

// ─── Output helpers ──────────────────────────────────────────────────

function output(value, asJson = false) {
  if (asJson) {
    console.log(JSON.stringify(value, null, 2));
  } else if (typeof value === "string") {
    process.stdout.write(value);
  } else {
    console.log(JSON.stringify(value, null, 2));
  }
}

// ─── CLI formatting ──────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  white: "\x1b[37m",
  bgGreen: "\x1b[42m",
  bgRed: "\x1b[41m",
  bgBlue: "\x1b[44m",
};

function ok(text)   { return `${C.green}✓${C.reset} ${text}`; }
function fail(text)  { return `${C.red}✗${C.reset} ${text}`; }
function warn(text)  { return `${C.yellow}!${C.reset} ${text}`; }
function info(text)  { return `${C.blue}→${C.reset} ${text}`; }
function dim(text)   { return `${C.dim}${text}${C.reset}`; }
function bold(text)  { return `${C.bold}${text}${C.reset}`; }
function tag(label, color) { return `${color}${C.bold} ${label} ${C.reset}`; }

function box(lines, title = "") {
  const maxLen = Math.max(...lines.map((l) => stripAnsi(l).length), stripAnsi(title).length + 4);
  const pad = (s) => s + " ".repeat(Math.max(0, maxLen - stripAnsi(s).length));
  const border = "─".repeat(maxLen + 2);
  const out = [];
  out.push(`┌${title ? `─ ${C.bold}${title}${C.reset} ` + "─".repeat(Math.max(0, maxLen - stripAnsi(title).length - 2)) : border}┐`);
  for (const line of lines) {
    out.push(`│ ${pad(line)} │`);
  }
  out.push(`└${border}┘`);
  return out.join("\n");
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

// ─── Commands ────────────────────────────────────────────────────────

async function handleSetup(flags) {
  const availability = await checkOpenCodeAvailable();
  const config = getConfig(CWD);

  // ── Handle mutations first ──
  if (flags["set-primary"]) {
    return handleSetPrimary(flags["set-primary"], config);
  }
  if (flags["add-fallback"]) {
    return handleAddFallback(flags["add-fallback"], config);
  }
  if (flags["remove-fallback"]) {
    return handleRemoveFallback(flags["remove-fallback"], config);
  }
  if (flags.reset) {
    setConfig(CWD, { modelPriority: [], availableModels: [], availableModelsCheckedAt: null });
    output(ok("Configuration reset. Run /opencode:setup to reconfigure.\n"));
    return;
  }
  if (flags.test) {
    return handleTest(config);
  }

  // ── Not installed ──
  if (!availability.available) {
    if (flags.json) {
      output({ opencode: "NOT FOUND", models: [], config }, true);
      return;
    }
    console.log("");
    console.log(box([
      fail(`OpenCode CLI ${bold("not found")}`),
      "",
      info("Install: https://opencode.ai/docs/install"),
      "",
      dim("After installing, run /opencode:setup again."),
    ], "OpenCode Setup"));
    console.log("");
    return;
  }

  // ── Detect models ──
  process.stderr.write(`${C.dim}Scanning models...${C.reset}\n`);
  const available = await detectAvailableModels();

  setConfig(CWD, {
    availableModels: available,
    availableModelsCheckedAt: new Date().toISOString(),
  });

  const resolved = resolveModel(config.modelPriority ?? [], available);
  const grouped = groupModelsByProvider(available);
  const priority = config.modelPriority ?? [];

  // ── JSON mode ──
  if (flags.json) {
    output({
      opencode: `installed (${availability.version})`,
      activeModel: resolved.model ?? null,
      fallbackUsed: resolved.fallbackUsed,
      unavailable: resolved.unavailable,
      modelPriority: priority,
      detectedModels: available,
      modelsByProvider: grouped,
      totalModels: available.length,
      totalProviders: Object.keys(grouped).length,
      reviewOnStop: config.reviewOnStop ?? false,
    }, true);
    return;
  }

  // ── Beautiful CLI output ──
  console.log("");

  // Header
  console.log(box([
    `${C.cyan}${C.bold}OpenCode Plugin for Claude Code${C.reset}`,
    dim("Delegate tasks to save tokens"),
    "",
    `  CLI     ${availability.available ? ok(`v${availability.version}`) : fail("not found")}`,
    `  Models  ${ok(`${bold(String(available.length))} detected across ${bold(String(Object.keys(grouped).length))} providers`)}`,
  ], "opencode"));

  console.log("");

  // Active configuration
  const activeStatus = resolved.model
    ? ok(`${bold(resolved.model)}${resolved.fallbackUsed ? `  ${C.yellow}(fallback — ${resolved.original} unavailable)${C.reset}` : ""}`)
    : warn("No model configured");

  console.log(box([
    `${C.bold}Active Model${C.reset}   ${activeStatus}`,
    "",
    `${C.bold}Priority List${C.reset}  ${priority.length > 0 ? "" : dim("(empty — needs configuration)")}`,
    ...priority.map((m, i) => {
      const avail = available.some((a) => a.toLowerCase() === m.toLowerCase());
      const label = i === 0 ? tag("PRIMARY", C.bgGreen) : dim(`fallback ${i}`);
      const status = avail ? `${C.green}●${C.reset}` : `${C.red}●${C.reset} unavailable`;
      return `    ${label}  ${m}  ${status}`;
    }),
    ...(priority.length === 0 ? [
      `    ${dim("Tell Claude which model you want, or pick from the list below.")}`,
    ] : []),
  ], "Configuration"));

  console.log("");

  // Models by provider
  const providerIcons = {
    "opencode": "◆",
    "github-copilot": "◇",
    "minimax": "▲",
    "minimax-cn-coding-plan": "▲",
    "minimax-coding-plan": "▲",
    "openai": "○",
  };

  const providerLines = [];
  for (const [provider, models] of Object.entries(grouped)) {
    const icon = providerIcons[provider] ?? "●";
    providerLines.push("");
    providerLines.push(`  ${C.bold}${icon} ${provider}${C.reset} ${dim(`(${models.length})`)}`);

    for (const m of models) {
      const isPrimary = priority[0] === m;
      const isFallback = priority.includes(m) && !isPrimary;
      let badge = "";
      if (isPrimary) badge = ` ${tag("PRIMARY", C.bgGreen)}`;
      else if (isFallback) badge = ` ${C.dim}[fallback]${C.reset}`;

      const shortName = m.split("/").pop();
      const isFree = shortName.includes("free");
      const isHighspeed = shortName.includes("highspeed");
      let traits = [];
      if (isFree) traits.push(`${C.green}free${C.reset}`);
      if (isHighspeed) traits.push(`${C.cyan}fast${C.reset}`);
      const traitStr = traits.length > 0 ? ` ${dim("·")} ${traits.join(" ")}` : "";

      providerLines.push(`    ${dim("·")} ${m}${traitStr}${badge}`);
    }
  }

  console.log(box(providerLines, `Models (${available.length})`));

  console.log("");

  // Quick actions
  console.log(box([
    `${C.bold}Quick Actions${C.reset}`,
    "",
    `  ${C.cyan}/opencode:setup --set-primary <model>${C.reset}`,
    `    ${dim("Set your primary model")}`,
    "",
    `  ${C.cyan}/opencode:setup --add-fallback <model>${C.reset}`,
    `    ${dim("Add a fallback model")}`,
    "",
    `  ${C.cyan}/opencode:setup --remove-fallback <model>${C.reset}`,
    `    ${dim("Remove a fallback model")}`,
    "",
    `  ${C.cyan}/opencode:setup --test${C.reset}`,
    `    ${dim("Test current configuration")}`,
    "",
    `  ${C.cyan}/opencode:setup --reset${C.reset}`,
    `    ${dim("Reset all configuration")}`,
    "",
    dim("Or just tell Claude: \"use gpt-5.4 as my primary model\""),
  ], "Actions"));

  console.log("");
  console.log(dim("  Made by Alejandro Apodaca Cordova · apoapps.com"));
  console.log("");
}

async function handleSetPrimary(model, config) {
  const available = config.availableModels ?? await detectAvailableModels();
  const match = available.find((m) => m.toLowerCase() === model.toLowerCase());

  if (!match) {
    const suggestions = available
      .filter((m) => m.toLowerCase().includes(model.toLowerCase().split("/").pop()))
      .slice(0, 5);

    console.log("");
    console.log(fail(`Model "${model}" not found.`));
    if (suggestions.length > 0) {
      console.log(info("Did you mean:"));
      for (const s of suggestions) console.log(`    · ${s}`);
    }
    console.log("");
    process.exit(1);
  }

  const priority = config.modelPriority ?? [];
  const newPriority = [match, ...priority.filter((m) => m !== match)];
  setConfig(CWD, { modelPriority: newPriority });

  console.log("");
  console.log(ok(`Primary model set to ${bold(match)}`));
  if (newPriority.length > 1) {
    console.log(info(`Fallback order: ${newPriority.slice(1).join(" → ")}`));
  }
  console.log("");
}

async function handleAddFallback(model, config) {
  const available = config.availableModels ?? await detectAvailableModels();
  const match = available.find((m) => m.toLowerCase() === model.toLowerCase());

  if (!match) {
    console.log("");
    console.log(fail(`Model "${model}" not found. Run /opencode:setup to see available models.`));
    console.log("");
    process.exit(1);
  }

  const priority = config.modelPriority ?? [];
  if (priority.includes(match)) {
    console.log(warn(`${match} is already in the priority list.`));
    return;
  }

  priority.push(match);
  setConfig(CWD, { modelPriority: priority });

  console.log("");
  console.log(ok(`Added ${bold(match)} as fallback #${priority.length - 1}`));
  console.log(info(`Priority: ${priority.join(" → ")}`));
  console.log("");
}

async function handleRemoveFallback(model, config) {
  const priority = config.modelPriority ?? [];
  const match = priority.find((m) => m.toLowerCase() === model.toLowerCase());

  if (!match) {
    console.log(fail(`${model} is not in the priority list.`));
    return;
  }

  if (priority[0] === match) {
    console.log(warn(`Can't remove the primary model. Use --set-primary to change it first.`));
    return;
  }

  const newPriority = priority.filter((m) => m !== match);
  setConfig(CWD, { modelPriority: newPriority });

  console.log("");
  console.log(ok(`Removed ${bold(match)} from fallbacks`));
  console.log(info(`Priority: ${newPriority.join(" → ")}`));
  console.log("");
}

async function handleTest(config) {
  const priority = config.modelPriority ?? [];
  if (priority.length === 0) {
    console.log(fail("No models configured. Run /opencode:setup first."));
    return;
  }

  console.log("");
  console.log(bold("Testing model priority chain...\n"));

  for (let i = 0; i < priority.length; i++) {
    const model = priority[i];
    const label = i === 0 ? "PRIMARY" : `FALLBACK ${i}`;
    process.stdout.write(`  ${dim(label)}  ${model}  `);

    const result = await executeWithRetry("Reply with OK", {
      fallbackModels: [model],
      timeout: 30_000,
      cwd: CWD,
      onAttempt: () => {},
      onFallback: () => {},
    });

    if (result.success) {
      console.log(ok("responding"));
    } else {
      console.log(fail("not responding"));
    }
  }

  console.log("");
}

async function handleAsk(flags, positional) {
  const prompt = positional.join(" ") || flags.prompt;
  if (!prompt) {
    output("Error: No prompt provided. Usage: /opencode:ask <your question>\n");
    process.exit(1);
  }

  const { models, source } = await resolveActiveModel(flags);
  const template = loadPrompt("ask");
  const finalPrompt = template
    ? interpolate(template, { prompt, cwd: CWD })
    : prompt;

  const jobId = generateJobId();
  upsertJob(CWD, {
    id: jobId,
    kind: "ask",
    status: "running",
    model: models[0],
    sessionId: process.env[SESSION_ID_ENV],
    prompt: prompt.slice(0, 200),
  });

  const result = await executeWithRetry(finalPrompt, {
    fallbackModels: models,
    cwd: CWD,
    onAttempt: (n, max, model) => {
      process.stderr.write(`[Attempt ${n}/${max}] OpenCode (${model})...\n`);
    },
    onFallback: (model, original) => {
      process.stderr.write(`[Fallback] ${original} failed, trying ${model}...\n`);
    },
  });

  upsertJob(CWD, {
    id: jobId,
    status: result.success ? "done" : "failed",
    model: result.model,
    fallbackUsed: result.fallbackUsed,
    completedAt: new Date().toISOString(),
  });

  if (result.output) writeJobFile(CWD, jobId, "output.txt", result.output);

  const header = formatResultHeader("ask", result);
  if (result.success) {
    output(header + result.output);
  } else {
    output(header + `**Models tried**: ${models.join(", ")}\n**Error**: ${result.error ?? "timeout"}\n\n${result.output}\n`);
    process.exit(1);
  }
}

async function handleReview(flags) {
  const base = flags.base ?? null;
  const scope = flags.scope ?? "auto";
  const { models } = await resolveActiveModel(flags);

  const diff = gitDiff(base, scope);
  const status = gitStatus();

  if (!diff && !status) {
    output("Nothing to review — working tree is clean.\n");
    return;
  }

  const template = loadPrompt("review");
  const context = [
    status ? `## Git Status\n\`\`\`\n${status}\n\`\`\`` : "",
    diff ? `## Diff\n\`\`\`diff\n${diff.slice(0, 50000)}\n\`\`\`` : "",
  ].filter(Boolean).join("\n\n");

  const finalPrompt = template
    ? interpolate(template, { context, cwd: CWD, base: base ?? "HEAD" })
    : `Review this code change and report issues by severity:\n\n${context}`;

  const jobId = generateJobId();
  upsertJob(CWD, {
    id: jobId,
    kind: "review",
    status: "running",
    model: models[0],
    sessionId: process.env[SESSION_ID_ENV],
  });

  const result = await executeWithRetry(finalPrompt, {
    fallbackModels: models,
    timeout: 120_000,
    cwd: CWD,
    onAttempt: (n, max, model) => process.stderr.write(`[Attempt ${n}/${max}] OpenCode review (${model})...\n`),
    onFallback: (model, original) => process.stderr.write(`[Fallback] ${original} failed, trying ${model}...\n`),
  });

  upsertJob(CWD, {
    id: jobId,
    status: result.success ? "done" : "failed",
    model: result.model,
    fallbackUsed: result.fallbackUsed,
    completedAt: new Date().toISOString(),
  });

  if (result.output) writeJobFile(CWD, jobId, "output.txt", result.output);
  const header = formatResultHeader("review", result);
  output(header + (result.output || "No output from review.\n"));
}

async function handlePlan(flags, positional) {
  const prompt = positional.join(" ") || flags.prompt;
  if (!prompt) {
    output("Error: No prompt provided. Usage: /opencode:plan <what to plan>\n");
    process.exit(1);
  }

  const { models } = await resolveActiveModel(flags);
  const template = loadPrompt("plan");
  const finalPrompt = template
    ? interpolate(template, { prompt, cwd: CWD })
    : `Create a detailed implementation plan for:\n\n${prompt}`;

  const jobId = generateJobId();
  upsertJob(CWD, {
    id: jobId,
    kind: "plan",
    status: "running",
    model: models[0],
    sessionId: process.env[SESSION_ID_ENV],
    prompt: prompt.slice(0, 200),
  });

  const result = await executeWithRetry(finalPrompt, {
    fallbackModels: models,
    timeout: 120_000,
    cwd: CWD,
    onAttempt: (n, max, model) => process.stderr.write(`[Attempt ${n}/${max}] OpenCode plan (${model})...\n`),
    onFallback: (model, original) => process.stderr.write(`[Fallback] ${original} failed, trying ${model}...\n`),
  });

  upsertJob(CWD, {
    id: jobId,
    status: result.success ? "done" : "failed",
    model: result.model,
    fallbackUsed: result.fallbackUsed,
    completedAt: new Date().toISOString(),
  });

  if (result.output) writeJobFile(CWD, jobId, "output.txt", result.output);
  const header = formatResultHeader("plan", result);
  output(header + (result.output || "No output from planning.\n"));
}

function handleStatus(flags, positional) {
  const report = buildStatusReport(CWD, {
    all: flags.all === true,
    sessionId: process.env[SESSION_ID_ENV],
  });
  output(flags.json ? report : report.text + "\n", !!flags.json);
}

function handleResult(flags, positional) {
  const jobId = positional[0] ?? null;
  const report = buildResultReport(CWD, jobId);
  output(flags.json ? report : report.text + "\n", !!flags.json);
}

/**
 * Lightweight model listing — Claude calls this to see available models
 * without the overhead of full setup. Outputs compact JSON for token efficiency.
 */
async function handleModels(flags) {
  const config = getConfig(CWD);

  // Use cached models if recent (< 5 min)
  const cacheAge = config.availableModelsCheckedAt
    ? Date.now() - Date.parse(config.availableModelsCheckedAt)
    : Infinity;
  const useCache = cacheAge < 5 * 60 * 1000 && config.availableModels?.length > 0;

  const available = useCache
    ? config.availableModels
    : await detectAvailableModels();

  if (!useCache && available.length > 0) {
    setConfig(CWD, {
      availableModels: available,
      availableModelsCheckedAt: new Date().toISOString(),
    });
  }

  const grouped = groupModelsByProvider(available);
  const priority = config.modelPriority ?? [];
  const resolved = resolveModel(priority, available);

  const compact = {
    active: resolved.model,
    fallbackUsed: resolved.fallbackUsed,
    priority,
    providers: Object.fromEntries(
      Object.entries(grouped).map(([p, models]) => [p, models.length])
    ),
    all: available,
    cached: useCache,
  };

  output(compact, true);
}

// ─── Orchestrate (multi-agent) ────────────────────────────────────────

async function handleOrchestrate(flags, positional) {
  const task = positional.join(" ") || flags.prompt;
  if (!task) {
    output("Error: No task provided. Usage: /opencode:orchestrate <complex task>\n");
    process.exit(1);
  }

  const config = getConfig(CWD);
  const jobId = generateJobId();

  upsertJob(CWD, {
    id: jobId,
    kind: "orchestrate",
    status: "running",
    model: "multi-agent",
    sessionId: process.env[SESSION_ID_ENV],
    prompt: task.slice(0, 200),
  });

  const result = await orchestrate(task, CWD, {
    config,
    onProgress: (msg) => process.stderr.write(msg + "\n"),
  });

  upsertJob(CWD, {
    id: jobId,
    status: result.failed === result.agents.length ? "failed" : "done",
    model: "multi-agent",
    completedAt: new Date().toISOString(),
    agents: result.agents.map((a) => ({
      name: a.name,
      trait: a.trait,
      focus: a.focus,
      model: a.model,
      status: a.status,
      complexity: a.complexity,
    })),
  });

  if (result.output) writeJobFile(CWD, jobId, "output.txt", result.output);
  output(result.output);
}

// ─── Execute (smart auto-router) ──────────────────────────────────────

/**
 * Classify task complexity with fast heuristics (no API call).
 * Returns { mode, reason, agentCount, modelTier }
 */
function classifyTask(task) {
  const lower = task.toLowerCase();
  const wordCount = task.split(/\s+/).length;

  // Keywords that signal multi-agent work
  const multiSignals = [
    "security and performance", "security, performance",
    "architecture and", "review and plan",
    "analyze everything", "full audit", "full review",
    "compare", "pros and cons", "tradeoffs",
    "multiple perspectives", "cross-check",
    "end to end", "end-to-end", "comprehensive",
  ];
  const heavySignals = [
    "security audit", "vulnerability", "penetration",
    "architecture review", "system design", "migration plan",
    "refactor strategy", "debug.*complex", "root cause",
  ];
  const lightSignals = [
    "what does", "what is", "how does", "explain",
    "simple", "quick", "short", "one line",
    "fix this", "typo", "rename",
  ];

  const hasMulti = multiSignals.some((s) => lower.includes(s));
  const hasHeavy = heavySignals.some((s) => new RegExp(s).test(lower));
  const hasLight = lightSignals.some((s) => lower.includes(s));

  if (hasMulti || (wordCount > 40 && hasHeavy)) {
    return {
      mode: "orchestrate",
      reason: "Multi-faceted task — multiple agents recommended",
      agentCount: "2-4",
      modelTier: "mixed",
    };
  }

  if (hasHeavy || wordCount > 30) {
    return {
      mode: "single-heavy",
      reason: "Complex task — single agent with powerful model",
      agentCount: "1",
      modelTier: "heavy",
    };
  }

  if (hasLight || wordCount < 15) {
    return {
      mode: "single-fast",
      reason: "Simple task — single fast agent",
      agentCount: "1",
      modelTier: "light",
    };
  }

  return {
    mode: "single-default",
    reason: "Standard task — single agent with default model",
    agentCount: "1",
    modelTier: "medium",
  };
}

async function handleExecute(flags, positional) {
  const task = positional.join(" ") || flags.prompt;
  if (!task) {
    output("Error: No task provided. Usage: /opencode:execute <what you need>\n");
    process.exit(1);
  }

  const config = getConfig(CWD);
  const classification = classifyTask(task);

  // ── Show recommendation ──
  const modeLabels = {
    "orchestrate": `${C.magenta}${C.bold} MULTI-AGENT ${C.reset}`,
    "single-heavy": `${C.yellow}${C.bold} DEEP ANALYSIS ${C.reset}`,
    "single-default": `${C.cyan}${C.bold} STANDARD ${C.reset}`,
    "single-fast": `${C.green}${C.bold} QUICK ${C.reset}`,
  };

  process.stderr.write(`\n`);
  process.stderr.write(`${C.dim}┌─${C.reset} ${C.bold}opencode:execute${C.reset} ${C.dim}────────────────────────────${C.reset}\n`);
  process.stderr.write(`${C.dim}│${C.reset}\n`);
  process.stderr.write(`${C.dim}│${C.reset}  ${modeLabels[classification.mode]} ${C.dim}recommended${C.reset}\n`);
  process.stderr.write(`${C.dim}│${C.reset}  ${classification.reason}\n`);
  process.stderr.write(`${C.dim}│${C.reset}  Agents: ${classification.agentCount} · Tier: ${classification.modelTier}\n`);
  process.stderr.write(`${C.dim}│${C.reset}\n`);
  process.stderr.write(`${C.dim}└─────────────────────────────────────────────${C.reset}\n`);
  process.stderr.write(`\n`);

  // ── Route to the right handler ──
  if (classification.mode === "orchestrate") {
    return handleOrchestrate(flags, positional);
  }

  // Single agent — pick model based on tier
  const available = config.availableModels ?? [];
  let model;

  const _priority = config.modelPriority ?? [];
  if (flags.model) {
    model = flags.model;
  } else if (classification.modelTier === "heavy" || classification.modelTier === "critical") {
    // Prefer a codex/strong model from the priority list, then from all available
    const codexInPriority = _priority.find((m) => m.includes("codex") && !m.includes("mini"));
    const codexInAvailable = available.find((m) => m.includes("codex") && !m.includes("mini") && !m.includes("spark"));
    model = codexInPriority ?? codexInAvailable ?? _priority[0] ?? "minimax/MiniMax-M2.7";
  } else if (classification.modelTier === "light") {
    // Use priority[0] — or its highspeed sibling if available, never grab a random free model
    const base = (_priority[0] ?? "").replace(/-highspeed$/, "");
    const highspeed = base ? available.find((m) => m === base + "-highspeed") : null;
    model = highspeed ?? _priority[0] ?? "minimax/MiniMax-M2.7";
  } else {
    model = _priority[0] ?? "minimax/MiniMax-M2.7";
  }

  // ── Execute single agent ──
  const { pickOne } = await import("./lib/names.mjs");
  const agent = pickOne();
  agent.model = model;

  process.stderr.write(`${agentTag(agent)} working... (${model.split("/").pop()})\n`);

  const template = loadPrompt("ask");
  const finalPrompt = template
    ? interpolate(template, { prompt: task, cwd: CWD })
    : task;

  const jobId = generateJobId();
  upsertJob(CWD, {
    id: jobId,
    kind: "execute",
    status: "running",
    model,
    sessionId: process.env[SESSION_ID_ENV],
    prompt: task.slice(0, 200),
    agent: agent.name,
  });

  const result = await executeWithRetry(finalPrompt, {
    fallbackModels: [model, ...(config.modelPriority ?? []).filter((m) => m !== model)],
    cwd: CWD,
    onAttempt: (n, max, m) => {
      if (n > 1) process.stderr.write(`${agentTag(agent)} retry ${n}/${max}... (${m.split("/").pop()})\n`);
    },
    onFallback: (m) => {
      process.stderr.write(`${agentTag(agent)} switching to ${m.split("/").pop()}...\n`);
    },
  });

  const elapsed = "done";
  if (result.success) {
    process.stderr.write(`${agentTag(agent)} ${C.green}done${C.reset} (${result.model.split("/").pop()})\n\n`);
  } else {
    process.stderr.write(`${agentTag(agent)} ${C.red}failed${C.reset}\n\n`);
  }

  upsertJob(CWD, {
    id: jobId,
    status: result.success ? "done" : "failed",
    model: result.model,
    completedAt: new Date().toISOString(),
  });

  if (result.output) writeJobFile(CWD, jobId, "output.txt", result.output);

  const header = formatResultHeader(`execute · ${agent.name} (${agent.trait})`, result);
  output(header + (result.output || "No output.\n"));
}

// For the agent name import in execute
function agentTag(agent) {
  return `[${agent.name}]`;
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  const { command, flags, positional } = parseArgs(process.argv);

  switch (command) {
    case "setup":       await handleSetup(flags); break;
    case "execute":     await handleExecute(flags, positional); break;
    case "ask":         await handleAsk(flags, positional); break;
    case "review":      await handleReview(flags); break;
    case "plan":        await handlePlan(flags, positional); break;
    case "orchestrate": await handleOrchestrate(flags, positional); break;
    case "models":      await handleModels(flags); break;
    case "status":      handleStatus(flags, positional); break;
    case "result":      handleResult(flags, positional); break;
    default:
      console.log([
        "OpenCode Companion — Made by Alejandro Apodaca Cordova (apoapps.com)",
        "",
        "Usage:",
        '  opencode-runner.mjs execute     "<task>"             — RECOMMENDED: auto-routes everything',
        "  opencode-runner.mjs setup       [--json]            — Detect models & configure",
        '  opencode-runner.mjs ask         "<prompt>"           — Simple question (single agent)',
        "  opencode-runner.mjs review      [--base <ref>]       — Review git changes",
        '  opencode-runner.mjs plan        "<prompt>"           — Implementation planning',
        '  opencode-runner.mjs orchestrate "<complex task>"     — Force multi-agent',
        "  opencode-runner.mjs models                           — List available models",
        "  opencode-runner.mjs status      [job-id] [--all]     — Check job status",
        "  opencode-runner.mjs result      [job-id]             — Get job result",
      ].join("\n"));
      process.exit(command ? 1 : 0);
  }
}

main().catch((err) => {
  process.stderr.write(`${err.message ?? err}\n`);
  process.exit(1);
});
