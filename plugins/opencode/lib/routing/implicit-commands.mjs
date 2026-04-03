/**
 * Implicit Commands - Parses user intent and converts to explicit /opencode commands
 * Enables natural language delegation (e.g., "review this code" → "/opencode:review")
 */

import PreExecDetector from './pre-exec-detector.mjs';

const ImplicitCommands = {
  /**
   * Parse user input and convert to explicit OpenCode command if appropriate
   * @param {string} userInput - Raw user message
   * @param {Object} context - Task context (files, git, etc.)
   * @returns {Object} - { command, args, implied, rationale }
   */
  parse(userInput, context = {}) {
    // Check for explicit commands first
    if (PreExecDetector.isExplicitRequest(userInput)) {
      const taskType = PreExecDetector.extractTaskFromCommand(userInput);
      return {
        command: taskType ? `opencode:${taskType}` : 'opencode',
        args: this._extractArgs(userInput),
        explicit: true,
        rationale: 'explicit /opencode command detected',
      };
    }

    // Analyze for implicit delegation
    const analysis = PreExecDetector.analyze(userInput, context);

    // If score is high enough, infer command
    if (analysis.recommendation === 'DELEGATE') {
      const command = `opencode:${analysis.taskType}`;
      return {
        command,
        args: this._inferArgs(analysis.taskType, userInput, context),
        explicit: false,
        implied: true,
        rationale: `implied ${analysis.taskType} (score: ${analysis.score}, keywords: ${analysis.keywords.join(', ')})`,
      };
    }

    return {
      command: null,
      explicit: false,
      implied: false,
      rationale: 'score too low for automatic delegation',
    };
  },

  /**
   * Build preset commands for common patterns
   */
  presets: {
    'review': {
      description: 'Review git changes',
      command: 'opencode:review',
      args: ['--base', 'origin/main'],
    },
    'analyze': {
      description: 'Analyze code or architecture',
      command: 'opencode:ask',
      args: [],
    },
    'plan': {
      description: 'Plan implementation',
      command: 'opencode:plan',
      args: [],
    },
    'ask': {
      description: 'Ask a question',
      command: 'opencode:ask',
      args: [],
    },
  },

  /**
   * Register custom preset
   */
  registerPreset(name, preset) {
    this.presets[name.toLowerCase()] = preset;
  },

  /**
   * Get available presets
   */
  listPresets() {
    return Object.entries(this.presets).map(([name, preset]) => ({
      name,
      ...preset,
    }));
  },

  // Private helpers

  /**
   * Extract arguments from explicit /opencode command
   */
  _extractArgs(prompt) {
    // Simple arg extraction: everything after the command
    const argMatch = prompt.match(/\/opencode(?::\w+)?\s+(.*)/);
    if (!argMatch) return [];
    
    // Parse as space-separated args (basic)
    return argMatch[1].split(/\s+/).filter(Boolean);
  },

  /**
   * Infer args from context and task type
   */
  _inferArgs(taskType, prompt, context) {
    const args = [];

    if (taskType === 'review') {
      // Add git options
      if (context.hasGitDiff) {
        args.push('--base', 'origin/main');
      }
      if (prompt.includes('--background') || prompt.includes('background')) {
        args.push('--background');
      }
    }

    if (taskType === 'plan') {
      // Extract plan topic from prompt
      const topicMatch = prompt.match(/plan\s+(.+)/i);
      if (topicMatch) {
        args.push(topicMatch[1]);
      }
    }

    if (taskType === 'ask') {
      // Extract question from prompt
      const questionMatch = prompt.match(/\?(.+)|(?:explain|help)(.+)/i);
      if (questionMatch) {
        args.push((questionMatch[1] || questionMatch[2]).trim());
      }
    }

    return args;
  },
};

export default ImplicitCommands;
