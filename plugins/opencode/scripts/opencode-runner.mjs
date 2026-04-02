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

// ─── Commands ────────────────────────────────────────────────────────

async function handleSetup(flags) {
  const availability = await checkOpenCodeAvailable();
  const config = getConfig(CWD);

  if (!availability.available) {
    const report = {
      opencode: "NOT FOUND",
      models: [],
      config,
      action: "Install OpenCode CLI: https://opencode.ai/docs/install",
    };
    if (flags.json) { output(report, true); } else {
      output([
        "## OpenCode Setup",
        "",
        "**OpenCode CLI**: NOT FOUND",
        "",
        "Install: https://opencode.ai/docs/install",
        "",
        "Made by Alejandro Apodaca Cordova (apoapps.com)",
      ].join("\n") + "\n");
    }
    return;
  }

  // Detect available models
  process.stderr.write("Detecting available models...\n");
  const available = await detectAvailableModels();

  // Update cached models
  setConfig(CWD, {
    availableModels: available,
    availableModelsCheckedAt: new Date().toISOString(),
  });

  // Resolve which model would be used
  const resolved = resolveModel(config.modelPriority ?? [], available);

  // Group detected models by provider
  const grouped = groupModelsByProvider(available);

  const report = {
    opencode: `installed (${availability.version})`,
    activeModel: resolved.model ?? "NONE — run /opencode:setup to configure",
    fallbackUsed: resolved.fallbackUsed,
    unavailable: resolved.unavailable,
    modelPriority: config.modelPriority ?? [],
    detectedModels: available,
    modelsByProvider: grouped,
    reviewOnStop: config.reviewOnStop,
  };

  if (flags.json) {
    output(report, true);
    return;
  }

  const lines = [
    "## OpenCode Setup",
    "",
    `**OpenCode CLI**: installed (${availability.version})`,
    `**Active model**: ${resolved.model ?? "NONE"}${resolved.fallbackUsed ? ` (fallback — ${resolved.original} unavailable)` : ""}`,
    `**Review on stop**: ${config.reviewOnStop ? "enabled" : "disabled"}`,
    "",
    "### Model Priority (first available is used)",
    ...(config.modelPriority ?? []).length > 0
      ? (config.modelPriority ?? []).map((m, i) => {
          const avail = available.some((a) => a.toLowerCase() === m.toLowerCase());
          return `  ${i + 1}. ${m} — ${avail ? "available" : "UNAVAILABLE"}`;
        })
      : ["  (none configured — run /opencode:setup to pick a model)"],
    "",
    "### Detected Models by Provider",
    ...Object.entries(grouped).flatMap(([provider, models]) => [
      `  **${provider}** (${models.length})`,
      ...models.map((m) => {
        const isPrimary = config.modelPriority?.[0] === m;
        const inPriority = (config.modelPriority ?? []).includes(m);
        return `    - ${m}${isPrimary ? " <- PRIMARY" : inPriority ? " <- fallback" : ""}`;
      }),
    ]),
    "",
    "### Configuration",
    'To change model priority, tell Claude which model you prefer.',
    "Claude will update the config via `/opencode:setup --set-primary <model>`.",
    "",
    "---",
    "Made by Alejandro Apodaca Cordova (apoapps.com)",
  ];

  output(lines.join("\n") + "\n");
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

  if (result.success) {
    if (result.fallbackUsed) {
      process.stderr.write(`[Note] Used fallback model: ${result.model}\n`);
    }
    output(result.output);
  } else {
    output(`## OpenCode Ask — FAILED\n\n**Models tried**: ${models.join(", ")}\n**Attempts**: ${result.attempts}/3 per model\n**Error**: ${result.error ?? "timeout"}\n\n${result.output}\n`);
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
  output(result.output || "No output from review.\n");
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
  output(result.output || "No output from planning.\n");
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

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  const { command, flags, positional } = parseArgs(process.argv);

  switch (command) {
    case "setup":    await handleSetup(flags); break;
    case "ask":      await handleAsk(flags, positional); break;
    case "review":   await handleReview(flags); break;
    case "plan":     await handlePlan(flags, positional); break;
    case "status":   handleStatus(flags, positional); break;
    case "result":   handleResult(flags, positional); break;
    default:
      console.log([
        "OpenCode Companion — Made by Alejandro Apodaca Cordova (apoapps.com)",
        "",
        "Usage:",
        "  opencode-runner.mjs setup  [--json]              — Detect models & configure",
        '  opencode-runner.mjs ask    "<prompt>"             — Ask a question',
        "  opencode-runner.mjs review [--base <ref>]         — Review git changes",
        '  opencode-runner.mjs plan   "<prompt>"             — Implementation planning',
        "  opencode-runner.mjs status [job-id] [--all]       — Check job status",
        "  opencode-runner.mjs result [job-id]               — Get job result",
      ].join("\n"));
      process.exit(command ? 1 : 0);
  }
}

main().catch((err) => {
  process.stderr.write(`${err.message ?? err}\n`);
  process.exit(1);
});
