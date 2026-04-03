/**
 * Session Formatter - Colored, human-readable session output with metadata
 * Provides consistent visual styling across all OpenCode responses
 */

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

const StatusEmoji = {
  READY: '✅',
  RUNNING: '🔄',
  COMPLETED: '✨',
  FALLBACK: '⚠️',
  FAILED: '❌',
  TIMEOUT: '⏱️',
};

const SessionFormatter = {
  /**
   * Format a session header with metadata
   */
  header(session) {
    const {
      model = 'unknown',
      status = 'READY',
      elapsed = 0,
      tokens = 0,
      attempt = 1,
      fallbackUsed = false,
    } = session;

    const modelName = this._getModelDisplayName(model);
    const elapsedStr = elapsed ? `${(elapsed / 1000).toFixed(1)}s` : 'pending';
    const statusEmoji = StatusEmoji[status] || '❓';
    const fallbackNote = fallbackUsed ? ` ${StatusEmoji.FALLBACK} (fallback)` : '';

    const lines = [
      `${statusEmoji} ${colors.bold}OpenCode Session${colors.reset}`,
      `${colors.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`,
      `Model:    ${colors.cyan}${modelName}${colors.reset}${fallbackNote}`,
      `Status:   ${this._statusColor(status)}${status}${colors.reset} (${elapsedStr})`,
      tokens > 0 ? `Tokens:   ~${tokens} (saves ~${Math.floor(tokens * 6)} Claude tokens)` : null,
      `Attempt:  ${attempt}/3`,
      `${colors.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`,
    ].filter(Boolean).join('\n');

    return lines;
  },

  /**
   * Format final response with session metadata
   */
  response(content, session) {
    const header = this.header(session);
    return `${header}\n\n${content}`;
  },

  /**
   * Format error with styling
   */
  error(message, attempt = 1, maxAttempts = 3) {
    return `${colors.red}${StatusEmoji.FAILED} Error (Attempt ${attempt}/${maxAttempts})${colors.reset}\n${colors.dim}${message}${colors.reset}`;
  },

  /**
   * Format progress indicator for background jobs
   */
  progress(jobId, status, elapsed = 0) {
    const statusEmoji = StatusEmoji[status] || '❓';
    const elapsedStr = elapsed ? `${(elapsed / 1000).toFixed(1)}s` : '0s';
    return `${statusEmoji} Job ${colors.dim}${jobId.slice(0, 8)}${colors.reset} — ${status} (${elapsedStr})`;
  },

  /**
   * Format model selection decision
   */
  decision(model, rationale, timeEstimate = null) {
    const modelName = this._getModelDisplayName(model);
    const timeStr = timeEstimate ? ` (est. ${(timeEstimate / 1000).toFixed(1)}s)` : '';
    
    return `${colors.green}→ Routing to ${colors.bold}${modelName}${colors.reset}${colors.green}${timeStr}${colors.reset}\n${colors.dim}${rationale}${colors.reset}`;
  },

  /**
   * Format a task summary with keyword detection
   */
  taskSummary(taskType, keywords, tokenCount) {
    const typeEmoji = {
      'ask': '❓',
      'review': '🔍',
      'plan': '📋',
      'default': '⚙️',
    }[taskType] || '⚙️';

    const keywordStr = keywords.length > 0 
      ? `detected: ${keywords.join(', ')}`
      : 'no specific keywords';

    return `${typeEmoji} Task: ${colors.bold}${taskType}${colors.reset} (${keywordStr}) • ~${tokenCount} tokens`;
  },

  // Private helpers

  _getModelDisplayName(modelId) {
    const names = {
      'minimax/MiniMax-M2.5': 'MiniMax 2.5 HighSpeed',
      'minimax/MiniMax-M2.7': 'MiniMax 2.7 Balanced',
      'openai/gpt-5.1-codex': 'GPT-5.1 Codex',
      'openai/gpt-5-codex': 'GPT-5 Codex',
      'github-copilot/gpt-5.4': 'GitHub Copilot',
    };
    return names[modelId] || modelId;
  },

  _statusColor(status) {
    const statusColors = {
      'READY': colors.blue,
      'RUNNING': colors.cyan,
      'COMPLETED': colors.green,
      'FALLBACK': colors.yellow,
      'FAILED': colors.red,
      'TIMEOUT': colors.red,
    };
    return statusColors[status] || colors.reset;
  },

  // Utility: strip ANSI codes (for non-TTY output)
  stripAnsi(text) {
    return text.replace(/\x1b\[[0-9;]*m/g, '');
  },
};

export default SessionFormatter;
