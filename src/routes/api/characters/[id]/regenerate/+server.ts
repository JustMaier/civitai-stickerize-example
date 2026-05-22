import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { characters, generationJobs } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { canCreateJob } from '$lib/server/job-processor';
import { TEMP_DIR } from '$lib/server/storage';

/**
 * POST /api/characters/:id/regenerate
 * Regenerate a character's sticker image (replaces original)
 */
export const POST: RequestHandler = async ({ params, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    if (!id) {
      return json({ error: 'Character ID is required' }, { status: 400 });
    }

    // Verify ownership
    const characterResults = await db.select({
      id: characters.id,
      name: characters.name,
      additionalDetails: characters.additionalDetails,
      stickerImageUrl: characters.stickerImageUrl
    })
      .from(characters)
      .where(and(
        eq(characters.id, id),
        eq(characters.userId, user.id)
      ))
      .limit(1);

    if (characterResults.length === 0) {
      return json({ error: 'Character not found' }, { status: 404 });
    }

    const character = characterResults[0];

    // Check concurrent job limit
    const canCreate = await canCreateJob(user.id);
    if (!canCreate) {
      return json({
        error: 'You have too many pending generations (max 8). Please wait for some to complete.'
      }, { status: 429 });
    }

    // For regeneration, we need to use the existing character image as reference
    // since the original photo was deleted after initial generation
    // stickerImageUrl is now the actual storage path
    if (!existsSync(character.stickerImageUrl)) {
      return json({ error: 'Character image not found. Cannot regenerate.' }, { status: 400 });
    }

    // Copy character image to temp for processing
    if (!existsSync(TEMP_DIR)) {
      mkdirSync(TEMP_DIR, { recursive: true });
    }

    const tempFileName = `${randomUUID()}.png`;
    const tempFilePath = join(TEMP_DIR, tempFileName);

    // Copy the existing character image to temp
    const imageData = readFileSync(character.stickerImageUrl);
    writeFileSync(tempFilePath, imageData);

    // Create regeneration job
    // The job type is 'character' but we mark it as a regeneration
    // by storing the existing character ID in the job
    const jobId = randomUUID();

    // Store character metadata as JSON (same format as createCharacterJob)
    const metadata = JSON.stringify({
      name: character.name,
      additionalDetails: character.additionalDetails || undefined
    });

    await db.insert(generationJobs).values({
      id: jobId,
      userId: user.id,
      type: 'character',
      status: 'queued',
      userPrompt: tempFilePath, // Path to temp copy of current image
      refinedPrompt: metadata, // Preserve character metadata
      resultId: id // Store existing character ID to indicate regeneration
    });

    // Import and call processJob to start background processing
    const { processJob } = await import('$lib/server/job-processor');
    processJob(jobId).catch(console.error);

    return json({ jobId }, { status: 202 });
  } catch (error) {
    console.error('Character regeneration error:', error);
    return json({ error: 'Something went wrong' }, { status: 500 });
  }
};
