import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { characters } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createCharacterJob, canCreateJob } from '$lib/server/job-processor';
import { processUploadedImage } from '$lib/server/image-conversion';
import { storagePathToApiUrl } from '$lib/server/image-optimization';
import { TEMP_DIR } from '$lib/server/storage';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_NAME_LENGTH = 30;
const MAX_ADDITIONAL_DETAILS_LENGTH = 100;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/heic', 'image/heif'];

/**
 * POST /api/characters
 * Create a new character from an uploaded photo
 * Accepts multipart form data with 'photo' (file) and 'name' (string)
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse multipart form data
    const formData = await request.formData();
    const photo = formData.get('photo') as File | null;
    const name = formData.get('name') as string | null;
    const additionalDetails = formData.get('additionalDetails') as string | null;

    // Validate photo presence
    if (!photo) {
      return json({ error: 'Photo is required' }, { status: 400 });
    }

    // Validate MIME type (JPEG and HEIC supported)
    if (!ALLOWED_MIME_TYPES.includes(photo.type)) {
      return json({ error: 'Please upload a JPEG or HEIC image.' }, { status: 400 });
    }

    // Validate file size
    if (photo.size > MAX_FILE_SIZE) {
      return json({ error: 'Photo is too large (max 10MB). Please choose a smaller file.' }, { status: 400 });
    }

    // Validate name (optional, defaults to 'New Character')
    const characterName = name?.trim() || 'New Character';
    if (characterName.length > MAX_NAME_LENGTH) {
      return json({ error: `Name must be ${MAX_NAME_LENGTH} characters or less` }, { status: 400 });
    }

    // Validate additional details (optional)
    const trimmedDetails = additionalDetails?.trim() || '';
    if (trimmedDetails.length > MAX_ADDITIONAL_DETAILS_LENGTH) {
      return json({ error: `Additional details must be ${MAX_ADDITIONAL_DETAILS_LENGTH} characters or less` }, { status: 400 });
    }

    // Check concurrent job limit
    const canCreate = await canCreateJob(user.id);
    if (!canCreate) {
      return json({
        error: 'You have too many pending generations (max 8). Please wait for some to complete.'
      }, { status: 429 });
    }

    // Save photo to temp directory
    if (!existsSync(TEMP_DIR)) {
      mkdirSync(TEMP_DIR, { recursive: true });
    }

    const tempFileName = `${randomUUID()}.jpg`;
    const tempFilePath = join(TEMP_DIR, tempFileName);

    const arrayBuffer = await photo.arrayBuffer();
    writeFileSync(tempFilePath, Buffer.from(arrayBuffer));

    // Process the image (converts HEIC to JPEG if needed)
    const processedPath = await processUploadedImage(tempFilePath);

    // Create generation job with character name and optional additional details
    const jobId = await createCharacterJob(user.id, processedPath, characterName, trimmedDetails || undefined);

    return json({ jobId }, { status: 202 });
  } catch (error) {
    console.error('Character creation error:', error);
    return json({ error: 'Something went wrong' }, { status: 500 });
  }
};

/**
 * GET /api/characters
 * List all characters for the authenticated user
 */
export const GET: RequestHandler = async ({ locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userCharacters = await db.select({
      id: characters.id,
      name: characters.name,
      stickerImageUrl: characters.stickerImageUrl,
      createdAt: characters.createdAt
    })
      .from(characters)
      .where(eq(characters.userId, user.id))
      .orderBy(characters.createdAt);

    // Convert storage paths to API URLs for the frontend
    const charactersWithUrls = userCharacters.map(c => ({
      ...c,
      stickerImageUrl: storagePathToApiUrl(c.stickerImageUrl)
    }));

    return json({ characters: charactersWithUrls });
  } catch (error) {
    console.error('Character listing error:', error);
    return json({ error: 'Something went wrong' }, { status: 500 });
  }
};
