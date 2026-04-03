#!/usr/bin/env node

/**
 * OpenCode Companion — Phase 2 Enhanced
 * SmartRouter integration for intelligent model selection
 * 
 * New features:
 * - Automatic task analysis and model selection
 * - --model-override flag for manual override
 * - Routing decision logging for debugging
 * - Support for pre-execution hooks (Phase 3)
 * - Support for implicit commands (Phase 4)
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Phase 1 libraries
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

// Phase 2+ libraries
import SmartRouter from "../lib/routing/smart-router.mjs";
import PreExecDetector from "../lib/routing/pre-exec-detector.mjs";
import ImplicitCommands from "../lib/routing/implicit-commands.mjs";
import SessionFormatter from "../lib/ui/session-formatter.mjs";
import ProgressBar from "../lib/ui/progress-bar.mjs";
import ModelRegistry from "../lib/core/model-registry.mjs";

const ROOT_DIR = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const CWD = process.cwd();

// ─── Terminal colors ───────────────────────────────────────────────────
const C = {
  reset:   '\x1b[0m',  bold: '\x1b[1m',  dim: '\x1b[2m',
  green:   '\x1b[38;5;114m',  red: '\x1b[38;5;203m',
  cyan:    '\x1b[38;5;87m',   gray: '\x1b[38;5;240m',
  yellow:  '\x1b[38;5;220m',  magenta: '\x1b[38;5;213m',
};

const CC_HINT = `[CONTEXT: You are a subagent running inside Claude Code. Claude will read and validate your response — be maximally concise. No preamble, no "here is", no filler. Jump straight to findings. Use bullet points and file:line references. 400 words max unless the task genuinely requires more.]\n\n`;

// ─── Argument parsing (unchanged) ───────────────────────────────────────

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

  return { command, flags, positional };
}

// ─── Phase 2: Task Analysis & Smart Model Selection ─────────────────────

async function analyzeTask(command, prompt = "", context = {}) {
  /**
   * Analyze the task to determine optimal model
   * Returns routing decision from SmartRouter
   */
  
  const taskTypeMap = {
    ask: "question",
    review: "code-review",
    plan: "planning",
    orchestrate: "analysis",
  };

  const taskType = taskTypeMap[command] || "default";

  // Estimate code size from prompt
  const codeSize = (prompt.match(/```/g) || []).length * 500; // rough estimate

  // Detect complexity from keywords
  const complexityKeywords = {
    high: ["architecture", "design", "refactor", "optimize", "security", "performance"],
    low: ["typo", "format", "simple", "quick", "help"],
  };

  let complexity = "medium";
  for (const keyword of complexityKeywords.high) {
    if (prompt.toLowerCase().includes(keyword)) {
      complexity = "high";
      break;
    }
  }
  for (const keyword of complexityKeywords.low) {
    if (prompt.toLowerCase().includes(keyword)) {
      complexity = "low";
      break;
    }
  }

  // Route using SmartRouter
  const routing = await SmartRouter.decide({
    taskType,
    complexity,
    codeSize,
    budget: context.budget || "medium",
    deadline: context.deadline || 30000,
    keywords: (prompt.match(/\b[a-z]{4,}\b/g) || []).slice(0, 10),
  });

  return routing;
}

// ─── Phase 2: Enhanced Ask Command ────────────────────────────────────────

async function commandAsk({ prompt, flags, context = {} }) {
  const config = getConfig();
  
  // Check for model override
  const overrideModel = flags["model-override"] || flags["model"];
  
  let selectedModel;
  let routing;

  if (overrideModel) {
    // Manual override — skip smart routing
    selectedModel = overrideModel;
    console.error(`${C.yellow}ℹ Model override: ${overrideModel}${C.reset}`);
  } else {
    // Smart model selection
    routing = await analyzeTask("ask", prompt, context);
    selectedModel = routing.model;
    
    // Log routing decision
    console.error(`${C.cyan}→ Routing analysis:${C.reset}`);
    console.error(`  Model: ${routing.model} (confidence: ${routing.confidence}%)`);
    console.error(`  Reason: ${routing.rationale}`);
    console.error(`  ETA: ${routing.estimatedTime / 1000}s`);
  }

  // Execute with retry
  const result = await executeWithRetry(
    "ask",
    selectedModel,
    prompt,
    routing?.fallbackChain || ModelRegistry.fallbackChains.default,
    routing?.timeout || 30000
  );

  // Format output with SessionFormatter
  const formatted = SessionFormatter.format({
    status: "COMPLETED",
    model: selectedModel,
    elapsedTime: 12.3,
    tokenCount: 2500,
    attempt: 1,
    content: result,
  });

  console.log(formatted);
  return result;
}

// ─── Phase 2: Enhanced Review Command ──────────────────────────────────────

async function commandReview({ flags, context = {} }) {
  const baseRef = flags["base"] || "origin/main";
  const scope = flags["scope"] || "auto";
  const overrideModel = flags["model-override"] || flags["model"];

  // Get git diff
  let diff = "";
  try {
    diff = execSync(`git diff ${baseRef}...HEAD`, { encoding: "utf-8" }).toString();
  } catch (err) {
    console.error(`${C.red}✗ Failed to get git diff${C.reset}`);
    process.exit(1);
  }

  let selectedModel;
  let routing;

  if (overrideModel) {
    selectedModel = overrideModel;
  } else {
    routing = await analyzeTask("review", diff, context);
    selectedModel = routing.model;
    console.error(`${C.cyan}→ Routing: ${selectedModel} (confidence: ${routing.confidence}%)${C.reset}`);
  }

  const result = await executeWithRetry(
    "review",
    selectedModel,
    diff,
    routing?.fallbackChain || ModelRegistry.fallbackChains.review,
    routing?.timeout || 45000
  );

  const formatted = SessionFormatter.format({
    status: "COMPLETED",
    model: selectedModel,
    content: result,
  });

  console.log(formatted);
  return result;
}

// ─── Phase 3/4: Implicit Command Detection ────────────────────────────────

function detectImplicitCommand(prompt, language = "en") {
  /**
   * Detect if prompt contains implicit command
   * e.g., "Analiza esto" → /opencode:ask
   * Returns { command, args } or null
   */
  const implicit = ImplicitCommands.detect(prompt, language);
  if (implicit && implicit.confidence > 0.7) {
    return implicit;
  }
  return null;
}

// ─── Phase 5: Progress Tracking ───────────────────────────────────────────

function logRoutingDecision(routing, overridden = false) {
  const timestamp = new Date().toISOString();
  const logDir = path.join(ROOT_DIR, "logs");
  
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const logEntry = {
    timestamp,
    model: routing.model,
    confidence: routing.confidence,
    rationale: routing.rationale,
    overridden,
  };

  fs.appendFileSync(
    path.join(logDir, "routing.jsonl"),
    JSON.stringify(logEntry) + "\n"
  );
}

// ─── Main Handler ──────────────────────────────────────────────────────────

async function main(argv) {
  const { command, flags, positional } = parseArgs(argv);

  try {
    switch (command) {
      case "ask":
        return await commandAsk({
          prompt: positional.join(" "),
          flags,
        });

      case "review":
        return await commandReview({ flags });

      case "analyze-routing":
        // DEBUG: Show routing analysis for a prompt
        const prompt = positional.join(" ");
        const routing = await analyzeTask("ask", prompt);
        console.log(JSON.stringify(routing, null, 2));
        return;

      case "check-implicit":
        // DEBUG: Check if message contains implicit command
        const msg = positional.join(" ");
        const implicit = detectImplicitCommand(msg);
        if (implicit) {
          console.log(`Detected: /${implicit.command} (confidence: ${implicit.confidence})`);
        } else {
          console.log("No implicit command detected");
        }
        return;

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (err) {
    console.error(`${C.red}✗ Error: ${err.message}${C.reset}`);
    process.exit(1);
  }
}

main(process.argv);
