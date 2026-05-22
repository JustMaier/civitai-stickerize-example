import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { users, characters } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { createStickerJob } from '$lib/server/job-processor';
import { getPrompt } from '$lib/server/prompts/loader';

/**
 * POST /api/welcome-sticker
 * Generate a welcome sticker for first-time users
 *
 * This endpoint:
 * - Checks if the user has already received a welcome sticker
 * - Validates the character belongs to the user
 * - Creates the sticker job with a server-defined prompt
 * - Marks the user as having received their welcome sticker
 *
 * Body: { characterId: string }
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has already received a welcome sticker
    const [currentUser] = await db.select({ hasReceivedWelcomeSticker: users.hasReceivedWelcomeSticker })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (currentUser?.hasReceivedWelcomeSticker) {
      return json({ error: 'Welcome sticker already received' }, { status: 409 });
    }

    // Parse and validate request body
    const body = await request.json();
    const { characterId } = body;

    if (!characterId || typeof characterId !== 'string') {
      return json({ error: 'Character ID is required' }, { status: 400 });
    }

    // Validate UUID format
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(characterId)) {
      return json({ error: 'Invalid character ID format' }, { status: 400 });
    }

    // Verify the character exists and belongs to the user
    const [character] = await db.select({ id: characters.id, name: characters.name })
      .from(characters)
      .where(and(
        eq(characters.id, characterId),
        eq(characters.userId, user.id)
      ))
      .limit(1);

    if (!character) {
      return json({ error: 'Character not found' }, { status: 404 });
    }

    // Mark user as having received welcome sticker BEFORE creating the job
    // This prevents race conditions if they spam the endpoint
    await db.update(users)
      .set({ hasReceivedWelcomeSticker: true })
      .where(eq(users.id, user.id));

    // Build the welcome prompt from the template
    const welcomePrompt = getPrompt('welcome-sticker.md', {
      characterName: character.name
    });

    // Create the sticker job
    const jobId = await createStickerJob(user.id, welcomePrompt, [characterId]);

    return json({ jobId }, { status: 202 });
  } catch (error) {
    console.error('Welcome sticker creation error:', error);
    return json({ error: 'Something went wrong' }, { status: 500 });
  }
};
