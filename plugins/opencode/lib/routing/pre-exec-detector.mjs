/**
 * Pre-Execution Detector - Analyzes prompts before execution to determine delegation
 * Scores tasks (0-100) to automatically route to OpenCode when beneficial
 */

const PreExecDetector = {
  // Keywords that trigger delegation
  keywordPatterns: {
    es: {
      review: /revisar|analizar|review|código|cambios|diff|pull request|pr|merge/i,
      plan: /planificar|plan|arquitectura|diseño|implementar|estructura|como|cómo|approach|strategy/i,
      ask: /¿|pregunta|explica|explain|cómo|how|qué|what|por qué|why|entender|understand/i,
      gitContext: /git\s+diff|git\s+log|git\s+show|changed files|diff|stage|commit|branch/i,
    },
    en: {
      review: /review|analyze|code|changes|diff|pull request|pr|merge|inspect|audit/i,
      plan: /plan|architecture|design|implement|structure|how|approach|strategy|blueprint/i,
      ask: /\?|question|explain|how|what|why|understand|clarify|help me/i,
      gitContext: /git\s+diff|git\s+log|git\s+show|changed files|diff|stage|commit|branch/i,
    },
  },

  // File patterns that suggest code analysis
  filePatternsNeedAnalysis: /\.(ts|tsx|js|jsx|py|java|cs|cpp|rb|go|rs)$/,
  testFilePatterns: /\.test\.(ts|js)|\.spec\.(ts|js)|__tests__|test_/,

  /**
   * Analyze a user prompt and determine delegation score
   * @param {string} prompt - User's message
   * @param {Object} context - Additional context (files mentioned, git diff, etc.)
   * @returns {Object} - { score: 0-100, recommendation, taskType, keywords, reasoning }
   */
  analyze(prompt, context = {}) {
    let score = 0;
    const reasoning = [];
    const keywords = [];
    let taskType = 'default';

    if (!prompt || typeof prompt !== 'string') {
      return { score: 0, recommendation: 'SKIP', taskType: 'default', keywords: [], reasoning: [] };
    }

    // Detect language (simple heuristic)
    const lang = this._detectLanguage(prompt);

    // 1. Keyword detection (+30)
    const kwScores = this._scoreKeywords(prompt, lang);
    if (kwScores.score > 0) {
      score += kwScores.score;
      keywords.push(...kwScores.detected);
      taskType = kwScores.taskType;
      reasoning.push(`keywords: ${kwScores.detected.join(', ')}`);
    }

    // 2. Git context (+25)
    if (this.keywordPatterns[lang].gitContext.test(prompt) || context.hasGitDiff) {
      score += 25;
      keywords.push('git-context');
      taskType = 'review';
      reasoning.push('git diff or version control context detected');
    }

    // 3. Code file mentions (+20)
    if (context.fileMentioned && this.filePatternsNeedAnalysis.test(context.fileMentioned)) {
      score += 20;
      keywords.push('code-file');
      reasoning.push(`code file mentioned: ${context.fileMentioned}`);
    }

    // 4. Test/spec file (+15)
    if (context.fileMentioned && this.testFilePatterns.test(context.fileMentioned)) {
      score += 15;
      keywords.push('test-file');
      reasoning.push('test/spec file analysis');
    }

    // 5. Large context size (+15)
    if (context.contextSizeBytes > 10000) {
      score += 15;
      keywords.push('large-context');
      reasoning.push(`large context: ${(context.contextSizeBytes / 1024).toFixed(1)}KB`);
    }

    // 6. Language preference (+10 for Spanish native support)
    if (lang === 'es') {
      score += 5; // Slight bonus for Spanish prompts
      reasoning.push('Spanish language (native support)');
    }

    // Recommendation based on score
    let recommendation = 'SKIP';
    if (score >= 70) {
      recommendation = 'DELEGATE';
    } else if (score >= 50) {
      recommendation = 'CONSIDER';
    }

    return {
      score: Math.min(100, score),
      recommendation,
      taskType,
      keywords,
      reasoning,
      language: lang,
    };
  },

  /**
   * Score keywords in prompt
   */
  _scoreKeywords(prompt, lang) {
    const patterns = this.keywordPatterns[lang] || this.keywordPatterns.en;
    let score = 0;
    const detected = [];
    let taskType = 'default';

    if (patterns.review.test(prompt)) {
      score += 30;
      detected.push('review');
      taskType = 'review';
    } else if (patterns.plan.test(prompt)) {
      score += 28;
      detected.push('planning');
      taskType = 'plan';
    } else if (patterns.ask.test(prompt)) {
      score += 20;
      detected.push('question');
      taskType = 'ask';
    }

    return { score, detected, taskType };
  },

  /**
   * Simple language detection
   */
  _detectLanguage(text) {
    const spanishIndicators = /\?|¿|ñ|á|é|í|ó|ú|ü/g;
    const spanish = (text.match(spanishIndicators) || []).length;
    return spanish > 2 ? 'es' : 'en';
  },

  /**
   * Check if user explicitly requested delegation
   */
  isExplicitRequest(prompt) {
    const patterns = [
      /\/opencode/i,
      /delega\s+a\s+opencode/i,
      /delegate\s+to\s+opencode/i,
      /run\s+opencode/i,
      /usa\s+opencode/i,
    ];

    return patterns.some(p => p.test(prompt));
  },

  /**
   * Extract task type from explicit commands
   */
  extractTaskFromCommand(prompt) {
    const matches = [
      { pattern: /\/opencode:review/i, taskType: 'review' },
      { pattern: /\/opencode:plan/i, taskType: 'plan' },
      { pattern: /\/opencode:ask/i, taskType: 'ask' },
      { pattern: /\/opencode(?!:)/i, taskType: 'default' },
    ];

    for (const { pattern, taskType } of matches) {
      if (pattern.test(prompt)) {
        return taskType;
      }
    }

    return null;
  },
};

export default PreExecDetector;
