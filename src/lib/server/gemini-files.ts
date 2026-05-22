/**
 * Gemini File API module for caching character images
 * Uploads images once and reuses the file IDs for subsequent generations
 */

import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';
import { db } from './db';
import { characters } from './db/schema';
import { eq } from 'drizzle-orm';

// Files typically expire after 48 hours, but we'll be conservative and refresh after 24 hours
const FILE_EXPIRY_BUFFER_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface GeminiFileRef {
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

/**
 * Get or upload a character's image to Gemini File API
 * Returns the file URI for use in generation requests
 *
 * @param characterId - The character ID
 * @param imagePath - Local path to the character's sticker image
 * @returns File reference with URI and MIME type
 */
export async function getOrUploadCharacterFile(
  characterId: string,
  imagePath: string
): Promise<GeminiFileRef> {
  // Check if we have a valid cached file ID
  const characterResults = await db.select({
    geminiFileId: characters.geminiFileId,
    geminiFileExpiry: characters.geminiFileExpiry
  })
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);

  const character = characterResults[0];

  if (character?.geminiFileId && character?.geminiFileExpiry) {
    const expiryTime = character.geminiFileExpiry.getTime();
    const now = Date.now();

    // Check if file is still valid (not expired)
    if (expiryTime > now) {
      console.log(`[Gemini Files] Using cached file for character ${characterId}`);
      return {
        uri: character.geminiFileId,
        mimeType: 'image/png'
      };
    }

    console.log(`[Gemini Files] Cached file expired for character ${characterId}, re-uploading...`);
  }

  // Upload the file
  return await uploadAndCacheCharacterFile(characterId, imagePath);
}

/**
 * Upload a character image to Gemini and cache the file ID
 */
async function uploadAndCacheCharacterFile(
  characterId: string,
  imagePath: string
): Promise<GeminiFileRef> {
  const ai = new GoogleGenAI({ apiKey: getGoogleApiKey() });

  console.log(`[Gemini Files] Uploading file for character ${characterId}: ${imagePath}`);

  try {
    const uploadResult = await ai.files.upload({
      file: imagePath,
      config: { mimeType: 'image/png' }
    });

    if (!uploadResult.uri) {
      throw new Error('Upload succeeded but no URI returned');
    }

    // Calculate expiry time (now + 24 hours buffer)
    const expiryTime = new Date(Date.now() + FILE_EXPIRY_BUFFER_MS);

    // Cache the file ID in the database
    await db.update(characters)
      .set({
        geminiFileId: uploadResult.uri,
        geminiFileExpiry: expiryTime
      })
      .where(eq(characters.id, characterId));

    console.log(`[Gemini Files] Cached file URI for character ${characterId}, expires at ${expiryTime.toISOString()}`);

    return {
      uri: uploadResult.uri,
      mimeType: uploadResult.mimeType || 'image/png'
    };
  } catch (error) {
    console.error(`[Gemini Files] Failed to upload file for character ${characterId}:`, error);
    throw error;
  }
}

/**
 * Clear cached file ID for a character (e.g., after regeneration)
 */
export async function clearCharacterFileCache(characterId: string): Promise<void> {
  await db.update(characters)
    .set({
      geminiFileId: null,
      geminiFileExpiry: null
    })
    .where(eq(characters.id, characterId));

  console.log(`[Gemini Files] Cleared cache for character ${characterId}`);
}
