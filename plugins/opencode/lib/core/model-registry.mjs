/**
 * Model Registry - Centralized model metadata, capabilities, and fallback chains
 * Manages model selection, timeouts, and optimal routing per task type
 */

const ModelRegistry = {
  // Model metadata with capabilities
  models: {
    'minimax/MiniMax-M2.5': {
      name: 'MiniMax 2.5 (HighSpeed)',
      provider: 'MiniMax',
      tier: 'fast',
      capabilities: ['quick-analysis', 'questions', 'summaries'],
      avgResponseTime: 3000,
      costMultiplier: 0.3,
      maxContextSize: 8000,
      bestFor: ['ask', 'summaries', 'quick-reviews'],
    },
    'minimax/MiniMax-M2.7': {
      name: 'MiniMax 2.7 (Balanced)',
      provider: 'MiniMax',
      tier: 'balanced',
      capabilities: ['analysis', 'planning', 'architecture', 'questions'],
      avgResponseTime: 5000,
      costMultiplier: 0.5,
      maxContextSize: 16000,
      bestFor: ['plan', 'architecture', 'ask', 'reviews'],
    },
    'openai/gpt-5.1-codex': {
      name: 'GPT-5.1 Codex',
      provider: 'OpenAI',
      tier: 'premium',
      capabilities: ['deep-analysis', 'code-review', 'refactoring'],
      avgResponseTime: 15000,
      costMultiplier: 2.0,
      maxContextSize: 32000,
      bestFor: ['review', 'deep-analysis', 'architecture'],
    },
    'openai/gpt-5-codex': {
      name: 'GPT-5 Codex',
      provider: 'OpenAI',
      tier: 'premium',
      capabilities: ['deep-analysis', 'code-review', 'refactoring'],
      avgResponseTime: 12000,
      costMultiplier: 1.8,
      maxContextSize: 32000,
      bestFor: ['review', 'deep-analysis'],
    },
    'github-copilot/gpt-5.4': {
      name: 'GitHub Copilot GPT-5.4',
      provider: 'GitHub Copilot',
      tier: 'premium',
      capabilities: ['deep-analysis', 'code-generation', 'optimization'],
      avgResponseTime: 10000,
      costMultiplier: 1.5,
      maxContextSize: 32000,
      bestFor: ['review', 'code-generation'],
    },
  },

  // Default fallback chains per task type
  fallbackChains: {
    ask: [
      'minimax/MiniMax-M2.5',
      'minimax/MiniMax-M2.7',
      'openai/gpt-5-codex',
    ],
    review: [
      'minimax/MiniMax-M2.7',
      'openai/gpt-5.1-codex',
      'github-copilot/gpt-5.4',
    ],
    plan: [
      'minimax/MiniMax-M2.7',
      'minimax/MiniMax-M2.5',
      'openai/gpt-5-codex',
    ],
    default: [
      'minimax/MiniMax-M2.7',
      'minimax/MiniMax-M2.5',
      'openai/gpt-5.1-codex',
    ],
  },

  // Get recommended model for task
  getRecommendedModel(taskType, complexity = 'medium', budget = 'medium') {
    const chain = this.fallbackChains[taskType] || this.fallbackChains.default;
    
    // If budget-conscious, prefer MiniMax
    if (budget === 'low') {
      return chain.find(m => m.includes('minimax')) || chain[0];
    }
    
    // If deep analysis needed, prefer premium
    if (complexity === 'high') {
      return chain.find(m => m.includes('gpt') || m.includes('copilot')) || chain[0];
    }
    
    return chain[0];
  },

  // Get model metadata
  getModel(modelId) {
    return this.models[modelId] || null;
  },

  // Check if model exists
  exists(modelId) {
    return modelId in this.models;
  },

  // Get all models in nice format
  listModels() {
    return Object.entries(this.models).map(([id, metadata]) => ({
      id,
      ...metadata,
    }));
  },

  // Get recommended timeout for model
  getTimeout(modelId) {
    const model = this.getModel(modelId);
    if (!model) return 30000; // default 30s
    return Math.ceil(model.avgResponseTime * 2.5); // 2.5x safety margin
  },

  // Calculate estimated cost for a task
  estimateCost(modelId, inputTokens, outputTokens) {
    const model = this.getModel(modelId);
    if (!model) return null;
    
    const baseTokenCost = (inputTokens + outputTokens) * model.costMultiplier;
    return {
      model,
      inputTokens,
      outputTokens,
      estimatedCost: baseTokenCost,
      costMultiplier: model.costMultiplier,
    };
  },
};

export default ModelRegistry;
