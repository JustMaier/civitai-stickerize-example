import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { characters, stickers } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { existsSync, unlinkSync } from 'fs';
import { storagePathToApiUrl } from '$lib/server/image-optimization';

const MAX_NAME_LENGTH = 30;

/**
 * GET /api/characters/:id
 * Get a single character by ID
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    if (!id) {
      return json({ error: 'Character ID is required' }, { status: 400 });
    }

    const result = await db.select({
      id: characters.id,
      name: characters.name,
      stickerImageUrl: characters.stickerImageUrl,
      createdAt: characters.createdAt
    })
      .from(characters)
      .where(and(
        eq(characters.id, id),
        eq(characters.userId, user.id)
      ))
      .limit(1);

    if (result.length === 0) {
      return json({ error: 'Character not found' }, { status: 404 });
    }

    // Convert storage path to API URL for the frontend
    return json({
      character: {
        ...result[0],
        stickerImageUrl: storagePathToApiUrl(result[0].stickerImageUrl)
      }
    });
  } catch (error) {
    console.error('Character fetch error:', error);
    return json({ error: 'Something went wrong' }, { status: 500 });
  }
};

/**
 * PATCH /api/characters/:id
 * Update character name
 */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    if (!id) {
      return json({ error: 'Character ID is required' }, { status: 400 });
    }

    // Parse request body
    const body = await request.json();
    const { name } = body;

    if (typeof name !== 'string') {
      return json({ error: 'Name is required' }, { status: 400 });
    }

    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      return json({ error: 'Name cannot be empty' }, { status: 400 });
    }

    if (trimmedName.length > MAX_NAME_LENGTH) {
      return json({ error: `Name must be ${MAX_NAME_LENGTH} characters or less` }, { status: 400 });
    }

    // Verify ownership and update
    const result = await db.update(characters)
      .set({ name: trimmedName })
      .where(and(
        eq(characters.id, id),
        eq(characters.userId, user.id)
      ))
      .returning({ id: characters.id });

    if (result.length === 0) {
      return json({ error: 'Character not found' }, { status: 404 });
    }

    return json({ success: true });
  } catch (error) {
    console.error('Character update error:', error);
    return json({ error: 'Something went wrong' }, { status: 500 });
  }
};

/**
 * DELETE /api/characters/:id
 * Delete a character and clean up related data
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    if (!id) {
      return json({ error: 'Character ID is required' }, { status: 400 });
    }

    // Verify ownership and get image URL
    const characterResults = await db.select({
      id: characters.id,
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

    // Remove characterId from any stickers that reference it
    // Stickers store characterIds as JSON array, so we need to handle this specially
    const userStickers = await db.select({
      id: stickers.id,
      characterIds: stickers.characterIds
    })
      .from(stickers)
      .where(eq(stickers.userId, user.id));

    for (const sticker of userStickers) {
      const charIds: string[] = JSON.parse(sticker.characterIds);
      if (charIds.includes(id)) {
        const updatedIds = charIds.filter(cid => cid !== id);
        await db.update(stickers)
          .set({ characterIds: JSON.stringify(updatedIds) })
          .where(eq(stickers.id, sticker.id));
      }
    }

    // Delete image file (stickerImageUrl is the storage path)
    if (existsSync(character.stickerImageUrl)) {
      unlinkSync(character.stickerImageUrl);
    }

    // Delete database record
    await db.delete(characters)
      .where(and(
        eq(characters.id, id),
        eq(characters.userId, user.id)
      ));

    return json({ success: true });
  } catch (error) {
    console.error('Character deletion error:', error);
    return json({ error: 'Something went wrong' }, { status: 500 });
  }
};
