import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { stickers, characters } from '$lib/server/db/schema';
import { eq, and, desc, lt, inArray } from 'drizzle-orm';
import { canCreateJob, createStickerJob } from '$lib/server/job-processor';
import { parseCharacterIds } from '$lib/server/utils';
import { storagePathToApiUrl } from '$lib/server/image-optimization';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * POST /api/stickers
 * Create a new sticker generation job
 * Accepts JSON body: { prompt: string, characterIds: string[] }
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse JSON body
    const body = await request.json();
    const { prompt, characterIds } = body;

    // Validate prompt
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return json({ error: 'Prompt is required' }, { status: 400 });
    }

    // Validate characterIds
    if (!Array.isArray(characterIds) || characterIds.length === 0) {
      return json({ error: 'At least one character is required' }, { status: 400 });
    }

    // Validate all characterIds are strings
    if (!characterIds.every((id) => typeof id === 'string')) {
      return json({ error: 'Invalid character IDs' }, { status: 400 });
    }

    // Add UUID validation
    if (characterIds.length > 10) {
      return json({ error: 'Too many characters (max 10)' }, { status: 400 });
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!characterIds.every((id) => UUID_REGEX.test(id))) {
      return json({ error: 'Invalid character ID format' }, { status: 400 });
    }

    // Check concurrent job limit
    const canCreate = await canCreateJob(user.id);
    if (!canCreate) {
      return json({
        error: 'You have too many pending generations (max 8). Please wait for some to complete.'
      }, { status: 429 });
    }

    // Verify the characters belong to the user
    const userCharacters = await db.select({
      id: characters.id,
      name: characters.name
    })
      .from(characters)
      .where(and(
        eq(characters.userId, user.id),
        inArray(characters.id, characterIds)
      ));

    if (userCharacters.length === 0) {
      return json({ error: 'No valid characters found' }, { status: 400 });
    }

    // Check if any requested characters were not found
    const foundIds = new Set(userCharacters.map(c => c.id));
    const missingIds = characterIds.filter(id => !foundIds.has(id));
    if (missingIds.length > 0) {
      return json({ error: 'Some characters were not found' }, { status: 400 });
    }

    // Create the sticker generation job immediately
    // AI validation and prompt enhancement happen during job processing
    // This ensures costs are tracked even for rejected prompts
    const jobId = await createStickerJob(
      user.id,
      prompt.trim(),
      characterIds
    );

    return json({ jobId }, { status: 202 });
  } catch (error) {
    console.error('Sticker creation error:', error);
    return json({ error: 'Something went wrong' }, { status: 500 });
  }
};

/**
 * GET /api/stickers
 * List user's stickers with pagination
 * Query params: limit (default 20, max 50), cursor (last sticker ID for pagination)
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse pagination params
    const limitParam = url.searchParams.get('limit');
    let limit = limitParam ? parseInt(limitParam, 10) : DEFAULT_LIMIT;
    if (isNaN(limit) || limit < 1) {
      limit = DEFAULT_LIMIT;
    }
    if (limit > MAX_LIMIT) {
      limit = MAX_LIMIT;
    }

    const cursor = url.searchParams.get('cursor');

    // Build query conditions
    const conditions = [eq(stickers.userId, user.id)];

    // If cursor provided, get the sticker to find its createdAt for pagination
    if (cursor) {
      const cursorSticker = await db.select({ createdAt: stickers.createdAt })
        .from(stickers)
        .where(and(
          eq(stickers.id, cursor),
          eq(stickers.userId, user.id)
        ))
        .limit(1);

      if (cursorSticker.length > 0) {
        conditions.push(lt(stickers.createdAt, cursorSticker[0].createdAt));
      }
    }

    // Fetch stickers
    const userStickers = await db.select({
      id: stickers.id,
      prompt: stickers.prompt,
      imageUrl: stickers.imageUrl,
      characterIds: stickers.characterIds,
      costCents: stickers.costCents,
      createdAt: stickers.createdAt
    })
      .from(stickers)
      .where(and(...conditions))
      .orderBy(desc(stickers.createdAt))
      .limit(limit + 1); // Fetch one extra to determine if there are more

    // Check if there are more results
    const hasMore = userStickers.length > limit;
    const resultStickers = hasMore ? userStickers.slice(0, limit) : userStickers;

    // Get the next cursor
    const nextCursor = hasMore && resultStickers.length > 0
      ? resultStickers[resultStickers.length - 1].id
      : null;

    // Parse characterIds JSON and convert storage paths to API URLs
    const stickersWithParsedIds = resultStickers.map(s => ({
      ...s,
      imageUrl: storagePathToApiUrl(s.imageUrl),
      characterIds: parseCharacterIds(s.characterIds)
    }));

    return json({
      stickers: stickersWithParsedIds,
      nextCursor
    });
  } catch (error) {
    console.error('Sticker listing error:', error);
    return json({ error: 'Something went wrong' }, { status: 500 });
  }
};
