/**
 * Progress Bar - Real-time job progress visualization
 * Supports spinner, percentage bars, and status updates
 */

const ProgressBar = {
  /**
   * Create a progress tracker with spinner
   */
  create(label, total = 100) {
    const state = {
      label,
      total,
      current: 0,
      startTime: Date.now(),
      lines: [],
      active: true,
    };

    const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
    let frameIndex = 0;

    const update = (progress, message = '') => {
      if (!state.active) return;
      
      const elapsed = ((Date.now() - state.startTime) / 1000).toFixed(1);
      const percent = Math.round((progress / state.total) * 100);
      const barWidth = 20;
      const filled = Math.round((progress / state.total) * barWidth);
      const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);

      const frame = frames[frameIndex++ % frames.length];
      const status = message ? ` — ${message}` : '';
      
      const line = `  ${frame} ${state.label} [${bar}] ${percent}% (${elapsed}s)${status}`;
      process.stderr.write(`\r\x1b[2K${line}`);
    };

    const done = (finalMessage = '✓ Complete') => {
      state.active = false;
      process.stderr.write(`\r\x1b[2K  ${finalMessage}\n`);
    };

    const error = (errorMessage) => {
      state.active = false;
      process.stderr.write(`\r\x1b[2K  ✗ ${errorMessage}\n`);
    };

    return { update, done, error, state };
  },

  /**
   * Create a simple spinner (indeterminate progress)
   */
  spinner(label) {
    const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
    const phrases = ['tokenizando...','chambeando...','awanta...','dale gas...','procesando...'];
    
    let frameIndex = 0;
    let phraseIndex = 0;
    let active = true;

    const timer = setInterval(() => {
      if (!active) {
        clearInterval(timer);
        return;
      }

      const phrase = frameIndex % 18 === 0 ? phrases[phraseIndex++ % phrases.length] : null;
      const frame = frames[frameIndex++ % frames.length];
      const line = phrase ? `  ${label} ${frame} ${phrase}` : `  ${label} ${frame}`;
      process.stderr.write(`\r\x1b[2K${line}`);
    }, 130);

    return {
      stop: (finalMessage = '✓ Done') => {
        active = false;
        process.stderr.write(`\r\x1b[2K  ${finalMessage}\n`);
      },
      error: (msg) => {
        active = false;
        process.stderr.write(`\r\x1b[2K  ✗ ${msg}\n`);
      },
    };
  },
};

export default ProgressBar;
