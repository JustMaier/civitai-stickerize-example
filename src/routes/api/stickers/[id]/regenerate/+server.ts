import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { stickers } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { canCreateJob, createStickerJob } from '$lib/server/job-processor';
import { parseCharacterIds } from '$lib/server/utils';

/**
 * POST /api/stickers/:id/regenerate
 * Create a NEW sticker with the same prompt as the original
 * Does not replace the original - creates a new sticker
 */
export const POST: RequestHandler = async ({ params, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    if (!id) {
      return json({ error: 'Sticker ID is required' }, { status: 400 });
    }

    // Fetch the original sticker
    const originalResults = await db.select({
      prompt: stickers.prompt,
      characterIds: stickers.characterIds
    })
      .from(stickers)
      .where(and(
        eq(stickers.id, id),
        eq(stickers.userId, user.id)
      ))
      .limit(1);

    if (originalResults.length === 0) {
      return json({ error: 'Sticker not found' }, { status: 404 });
    }

    const original = originalResults[0];
    const characterIds: string[] = parseCharacterIds(original.characterIds);

    // Check concurrent job limit
    const canCreate = await canCreateJob(user.id);
    if (!canCreate) {
      return json({
        error: 'You have too many pending generations (max 8). Please wait for some to complete.'
      }, { status: 429 });
    }

    // Create new job with the same prompt and characters
    const jobId = await createStickerJob(user.id, original.prompt, characterIds);

    return json({ jobId }, { status: 202 });
  } catch (error) {
    console.error('Sticker regeneration error:', error);
    return json({ error: 'Something went wrong' }, { status: 500 });
  }
};
