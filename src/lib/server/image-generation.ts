import { GoogleGenAI, createPartFromUri } from '@google/genai';
import { env } from '$env/dynamic/private';
import { existsSync } from 'fs';
import { encodeFileToBase64 } from './ffmpeg';

const MODEL = 'gemini-3.1-flash-image-preview';

export interface GenerationResult {
  success: boolean;
  imageData?: string; // Base64 encoded image
  mimeType?: string;
  textResponse?: string;
  error?: string;
  /**
   * Optional provider-specific failure code. Lets the job processor branch on
   * known non-retryable conditions (e.g. `'insufficient_buzz'`).
   */
  code?: string;
  /** Actual Buzz cost from Civitai. Undefined for the Gemini fallback path. */
  buzzCost?: number;
}

export interface GenerationConfig {
  aspectRatio?: string;
  imageSize?: string;
}

/**
 * Reference image can be either:
 * - A local file path (string starting with ./ or /)
 * - A Gemini File API URI (string starting with https:// or files/)
 */
export interface FileRef {
  uri: string;
  mimeType: string;
}

function getGoogleApiKey(): string {
  const key = env.GOOGLE_AI_API_KEY;
  if (!key) {
    throw new Error('GOOGLE_AI_API_KEY environment variable is not set');
  }
  return key;
}

async function loadImageAsBase64(imagePath: string): Promise<{ data: string; mimeType: string }> {
  const result = await encodeFileToBase64(imagePath);
  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to encode image');
  }
  return { data: result.data, mimeType: result.mimeType || 'image/png' };
}

/**
 * Generate an image using Gemini
 *
 * @param prompt - Text prompt for image generation
 * @param referenceImages - Array of either:
 *   - File paths (strings starting with ./ or /)
 *   - FileRef objects with uri and mimeType (for Gemini File API references)
 * @param config - Generation configuration
 */
export async function generateImage(
  prompt: string,
  referenceImages: (string | FileRef)[] = [],
  config: GenerationConfig = {}
): Promise<GenerationResult> {
  try {
    const ai = new GoogleGenAI({ apiKey: getGoogleApiKey() });
    const parts: any[] = [];

    // Add reference images FIRST - the prompt refers to "first image", "second image"
    // so images must precede the text for correct reference
    console.log(`[Image Gen] Processing ${referenceImages.length} reference images`);

    for (let i = 0; i < referenceImages.length; i++) {
      const imgRef = referenceImages[i];
      if (typeof imgRef === 'string') {
        // It's a file path - load inline
        console.log(`[Image Gen] Image ${i + 1}: path="${imgRef}", exists=${existsSync(imgRef)}`);
        if (!existsSync(imgRef)) {
          console.warn(`[Image Gen] Reference image not found: ${imgRef}`);
          continue;
        }
        const { data, mimeType } = await loadImageAsBase64(imgRef);
        console.log(`[Image Gen] Image ${i + 1} loaded: mimeType=${mimeType}, size=${Math.round(data.length / 1024)}KB base64`);
        parts.push({
          inlineData: {
            mimeType,
            data
          }
        });
      } else {
        // It's a FileRef from Gemini File API - use the URI
        console.log(`[Image Gen] Image ${i + 1}: FileRef uri=${imgRef.uri}`);
        parts.push(createPartFromUri(imgRef.uri, imgRef.mimeType));
      }
    }

    // Add text prompt AFTER images - this way "first image" and "second image" references are clear
    parts.push({ text: prompt });

    console.log(`[Image Gen] Total parts: ${parts.length} (${parts.length - 1} images + 1 text)`);

    // Build config
    const generationConfig: any = {
      responseModalities: ['TEXT', 'IMAGE']
    };

    // Add image config if provided
    const { aspectRatio = '1:1', imageSize = '2K' } = config;
    generationConfig.imageConfig = { aspectRatio, imageSize };

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ parts }],
      config: generationConfig
    });

    // Extract image result
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.thought) continue; // Skip thought parts

        if (part.inlineData) {
          return {
            success: true,
            imageData: part.inlineData.data,
            mimeType: part.inlineData.mimeType
          };
        }
      }
    }

    return { success: false, error: 'No image generated' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Image generation error:', message);
    return { success: false, error: message };
  }
}
