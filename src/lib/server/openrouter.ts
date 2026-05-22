/**
 * OpenRouter SDK Client
 *
 * Central module for OpenRouter API interactions.
 * Uses the official SDK for type safety, automatic retries, and cost tracking.
 */

import { OpenRouter } from '@openrouter/sdk';
import { env } from '$env/dynamic/private';

let clientInstance: OpenRouter | null = null;

/**
 * Get the OpenRouter client instance (singleton pattern)
 */
export function getOpenRouterClient(): OpenRouter {
  if (!clientInstance) {
    const apiKey = env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is not set');
    }

    clientInstance = new OpenRouter({
      apiKey
    });
  }

  return clientInstance;
}

/**
 * Default LLM model for text processing
 * Per spec: Claude Opus 4.5 via OpenRouter (configurable via LLM_MODEL env var)
 */
export const DEFAULT_LLM_MODEL = 'anthropic/claude-opus-4.5';

/**
 * Get the configured LLM model (from env or default)
 */
export function getLLMModel(): string {
  return env.LLM_MODEL || DEFAULT_LLM_MODEL;
}

/**
 * Site info for OpenRouter analytics
 */
export const SITE_INFO = {
  referer: env.BASE_URL || 'http://localhost:5173',
  title: 'Stickerize'
};
