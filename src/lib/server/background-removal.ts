import { existsSync } from 'fs';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';
import { removeBackground as ffmpegRemoveBackground } from './ffmpeg.js';
import { TEMP_DIR } from './storage';

export interface RemovalResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

export interface RemovalOptions {
  color?: string; // Hex color to remove (default: #00FF00 green)
  similarity?: number; // Color match tolerance 0.01-1 (default: 0.3)
  blend?: number; // Edge blending 0-1 (default: 0.1)
  despillMix?: number; // Green/blue fringe removal 0-1 (default: 0.8)
}

/**
 * Remove chroma key background from image using FFmpeg worker thread
 */
export async function removeBackground(
  inputPath: string,
  outputPath: string,
  options: RemovalOptions = {}
): Promise<RemovalResult> {
  const {
    color = '#00FF00',
    similarity = 0.3,
    blend = 0.1,
    despillMix = 0.8
  } = options;

  try {
    // Ensure output directory exists
    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }

    // Use the FFmpeg worker thread for non-blocking execution
    const result = await ffmpegRemoveBackground(inputPath, outputPath, {
      color,
      similarity,
      blend,
      despillMix
    });

    if (!result.success) {
      throw new Error(result.error || 'FFmpeg worker failed');
    }

    return { success: true, outputPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Background removal error:', message);
    return { success: false, error: message };
  }
}

/**
 * Remove background from base64 image data
 * Creates a temp file, processes it, and returns the result
 */
export async function removeBackgroundFromBase64(
  base64Data: string,
  mimeType: string,
  outputPath: string,
  options: RemovalOptions = {}
): Promise<RemovalResult> {
  if (!existsSync(TEMP_DIR)) {
    await mkdir(TEMP_DIR, { recursive: true });
  }

  const ext = mimeType === 'image/png' ? '.png' : '.jpg';
  const tempInputPath = join(TEMP_DIR, `${randomUUID()}${ext}`);

  try {
    // Write base64 to temp file
    const buffer = Buffer.from(base64Data, 'base64');
    await writeFile(tempInputPath, buffer);

    // Process with FFmpeg
    const result = await removeBackground(tempInputPath, outputPath, options);

    // Clean up temp file
    if (existsSync(tempInputPath)) {
      await unlink(tempInputPath);
    }

    return result;
  } catch (error) {
    // Clean up on error
    if (existsSync(tempInputPath)) {
      await unlink(tempInputPath);
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// Note: Chroma key color selection is now AI-driven via processPrompt() in ai-validation.ts
// The LLM intelligently selects the appropriate chroma key based on scene content analysis
