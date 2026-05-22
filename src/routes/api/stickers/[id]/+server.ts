import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { stickers } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseCharacterIds } from '$lib/server/utils';
import { existsSync, unlinkSync } from 'fs';
import { storagePathToApiUrl } from '$lib/server/image-optimization';

/**
 * GET /api/stickers/:id
 * Get a single sticker by ID
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    if (!id) {
      return json({ error: 'Sticker ID is required' }, { status: 400 });
    }

    const result = await db.select({
      id: stickers.id,
      prompt: stickers.prompt,
      imageUrl: stickers.imageUrl,
      characterIds: stickers.characterIds,
      costCents: stickers.costCents,
      createdAt: stickers.createdAt
    })
      .from(stickers)
      .where(and(
        eq(stickers.id, id),
        eq(stickers.userId, user.id)
      ))
      .limit(1);

    if (result.length === 0) {
      return json({ error: 'Sticker not found' }, { status: 404 });
    }

    // Parse characterIds JSON and convert storage path to API URL
    const sticker = {
      ...result[0],
      imageUrl: storagePathToApiUrl(result[0].imageUrl),
      characterIds: parseCharacterIds(result[0].characterIds)
    };

    return json({ sticker });
  } catch (error) {
    console.error('Sticker fetch error:', error);
    return json({ error: 'Something went wrong' }, { status: 500 });
  }
};

/**
 * DELETE /api/stickers/:id
 * Delete a sticker and clean up the image file
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    if (!id) {
      return json({ error: 'Sticker ID is required' }, { status: 400 });
    }

    // Verify ownership and get storage path
    const stickerResults = await db.select({
      id: stickers.id,
      imageUrl: stickers.imageUrl
    })
      .from(stickers)
      .where(and(
        eq(stickers.id, id),
        eq(stickers.userId, user.id)
      ))
      .limit(1);

    if (stickerResults.length === 0) {
      return json({ error: 'Sticker not found' }, { status: 404 });
    }

    const sticker = stickerResults[0];

    // Delete image file (imageUrl is the storage path)
    if (existsSync(sticker.imageUrl)) {
      unlinkSync(sticker.imageUrl);
    }

    // Delete database record
    await db.delete(stickers)
      .where(and(
        eq(stickers.id, id),
        eq(stickers.userId, user.id)
      ));

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('Sticker deletion error:', error);
    return json({ error: 'Something went wrong' }, { status: 500 });
  }
};
