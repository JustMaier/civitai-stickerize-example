/**
 * Image Optimization Module
 *
 * Provides configurable image optimization after background removal.
 * Controlled via environment variables:
 * - IMAGE_OPTIMIZATION_ENABLED: 'true' to enable (default: false)
 * - IMAGE_OPTIMIZATION_FORMAT: 'webp' | 'png' (default: webp)
 * - IMAGE_OPTIMIZATION_QUALITY: 1-100 (default: 80)
 */

import { env } from '$env/dynamic/private';
import { optimizeImage } from './ffmpeg';
import { existsSync } from 'fs';
import { unlink } from 'fs/promises';
import { dirname, basename, extname, join } from 'path';

/**
 * Normalize a file path for consistent storage:
 * - Convert Windows backslashes to forward slashes
 * - Ensure relative paths start with ./
 */
function normalizeStoragePath(filePath: string): string {
  // Convert backslashes to forward slashes
  let normalized = filePath.replace(/\\/g, '/');

  // Ensure relative paths start with ./
  if (!normalized.startsWith('/') && !normalized.startsWith('./') && !normalized.startsWith('http')) {
    normalized = './' + normalized;
  }

  return normalized;
}

export interface OptimizationConfig {
  enabled: boolean;
  format: 'webp' | 'png';
  quality: number;
}

/**
 * Get the current optimization configuration from environment variables
 */
export function getOptimizationConfig(): OptimizationConfig {
  const formatValue = env.IMAGE_OPTIMIZATION_FORMAT?.toLowerCase();
  let format: 'webp' | 'png' = 'webp';

  if (formatValue === 'webp' || formatValue === 'png') {
    format = formatValue;
  }

  const qualityValue = parseInt(env.IMAGE_OPTIMIZATION_QUALITY || '80', 10);
  const quality = isNaN(qualityValue) ? 80 : Math.max(1, Math.min(100, qualityValue));

  return {
    enabled: env.IMAGE_OPTIMIZATION_ENABLED === 'true',
    format,
    quality
  };
}

/**
 * Get the file extension for a given format
 */
function getExtensionForFormat(format: 'webp' | 'png'): string {
  switch (format) {
    case 'webp':
      return '.webp';
    case 'png':
      return '.png';
  }
}

/**
 * Optimize an image if optimization is enabled
 *
 * @param inputPath - Path to the input image
 * @returns The final output path (may have different extension if format changed)
 *
 * If optimization is enabled:
 * - Optimizes the image to the configured format
 * - If format differs from original, creates new file and deletes original
 * - Returns the path to the optimized file
 *
 * If optimization is disabled or fails:
 * - Returns the original input path (graceful degradation)
 */
export async function optimizeIfEnabled(inputPath: string): Promise<string> {
  const config = getOptimizationConfig();

  // If optimization is disabled, return the original path (normalized)
  if (!config.enabled) {
    return normalizeStoragePath(inputPath);
  }

  // Check if input file exists
  if (!existsSync(inputPath)) {
    console.warn(`[Image Optimization] Input file not found: ${inputPath}`);
    return normalizeStoragePath(inputPath);
  }

  // Determine output path based on format
  const inputExt = extname(inputPath);
  const outputExt = getExtensionForFormat(config.format);
  const dir = dirname(inputPath);
  const nameWithoutExt = basename(inputPath, inputExt);
  const outputPath = join(dir, `${nameWithoutExt}${outputExt}`);

  // If input and output would be the same format, optimize in place
  const sameFormat = inputExt.toLowerCase() === outputExt.toLowerCase();

  try {
    if (sameFormat) {
      // Optimize to temp file, then replace original
      const tempPath = join(dir, `${nameWithoutExt}_optimizing${outputExt}`);

      const result = await optimizeImage(inputPath, tempPath, {
        format: config.format,
        quality: config.quality
      });

      if (!result.success) {
        console.error(`[Image Optimization] Failed to optimize ${inputPath}:`, result.error);
        // Clean up temp file if it exists
        if (existsSync(tempPath)) {
          await unlink(tempPath);
        }
        return inputPath; // Graceful degradation
      }

      // Replace original with optimized version
      await unlink(inputPath);
      const { rename } = await import('fs/promises');
      await rename(tempPath, inputPath);

      console.log(`[Image Optimization] Optimized in place: ${inputPath} (${config.format}, q=${config.quality})`);
      return normalizeStoragePath(inputPath);
    } else {
      // Different format - create new file
      const result = await optimizeImage(inputPath, outputPath, {
        format: config.format,
        quality: config.quality
      });

      if (!result.success) {
        console.error(`[Image Optimization] Failed to optimize ${inputPath}:`, result.error);
        return normalizeStoragePath(inputPath); // Graceful degradation - keep original PNG
      }

      // Delete the original file since we now have the optimized version
      await unlink(inputPath);

      console.log(`[Image Optimization] Converted: ${inputPath} -> ${outputPath} (q=${config.quality})`);
      return normalizeStoragePath(outputPath);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Image Optimization] Error optimizing ${inputPath}:`, message);
    return normalizeStoragePath(inputPath); // Graceful degradation
  }
}

/**
 * Convert a storage path to an API URL for serving to clients
 *
 * Takes a storage path and returns a clean API URL (ID only, no extension).
 * The API looks up the actual path from the database.
 * Supports both local paths and future cloud URLs.
 *
 * @param storagePath - The storage path (e.g., ./storage/characters/abc123.avif)
 * @returns The API URL (e.g., /api/images/characters/abc123)
 */
export function storagePathToApiUrl(storagePath: string): string {
  // If it's already an API URL or cloud URL, return as-is
  if (storagePath.startsWith('/api/') || storagePath.startsWith('http')) {
    return storagePath;
  }

  // Extract ID from filename (remove extension)
  const filename = basename(storagePath);
  const id = filename.replace(/\.[^.]+$/, ''); // Remove extension

  // Determine type from path
  if (storagePath.includes('/characters/')) {
    return `/api/images/characters/${id}`;
  } else if (storagePath.includes('/stickers/')) {
    return `/api/images/stickers/${id}`;
  }

  // Fallback - shouldn't happen but be safe
  return storagePath;
}
