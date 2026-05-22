/**
 * FFmpeg API
 *
 * Provides typed async functions for common FFmpeg operations.
 * Uses child_process.spawn which is inherently non-blocking.
 */

import { spawn } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, extname } from 'path';

export interface FFmpegResult {
  success: boolean;
  error?: string;
}

export interface EncodeResult {
  success: boolean;
  data?: string;
  mimeType?: string;
  error?: string;
}

/**
 * Execute an FFmpeg command asynchronously
 */
function runFFmpeg(args: string[]): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const process = spawn('ffmpeg', args, { stdio: 'pipe' });

    let stderr = '';

    process.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    process.on('error', (err: Error) => {
      resolve({ success: false, error: `Failed to spawn FFmpeg: ${err.message}` });
    });

    process.on('close', (code: number | null) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: stderr || `FFmpeg exited with code ${code}` });
      }
    });
  });
}

/**
 * Ensure the output directory exists
 */
function ensureOutputDir(outputPath: string): void {
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
}

/**
 * Validate hex color format to prevent command injection
 * Only accepts #RRGGBB format
 */
function validateHexColor(color: string): string {
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    throw new Error(`Invalid color format: ${color}. Expected #RRGGBB format.`);
  }
  return color.replace('#', '0x');
}

/**
 * Remove chroma key background from image
 */
export async function removeBackground(
  input: string,
  output: string,
  options?: {
    color?: string;
    similarity?: number;
    blend?: number;
    despillMix?: number;
  }
): Promise<FFmpegResult> {
  const color = options?.color ?? '#00FF00';
  const similarity = options?.similarity ?? 0.3;
  const blend = options?.blend ?? 0.1;
  const despillMix = options?.despillMix ?? 0.8;

  try {
    ensureOutputDir(output);

    // Validate and convert hex color to ffmpeg format (prevents command injection)
    const ffmpegColor = validateHexColor(color);

    // Despill only for green backgrounds
    const shouldDespill = despillMix > 0 && color.toUpperCase() === '#00FF00';

    const filterChain = shouldDespill
      ? `colorkey=${ffmpegColor}:${similarity}:${blend},despill=type=green:mix=${despillMix}`
      : `colorkey=${ffmpegColor}:${similarity}:${blend}`;

    return await runFFmpeg(['-y', '-i', input, '-vf', filterChain, '-pix_fmt', 'rgba', output]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Optimize image to a specific format
 */
export async function optimizeImage(
  input: string,
  output: string,
  options?: {
    format?: 'webp' | 'png';
    quality?: number;
  }
): Promise<FFmpegResult> {
  const format = options?.format ?? 'webp';
  const quality = options?.quality ?? 80;

  try {
    ensureOutputDir(output);

    let args: string[];

    switch (format) {
      case 'webp':
        // -pix_fmt rgba ensures alpha channel is preserved for transparency
        args = ['-y', '-i', input, '-c:v', 'libwebp', '-pix_fmt', 'rgba', '-quality', String(quality), output];
        break;

      case 'png':
        // PNG compression level 0-9 (higher = smaller file, slower)
        const compressionLevel = Math.round((100 - quality) / 10);
        args = ['-y', '-i', input, '-compression_level', String(compressionLevel), output];
        break;

      default:
        return { success: false, error: `Unknown format: ${format}` };
    }

    return await runFFmpeg(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Resize image while maintaining aspect ratio
 */
export async function resizeImage(
  input: string,
  output: string,
  maxWidth: number,
  maxHeight: number
): Promise<FFmpegResult> {
  try {
    ensureOutputDir(output);

    // Scale filter with aspect ratio preservation
    const scaleFilter = `scale='min(${maxWidth},iw)':'min(${maxHeight},ih)':force_original_aspect_ratio=decrease`;

    return await runFFmpeg(['-y', '-i', input, '-vf', scaleFilter, '-q:v', '2', output]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Encode a file to base64
 */
export async function encodeFileToBase64(filePath: string): Promise<EncodeResult> {
  try {
    const data = await readFile(filePath);
    const base64 = data.toString('base64');

    const ext = extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.avif': 'image/avif'
    };

    return {
      success: true,
      data: base64,
      mimeType: mimeTypes[ext] || 'image/jpeg'
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Decode base64 data to a file
 */
export async function decodeBase64ToFile(base64Data: string, outputPath: string): Promise<FFmpegResult> {
  try {
    await mkdir(dirname(outputPath), { recursive: true });
    const buffer = Buffer.from(base64Data, 'base64');
    await writeFile(outputPath, buffer);

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Terminate the worker thread (no-op, kept for API compatibility)
 */
export async function terminateWorker(): Promise<void> {
  // No-op - workers are no longer used
}

/**
 * Check if the worker is ready (always true, kept for API compatibility)
 */
export function isWorkerReady(): boolean {
  return true;
}
