import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, unlink, open } from 'fs/promises';
import { dirname, join, extname, resolve, sep } from 'path';
import { randomUUID } from 'crypto';
import { resizeImage } from './ffmpeg';
import { STORAGE_DIR, TEMP_DIR } from './storage';

/**
 * Maximum dimension for uploaded images
 * Images larger than this will be downscaled to reduce bandwidth, storage, and processing time
 */
const MAX_DIMENSION = 2048;

/**
 * Check if file has HEIC/HEIF extension
 */
function hasHeicExtension(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return ext === '.heic' || ext === '.heif';
}

/**
 * Check HEIC/HEIF format by reading magic bytes
 * HEIC files have 'ftyp' at offset 4, followed by brand like 'heic', 'heix', 'mif1'
 */
async function hasHeicMagicBytes(filePath: string): Promise<boolean> {
  let fileHandle;
  try {
    fileHandle = await open(filePath, 'r');
    const buffer = Buffer.alloc(12);
    await fileHandle.read(buffer, 0, 12, 0);

    // Check for 'ftyp' at offset 4
    const ftyp = buffer.toString('ascii', 4, 8);
    if (ftyp !== 'ftyp') {
      return false;
    }

    // Check brand at offset 8 (heic, heix, mif1, msf1, hevc, hevx)
    const brand = buffer.toString('ascii', 8, 12);
    const heicBrands = ['heic', 'heix', 'mif1', 'msf1', 'hevc', 'hevx'];
    return heicBrands.includes(brand);
  } catch {
    return false;
  } finally {
    if (fileHandle) {
      await fileHandle.close();
    }
  }
}

/**
 * Detect if a file is in HEIC/HEIF format
 * Checks both file extension and magic bytes for reliability
 */
export async function isHeicFormat(filePath: string): Promise<boolean> {
  // Validate path exists
  if (!existsSync(filePath)) {
    return false;
  }

  // Check extension first (fast)
  if (hasHeicExtension(filePath)) {
    return true;
  }

  // Fall back to magic bytes check (handles renamed files)
  return await hasHeicMagicBytes(filePath);
}

/**
 * Check if file is already JPEG format
 */
function isJpegFormat(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return ext === '.jpg' || ext === '.jpeg';
}

/**
 * Validate and sanitize file path to prevent path traversal
 */
function validatePath(filePath: string, allowedDir?: string): string {
  if (filePath.includes('\0')) {
    throw new Error('Invalid file path: contains null bytes');
  }

  const resolved = resolve(filePath);

  // Verify resolved path is within allowed directory if specified
  if (allowedDir) {
    const allowedResolved = resolve(allowedDir);
    // Check that resolved starts with allowedDir (with proper separator handling)
    if (!resolved.startsWith(allowedResolved + sep) && resolved !== allowedResolved) {
      throw new Error('Invalid file path: outside allowed directory');
    }
  }

  return resolved;
}

/**
 * Convert an image file to JPEG using FFmpeg
 * @param inputPath - Path to input image (HEIC, PNG, etc.)
 * @param outputPath - Path for output JPEG file
 * @throws Error if conversion fails
 */
export async function convertToJpeg(
  inputPath: string,
  outputPath: string
): Promise<void> {
  // Validate and resolve paths
  const resolvedInput = validatePath(inputPath, STORAGE_DIR);
  const resolvedOutput = validatePath(outputPath, TEMP_DIR);

  // Verify input file exists
  if (!existsSync(resolvedInput)) {
    throw new Error(`Input file not found: ${resolvedInput}`);
  }

  // Ensure output directory exists
  const outputDir = dirname(resolvedOutput);
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }

  // Use spawnSync with array args to prevent command injection
  const result = spawnSync('ffmpeg', [
    '-y',                    // Overwrite output without asking
    '-i', resolvedInput,     // Input file
    '-q:v', '2',             // High quality (2-5 is good range, lower = better)
    resolvedOutput           // Output file
  ], { stdio: 'pipe' });

  if (result.error) {
    console.error('FFmpeg spawn error:', result.error.message);
    throw new Error(`Failed to run FFmpeg: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.toString() || 'Unknown error';
    console.error('FFmpeg conversion error:', stderr);
    throw new Error(`FFmpeg conversion failed: ${stderr}`);
  }

  // Verify output was created
  if (!existsSync(resolvedOutput)) {
    throw new Error('FFmpeg completed but output file was not created');
  }
}

/**
 * Resize an image to fit within max dimensions while maintaining aspect ratio
 * Uses FFmpeg worker thread for non-blocking operation
 * @param inputPath - Path to input image (must be JPEG)
 * @param outputPath - Path for output resized image
 * @throws Error if resize fails
 */
async function resizeToMaxDimensions(
  inputPath: string,
  outputPath: string
): Promise<void> {
  const result = await resizeImage(inputPath, outputPath, MAX_DIMENSION, MAX_DIMENSION);

  if (!result.success) {
    throw new Error(`Image resize failed: ${result.error || 'Unknown error'}`);
  }

  // Verify output was created
  if (!existsSync(outputPath)) {
    throw new Error('Resize completed but output file was not created');
  }
}

/**
 * Process an uploaded image:
 * 1. Convert HEIC/PNG/other formats to JPEG if needed
 * 2. Resize to max 2048x2048 to reduce bandwidth, storage, and processing time
 *
 * @param inputPath - Path to the uploaded image
 * @returns Path to the processed image (converted and/or resized)
 */
export async function processUploadedImage(inputPath: string): Promise<string> {
  // Validate input path
  const resolvedInput = validatePath(inputPath, STORAGE_DIR);

  if (!existsSync(resolvedInput)) {
    throw new Error(`Input file not found: ${resolvedInput}`);
  }

  if (!existsSync(TEMP_DIR)) {
    await mkdir(TEMP_DIR, { recursive: true });
  }

  let jpegPath = resolvedInput;
  let needsCleanup = false;

  // Step 1: Convert to JPEG if needed
  if (!isJpegFormat(resolvedInput)) {
    const convertedPath = join(TEMP_DIR, `${randomUUID()}.jpg`);

    try {
      await convertToJpeg(resolvedInput, convertedPath);
      jpegPath = convertedPath;
      needsCleanup = true;
    } catch (error) {
      // Clean up partial output on error
      if (existsSync(convertedPath)) {
        try {
          await unlink(convertedPath);
        } catch {
          // Ignore cleanup errors
        }
      }
      throw error;
    }
  }

  // Step 2: Resize to max dimensions
  // Always run through resize - FFmpeg's scale filter with force_original_aspect_ratio=decrease
  // only shrinks if needed, so it's effectively a no-op for smaller images
  const resizedPath = join(TEMP_DIR, `${randomUUID()}.jpg`);

  try {
    await resizeToMaxDimensions(jpegPath, resizedPath);

    // Clean up intermediate JPEG if we created one during conversion
    if (needsCleanup && jpegPath !== resizedPath) {
      try {
        await unlink(jpegPath);
      } catch {
        // Ignore cleanup errors
      }
    }

    return resizedPath;
  } catch (error) {
    // Clean up on error
    if (existsSync(resizedPath)) {
      try {
        await unlink(resizedPath);
      } catch {
        // Ignore cleanup errors
      }
    }
    // If we created an intermediate JPEG, clean it up too
    if (needsCleanup) {
      try {
        await unlink(jpegPath);
      } catch {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
}
