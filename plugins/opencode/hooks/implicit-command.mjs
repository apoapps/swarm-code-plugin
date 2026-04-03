/**
 * Implicit Command Hook - Convert natural language to /opencode:command
 * Detects phrases like "Analiza esto", "Cómo implementar", "Revisa los cambios"
 * and automatically routes to appropriate OpenCode command
 *
 * Fires on SessionStart (runs before main Claude processing)
 */

import ImplicitCommands from '../lib/routing/implicit-commands.mjs';

/**
 * Hook entry point - analyzes message for implicit commands
 * Returns the detected command or null if no match
 */
export async function onSessionStart({ message, context }) {
  const language = context?.language || 'en';
  
  // Try to detect an implicit command in the message
  const detected = ImplicitCommands.detect(message, language);
  
  if (!detected) {
    return null; // No implicit command found
  }

  // Prepare auto-command invocation
  return {
    implicitCommand: detected.command,
    preset: detected.preset,
    args: detected.args || [],
    confidence: detected.confidence,
    rawMatch: detected.rawMatch,
    // Signal: "don't process this as a normal message, run this command instead"
    shouldIntercept: detected.confidence > 0.7,
  };
}

/**
 * Optional: Enrich the implicit command detection with git context
 */
export function enrichContext({ message, gitStatus, gitDiff, locale }) {
  return {
    language: locale?.split('-')[0] || 'en',
    hasGitContext: !!(gitStatus || gitDiff),
    gitFiles: gitStatus?.files || [],
  };
}

export default {
  lifecycle: 'SessionStart',
  onSessionStart,
  enrichContext,
};
