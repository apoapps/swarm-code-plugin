/**
 * OpenCode CLI wrapper — generic model detection, fallback priority, and retry logic.
 * No hardcoded models. Detects whatever is configured in your OpenCode CLI.
 *
 * Made by Alejandro Apodaca Cordova (apoapps.com)
 */

import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 2_000;

export async function checkOpenCodeAvailable() {
  try {
    const result = await runCommand("opencode", ["--version"], { timeout: 5_000 });
    return { available: true, version: result.stdout.trim() };
  } catch {
    return { available: false, version: null };
  }
}

/**
 * Detect all available models from OpenCode CLI.
 * Returns array of model ID strings grouped by provider.
 */
export async function detectAvailableModels() {
  try {
    const result = await runCommand("opencode", ["models"], { timeout: 15_000 });
    const lines = result.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines;
  } catch {
    return [];
  }
}

/**
 * Group models by provider (e.g., "minimax", "openai", "github-copilot").
 */
export function groupModelsByProvider(models) {
  const groups = {};
  for (const model of models) {
    const slash = model.indexOf("/");
    const provider = slash > 0 ? model.slice(0, slash) : "unknown";
    if (!groups[provider]) groups[provider] = [];
    groups[provider].push(model);
  }
  return groups;
}

/**
 * Given a priority list and available models, resolve the best model to use.
 * Falls through the priority list until one is found in available models.
 * @param {string[]} priorityList - Ordered model IDs (user preference)
 * @param {string[]} availableModels - Models detected from CLI
 * @returns {{ model: string|null, fallbackUsed: boolean, original: string|null, unavailable: string[] }}
 */
export function resolveModel(priorityList, availableModels) {
  if (!priorityList || priorityList.length === 0) {
    return { model: null, fallbackUsed: false, original: null, unavailable: [] };
  }

  const availableLower = new Set(availableModels.map((m) => m.toLowerCase()));
  const unavailable = [];

  for (let i = 0; i < priorityList.length; i++) {
    const candidate = priorityList[i];
    if (availableLower.has(candidate.toLowerCase())) {
      return {
        model: candidate,
        fallbackUsed: i > 0,
        original: i > 0 ? priorityList[0] : null,
        unavailable,
      };
    }
    unavailable.push(candidate);
  }

  return { model: null, fallbackUsed: true, original: priorityList[0], unavailable };
}

function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options.timeout ?? 30_000,
      env: { ...process.env, ...options.env },
      cwd: options.cwd,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr, code });
      else reject(Object.assign(new Error(`Exit code ${code}`), { stdout, stderr, code }));
    });
  });
}

/**
 * Execute an OpenCode prompt with retry logic and model fallback.
 * @param {string} prompt
 * @param {object} options - { fallbackModels, mode, timeout, cwd, onAttempt, onFallback }
 * @returns {Promise<{success: boolean, output: string, attempts: number, model: string, fallbackUsed: boolean}>}
 */
export async function executeWithRetry(prompt, options = {}) {
  const models = options.fallbackModels ?? [options.model ?? "minimax/MiniMax-M2.7"];
  const mode = options.mode ?? "read-only";
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const cwd = options.cwd ?? process.cwd();
  const onAttempt = options.onAttempt ?? (() => {});
  const onFallback = options.onFallback ?? (() => {});

  for (let mi = 0; mi < models.length; mi++) {
    const model = models[mi];
    if (mi > 0) onFallback(model, models[0]);

    let lastError = null;
    let lastOutput = "";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      onAttempt(attempt, MAX_ATTEMPTS, model);

      try {
        const result = await runCommand(
          "opencode",
          ["exec", "-s", mode, "--model", model, prompt],
          { timeout, cwd }
        );

        return {
          success: true,
          output: result.stdout + (result.stderr ? `\n${result.stderr}` : ""),
          attempts: attempt,
          model,
          fallbackUsed: mi > 0,
        };
      } catch (err) {
        lastError = err;
        lastOutput = (err.stdout ?? "") + (err.stderr ?? "");

        if (attempt < MAX_ATTEMPTS) {
          const wait = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
          await new Promise((r) => setTimeout(r, wait));
        }
      }
    }

    // Model exhausted retries — try next fallback
    if (mi < models.length - 1) continue;

    return {
      success: false,
      output: lastOutput || (lastError?.message ?? "Unknown error"),
      attempts: MAX_ATTEMPTS,
      model,
      fallbackUsed: mi > 0,
      error: lastError?.message,
    };
  }
}
