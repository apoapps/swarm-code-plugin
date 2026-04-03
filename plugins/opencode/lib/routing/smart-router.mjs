/**
 * Smart Router - Intelligent model selection based on task characteristics
 * Routes tasks to optimal model considering complexity, budget, and deadline
 */

import ModelRegistry from '../core/model-registry.mjs';

const SmartRouter = {
  /**
   * Analyze task and decide optimal model
   * @param {Object} taskAnalysis - { taskType, complexity, codeSize, budget, deadline, keywords }
   * @returns {Object} - { model, rationale, estimatedTime, confidence }
   */
  async decide(taskAnalysis) {
    const {
      taskType = 'default',
      complexity = 'medium',
      codeSize = 0,
      budget = 'medium',
      deadline = 30000,
      keywords = [],
    } = taskAnalysis;

    // Scoring system: 0-100 for each model
    const scores = this._scoreModels(taskType, complexity, codeSize, budget, deadline, keywords);
    
    // Pick best model
    const bestModel = Object.entries(scores)
      .sort(([, a], [, b]) => b - a)[0][0];

    const fallbackChain = ModelRegistry.fallbackChains[taskType] || ModelRegistry.fallbackChains.default;
    const timeout = ModelRegistry.getTimeout(bestModel);
    const metadata = ModelRegistry.getModel(bestModel);

    return {
      model: bestModel,
      fallbackChain,
      timeout,
      rationale: this._getRationale(bestModel, scores[bestModel], taskType, complexity),
      estimatedTime: metadata?.avgResponseTime || 5000,
      confidence: Math.min(100, scores[bestModel]),
      scores, // debug info
    };
  },

  /**
   * Score all available models for the task
   */
  _scoreModels(taskType, complexity, codeSize, budget, deadline, keywords) {
    const scores = {};

    ModelRegistry.listModels().forEach(({ id }) => {
      let score = 50; // baseline

      const metadata = ModelRegistry.getModel(id);

      // Task type bonus
      if (metadata.bestFor.includes(taskType)) {
        score += 25;
      }

      // Complexity match
      if (complexity === 'low' && metadata.tier === 'fast') {
        score += 15;
      } else if (complexity === 'high' && metadata.tier === 'premium') {
        score += 20;
      } else if (complexity === 'medium' && metadata.tier === 'balanced') {
        score += 15;
      }

      // Code size vs context
      if (codeSize > 0) {
        if (codeSize > metadata.maxContextSize) {
          score -= 30; // Can't handle
        } else if (codeSize < metadata.maxContextSize * 0.3) {
          score += 5; // Overkill
        }
      }

      // Budget sensitivity
      if (budget === 'low') {
        score += (3 - metadata.costMultiplier) * 10; // Favor cheap models
      } else if (budget === 'unlimited') {
        score += metadata.costMultiplier * 5; // Favor premium
      }

      // Deadline pressure
      if (deadline < metadata.avgResponseTime * 1.5) {
        score -= 10; // Too slow
      }

      // Keyword boost
      if (keywords.length > 0) {
        keywords.forEach(kw => {
          if (metadata.capabilities.includes(kw)) {
            score += 10;
          }
        });
      }

      scores[id] = Math.max(0, Math.min(100, score));
    });

    return scores;
  },

  /**
   * Generate human-readable rationale
   */
  _getRationale(modelId, score, taskType, complexity) {
    const metadata = ModelRegistry.getModel(modelId);
    const confidence = score >= 80 ? 'strong' : score >= 60 ? 'moderate' : 'low';

    const reasons = [];

    if (metadata.bestFor.includes(taskType)) {
      reasons.push(`optimized for ${taskType}`);
    }

    if (taskType === 'ask' && metadata.tier === 'fast') {
      reasons.push('fast response for quick answers');
    } else if (taskType === 'review' && metadata.tier === 'premium') {
      reasons.push('deep code analysis capability');
    }

    if (complexity === 'high' && metadata.tier === 'premium') {
      reasons.push('handles complex tasks');
    }

    return `${metadata.name} (${confidence} match: ${reasons.join(', ')})`;
  },

  /**
   * Check if task should be delegated at all
   */
  shouldDelegate(taskAnalysis) {
    const { taskType = 'default', tokenCount = 0, complexity = 'medium' } = taskAnalysis;

    // Always delegate if token count is significant
    if (tokenCount > 500) return true;

    // Delegate based on task type
    const delegateTaskTypes = ['review', 'plan', 'architecture'];
    if (delegateTaskTypes.includes(taskType)) return true;

    // Delegate complex analyses
    if (complexity === 'high') return true;

    return false;
  },
};

export default SmartRouter;
