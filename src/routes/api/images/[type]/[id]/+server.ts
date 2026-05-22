import type { RequestHandler } from './$types';
import { existsSync, readFileSync } from 'fs';
import { resolve, relative, isAbsolute, extname } from 'path';
import { db } from '$lib/server/db';
import { characters, stickers } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

const VALID_TYPES = ['characters', 'stickers'];
const STORAGE_BASE = resolve(process.cwd(), './storage');

// Strict UUID v4 format: 8-4-4-4-12
const UUID_REGEX = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

// Map file extensions to MIME types
const MIME_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
};

/**
 * GET /api/images/:type/:id
 * Serve an image by looking up the storage path from the database.
 * This is cleaner than embedding file extensions in URLs.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  try {
    // Verify authentication
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { type, id } = params;

    // Validate type
    if (!type || !VALID_TYPES.includes(type)) {
      return new Response(JSON.stringify({ error: 'Invalid image type' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate ID format with strict UUID regex
    if (!id || !UUID_REGEX.test(id)) {
      return new Response(JSON.stringify({ error: 'Invalid image ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Look up the record and get the storage path
    let storagePath: string | null = null;

    if (type === 'characters') {
      const result = await db.select({ stickerImageUrl: characters.stickerImageUrl })
        .from(characters)
        .where(and(eq(characters.id, id), eq(characters.userId, user.id)))
        .limit(1);
      if (!result[0]) {
        return new Response(JSON.stringify({ error: 'Image not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      storagePath = result[0].stickerImageUrl;
    } else if (type === 'stickers') {
      const result = await db.select({ imageUrl: stickers.imageUrl })
        .from(stickers)
        .where(and(eq(stickers.id, id), eq(stickers.userId, user.id)))
        .limit(1);
      if (!result[0]) {
        return new Response(JSON.stringify({ error: 'Image not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      storagePath = result[0].imageUrl;
    }

    if (!storagePath) {
      return new Response(JSON.stringify({ error: 'Image not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Handle cloud URLs (future-proofing)
    if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
      // Redirect to cloud URL
      return new Response(null, {
        status: 302,
        headers: { 'Location': storagePath }
      });
    }

    // Verify file exists
    if (!existsSync(storagePath)) {
      return new Response(JSON.stringify({ error: 'Image file not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify path is within storage (prevent traversal)
    const resolvedPath = resolve(storagePath);
    const relativePath = relative(STORAGE_BASE, resolvedPath);
    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      return new Response(JSON.stringify({ error: 'Invalid image path' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Determine MIME type from file extension
    const ext = extname(storagePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

    // Read and return the image
    const imageBuffer = readFileSync(storagePath);

    return new Response(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'private, max-age=31536000, immutable',
        'Content-Length': imageBuffer.length.toString()
      }
    });
  } catch (error) {
    console.error('Image serving error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
