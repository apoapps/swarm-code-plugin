/**
 * Pre-Execution Hook - Auto-detection of OpenCode delegation opportunities
 * Fires on SessionStart to analyze Claude's prompt and auto-route if needed
 *
 * Configuration (in claude.json):
 *   {
 *     "routing": {
 *       "enableAutoRouting": true,
 *       "delegationScoreThreshold": 70
 *     }
 *   }
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PreExecDetector from '../lib/routing/pre-exec-detector.mjs';
import SmartRouter from '../lib/routing/smart-router.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Hook entry point
 * Called on SessionStart with claude's message
 */
export async function onSessionStart({ message, context }) {
  // Check if auto-routing is enabled
  const config = context?.config?.routing || {};
  if (!config.enableAutoRouting) {
    return null; // Pass through, no delegation
  }

  const threshold = config.delegationScoreThreshold ?? 70;

  // Score the prompt
  const score = PreExecDetector.analyze(message, {
    language: context?.language || 'en',
    hasGitContext: !!context?.gitDiff || !!context?.gitLog,
  });

  if (score.totalScore < threshold) {
    return null; // Don't delegate
  }

  // Decide which model to use
  const taskType = score.suggestedTask || 'ask';
  const complexity = score.totalScore > 85 ? 'high' : 'medium';
  
  const routing = await SmartRouter.decide({
    taskType,
    complexity,
    codeSize: context?.codeSize || 0,
    budget: config.budget || 'medium',
    keywords: score.detectedKeywords,
  });

  // Signal to opencode-runner that auto-delegation was triggered
  return {
    autoDelegate: true,
    command: taskType,
    model: routing.model,
    score: score.totalScore,
    rationale: routing.rationale,
    shouldShowNotice: score.totalScore >= threshold,
  };
}

export default {
  lifecycle: 'SessionStart',
  onSessionStart,
};
