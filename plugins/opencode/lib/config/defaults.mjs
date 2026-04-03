/**
 * Default Configuration - Centralized settings for timeouts, retry logic, model priorities
 */

export const defaults = {
  // Timeouts
  timeout: {
    defaultMs: 30000,
    minMs: 5000,
    maxMs: 120000,
  },

  // Retry logic
  retry: {
    maxAttempts: 3,
    backoffMs: [2000, 4000, 8000], // exponential: 2s, 4s, 8s
    retryableErrors: ['TIMEOUT', 'ECONNREFUSED', 'ENOTFOUND', 'RATE_LIMIT'],
  },

  // Token estimation
  tokens: {
    avgTokensPerWord: 1.3,
    avgTokensPerLine: 4,
    overheadPerRequest: 50,
  },

  // Session
  session: {
    cleanupOnEnd: true,
    stateFileMaxAgeSec: 3600 * 24 * 7, // 7 days
  },

  // Task routing
  routing: {
    enableAutoRouting: true,
    enableImplicitCommands: true,
    delegationScoreThreshold: 70, // 0-100
  },

  // Model priority defaults (can be overridden by user config)
  modelPriority: {
    ask: ['minimax/MiniMax-M2.5', 'minimax/MiniMax-M2.7', 'openai/gpt-5-codex'],
    review: ['minimax/MiniMax-M2.7', 'openai/gpt-5.1-codex', 'github-copilot/gpt-5.4'],
    plan: ['minimax/MiniMax-M2.7', 'minimax/MiniMax-M2.5', 'openai/gpt-5-codex'],
    default: ['minimax/MiniMax-M2.7', 'openai/gpt-5-codex', 'github-copilot/gpt-5.4'],
  },

  // UI
  ui: {
    enableColors: true,
    enableEmojis: true,
    verboseLogging: false,
  },
};

export default defaults;
