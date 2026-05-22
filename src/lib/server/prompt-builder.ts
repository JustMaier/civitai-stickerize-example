import { loadPrompt, fillPrompt } from './prompts/loader';

/**
 * Sanitize user input to prevent prompt injection
 */
function sanitizeForPrompt(input: string): string {
  return input
    // Remove instruction-like patterns
    .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+instructions?/gi, '')
    .replace(/system\s*:/gi, '')
    .replace(/assistant\s*:/gi, '')
    .replace(/human\s*:/gi, '')
    .replace(/user\s*:/gi, '')
    // Remove potential prompt delimiters
    .replace(/```/g, '')
    .replace(/---/g, '')
    // Remove quotes to prevent string breakout in templates
    .replace(/["']/g, '')
    // Limit length
    .slice(0, 1000)
    .trim();
}

export interface CharacterPromptConfig {
  styleReferencePath: string; // Path to style exemplar image
  userPhotoPath: string; // Path to user's uploaded photo
  additionalDetails?: string; // Optional appearance details from user
}

export interface StickerPromptConfig {
  characterName: string;
  characterImagePath: string;
  userDescription: string;
  speechBubble?: string;
  chromaKeyColor: string; // AI-selected chroma key color
}

export interface BuiltPrompt {
  prompt: string;
  referenceImages: string[];
  chromaKeyColor: string;
}

/**
 * Build prompt for character creation
 * Uses a style reference + user photo to generate a character in the same style
 */
export function buildCharacterPrompt(config: CharacterPromptConfig): BuiltPrompt {
  const { styleReferencePath, userPhotoPath, additionalDetails } = config;

  let prompt = loadPrompt('character-generation.md');

  // Append additional details if provided
  if (additionalDetails) {
    prompt += `\n\n## Additional Details\n\nThe user has provided additional appearance details to consider: ${sanitizeForPrompt(additionalDetails)}`;
  }

  return {
    prompt,
    referenceImages: [styleReferencePath, userPhotoPath],
    chromaKeyColor: '#00FF00'
  };
}

/**
 * Build prompt for meme sticker generation
 * Uses the character reference + user description to create a scene
 * chromaKeyColor is AI-selected based on scene content
 */
export function buildStickerPrompt(config: StickerPromptConfig): BuiltPrompt {
  const { characterName, characterImagePath, userDescription, speechBubble, chromaKeyColor } = config;

  // Map hex color to color name for prompt
  const colorName = getColorName(chromaKeyColor);

  const template = loadPrompt('sticker-generation.md');
  const prompt = fillPrompt(template, {
    characterName: sanitizeForPrompt(characterName),
    userDescription: sanitizeForPrompt(userDescription),
    speechBubble: speechBubble ? ` Include a speech bubble saying "${sanitizeForPrompt(speechBubble)}".` : '',
    colorName,
    chromaKeyColor
  });

  return {
    prompt,
    referenceImages: [characterImagePath],
    chromaKeyColor
  };
}

/**
 * Map hex color to human-readable color name for prompts
 */
function getColorName(hexColor: string): string {
  const colorMap: Record<string, string> = {
    '#00FF00': 'green',
    '#0000FF': 'blue',
    '#FF00FF': 'magenta'
  };
  return colorMap[hexColor.toUpperCase()] || 'green';
}

/**
 * Build prompt for multi-character sticker
 * Handles multiple characters in the same scene
 * chromaKeyColor is AI-selected based on scene content
 */
export function buildMultiCharacterStickerPrompt(
  characters: Array<{ name: string; imagePath: string }>,
  userDescription: string,
  speechBubbles?: Record<string, string>,
  chromaKeyColor: string = '#00FF00'
): BuiltPrompt {
  const colorName = getColorName(chromaKeyColor);

  const characterList = characters.map((c, i) => `${sanitizeForPrompt(c.name)} (reference image ${i + 1})`).join(', ');

  let speechBubblesText = '';
  if (speechBubbles) {
    const bubbleDescriptions = Object.entries(speechBubbles)
      .map(([name, text]) => `${sanitizeForPrompt(name)} says "${sanitizeForPrompt(text)}"`)
      .join('. ');
    if (bubbleDescriptions) {
      speechBubblesText = ` ${bubbleDescriptions}.`;
    }
  }

  const template = loadPrompt('multi-character-sticker.md');
  const prompt = fillPrompt(template, {
    characterList,
    userDescription: sanitizeForPrompt(userDescription),
    speechBubbles: speechBubblesText,
    colorName,
    chromaKeyColor
  });

  return {
    prompt,
    referenceImages: characters.map(c => c.imagePath),
    chromaKeyColor
  };
}
