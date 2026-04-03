#!/usr/bin/env node

/**
 * Session Hook (Phase 5) — Unified Session Formatting
 * Formats all OpenCode responses with consistent headers, colors, and metadata
 * 
 * Called by hooks.json on ResponseComplete lifecycle
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import SessionFormatter from '../lib/ui/session-formatter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Format an OpenCode session response
 * Called after opencode CLI execution completes
 */
export function formatSession({
  model,
  status = 'COMPLETED',
  content,
  elapsedTime,
  tokenCount,
  attempt = 1,
  maxAttempts = 3,
  routingDecision = null,
}) {
  const formatted = SessionFormatter.format({
    status,
    model,
    elapsedTime: elapsedTime || 0,
    tokenCount: tokenCount || 0,
    attempt,
    maxAttempts,
    content,
    showRouting: !!routingDecision,
    routing: routingDecision,
  });

  return formatted;
}

/**
 * Hook entry point for ResponseComplete lifecycle
 */
export function onResponseComplete({
  sessionId,
  model,
  output,
  metadata = {},
}) {
  const formatted = formatSession({
    model,
    status: metadata.status || 'COMPLETED',
    content: output,
    elapsedTime: metadata.elapsedTime || 0,
    tokenCount: metadata.tokenCount || 0,
    attempt: metadata.attempt || 1,
    routingDecision: metadata.routingDecision,
  });

  // Output the formatted session
  console.log(formatted);

  // Log session metadata for analytics
  logSessionMetadata({
    sessionId,
    model,
    status: metadata.status,
    elapsedTime: metadata.elapsedTime,
    tokenCount: metadata.tokenCount,
    timestamp: new Date().toISOString(),
  });
}

function logSessionMetadata(meta) {
  // Persist to session history for UI enhancements in Phase 5
  const historyFile = path.join(process.cwd(), '.opencode-history.jsonl');
  const fs = await import('node:fs/promises');
  
  try {
    await fs.appendFile(historyFile, JSON.stringify(meta) + '\n');
  } catch (err) {
    // Silent fail — don't interrupt session
  }
}

/**
 * Format a failed session with error message
 */
export function formatError({
  model,
  error,
  attempt = 1,
  maxAttempts = 3,
}) {
  return SessionFormatter.formatError({
    model,
    error,
    attempt,
    maxAttempts,
  });
}

export default {
  lifecycle: 'ResponseComplete',
  onResponseComplete,
  formatSession,
  formatError,
};
