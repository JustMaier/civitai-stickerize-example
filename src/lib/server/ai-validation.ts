/**
 * AI Validation Module
 *
 * Handles AI-powered validation and processing using OpenRouter SDK.
 * - Photo validation for character creation
 * - Prompt processing and enhancement for sticker generation
 */

import { loadPrompt, fillPrompt } from './prompts/loader';
import { getOpenRouterClient, getLLMModel } from './openrouter';
import { encodeFileToBase64 } from './ffmpeg';
import type { Usage } from '@openrouter/sdk/models/usage';
import type { OpenResponsesResult } from '@openrouter/sdk/models/openresponsesresult';

// ============================================================================
// Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  error?: string;
  costCents?: number;
}

export interface PromptProcessingResult {
  valid: boolean;
  refinedPrompt?: string;
  characterIds?: string[];
  chromaKeyColor?: string;
  error?: string;
  costCents?: number;
}

// ============================================================================
// Helpers
// ============================================================================

async function loadImageAsBase64(imagePath: string): Promise<{ data: string; mimeType: string }> {
  const result = await encodeFileToBase64(imagePath);
  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to encode image');
  }
  return { data: result.data, mimeType: result.mimeType || 'image/jpeg' };
}

/**
 * Parse JSON from AI response text
 * Handles responses that may have markdown code blocks or extra text
 */
function parseJsonFromResponse(content: string): unknown {
  // Try to find JSON object in the response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Invalid AI response format - no JSON found');
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('Invalid AI response format - JSON parsing failed');
  }
}

/**
 * Calculate cost in cents from OpenRouter usage
 * OpenRouter provides cost in dollars, we convert to cents
 */
function calculateCostCents(usage: Usage | null | undefined): number {
  if (!usage?.cost) return 0;
  // OpenRouter returns cost in dollars, convert to cents and round up
  return Math.ceil(usage.cost * 100);
}

/**
 * Extract output text from OpenRouter SDK response
 * The SDK v0.5.1 has a bug where outputText is empty, so we need to extract manually
 * from the response.output structure
 */
function extractOutputText(response: OpenResponsesResult): string {
  // Try outputText first (in case SDK is fixed)
  if (response.outputText) {
    return response.outputText;
  }

  // Extract from output array (workaround for SDK bug)
  // Only 'message' type items have content with text
  for (const item of response.output) {
    if (item.type === 'message' && 'content' in item) {
      const textContent = item.content.find(c => c.type === 'output_text');
      if (textContent && 'text' in textContent) {
        return textContent.text;
      }
    }
  }

  return '';
}

// ============================================================================
// Photo Validation
// ============================================================================

/**
 * Validate uploaded photo for character creation
 * Uses AI to check for exactly one person with a clearly visible face
 *
 * @param imagePath - Path to the uploaded image file
 * @returns Validation result with error message if invalid
 */
export async function validatePhoto(imagePath: string): Promise<ValidationResult> {
  try {
    const client = getOpenRouterClient();
    const model = getLLMModel();
    const { data, mimeType } = await loadImageAsBase64(imagePath);

    // Load prompt from markdown file
    const promptText = loadPrompt('photo-validation.md');

    // Use SDK callModel with multimodal input
    const result = client.callModel({
      model,
      input: [
        {
          role: 'user' as const,
          content: [
            {
              type: 'input_image' as const,
              detail: 'auto' as const,
              imageUrl: `data:${mimeType};base64,${data}`
            },
            {
              type: 'input_text' as const,
              text: promptText
            }
          ]
        }
      ],
      maxOutputTokens: 256
    });

    // Get the full response to access usage data
    const response = await result.getResponse();
    const text = extractOutputText(response);

    if (!text) {
      throw new Error('No response from AI');
    }

    // Parse the JSON response
    const analysis = parseJsonFromResponse(text) as {
      hasPrimarySubject: boolean;
      faceVisible: boolean;
      issue?: string | null;
    };

    // Calculate cost from usage
    const costCents = calculateCostCents(response.usage);

    // Validate based on analysis
    if (!analysis.hasPrimarySubject) {
      return {
        valid: false,
        error: analysis.issue || "We couldn't identify a clear subject. Please upload a photo with one person as the focus.",
        costCents
      };
    }

    if (!analysis.faceVisible) {
      return {
        valid: false,
        error: analysis.issue || "We can't clearly see the person's face. Please upload a photo with better lighting or angle.",
        costCents
      };
    }

    return { valid: true, costCents };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Photo validation error:', message);
    return {
      valid: false,
      error: 'Failed to validate photo. Please try again.'
    };
  }
}

// ============================================================================
// Prompt Processing
// ============================================================================

/**
 * Process and validate prompt for meme generation
 * Uses AI to validate content, identify characters, enhance prompt, and select chroma key
 *
 * @param userPrompt - The user's original prompt text
 * @param characters - Available characters with their IDs and names
 * @returns Processed result with refined prompt, character IDs, and chroma key color
 */
export async function processPrompt(
  userPrompt: string,
  characters: Array<{ id: string; name: string }>
): Promise<PromptProcessingResult> {
  try {
    const client = getOpenRouterClient();
    const model = getLLMModel();
    const characterList = characters.map(c => `- ${c.name} (ID: ${c.id})`).join('\n');

    // Load and fill prompt template from markdown file
    const template = loadPrompt('prompt-enhancement.md');
    const promptText = fillPrompt(template, {
      characterList,
      userPrompt
    });

    // Use SDK callModel
    const result = client.callModel({
      model,
      input: promptText,
      maxOutputTokens: 512
    });

    // Get the full response to access usage data
    const response = await result.getResponse();
    const text = extractOutputText(response);

    if (!text) {
      throw new Error('No response from AI');
    }

    // Parse the JSON response
    const analysis = parseJsonFromResponse(text) as {
      valid: boolean;
      error?: string;
      refinedPrompt?: string;
      characterIds?: string[];
      chromaKeyColor?: string;
    };

    // Calculate cost from usage
    const costCents = calculateCostCents(response.usage);

    if (!analysis.valid) {
      return {
        valid: false,
        error: analysis.error || 'Prompt could not be processed',
        costCents
      };
    }

    // Validate and default chromaKeyColor
    const validColors = ['#00FF00', '#0000FF', '#FF00FF'];
    const chromaKeyColor = validColors.includes(analysis.chromaKeyColor || '')
      ? analysis.chromaKeyColor
      : '#00FF00';

    return {
      valid: true,
      refinedPrompt: analysis.refinedPrompt,
      characterIds: analysis.characterIds,
      chromaKeyColor,
      costCents
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Prompt processing error:', message);
    return {
      valid: false,
      error: 'Failed to process prompt. Please try again.'
    };
  }
}
