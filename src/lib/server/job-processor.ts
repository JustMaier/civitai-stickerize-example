import { db } from './db';
import { generationJobs, characters, stickers } from './db/schema';
import { eq, and, or, sql, asc, lt, count } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { writeFile, unlink, mkdir, readdir, rename } from 'fs/promises';
import { join } from 'path';
import { env } from '$env/dynamic/private';

import { generateImage, type FileRef, type GenerationResult } from './image-generation';
import { removeBackground, removeBackgroundFromBase64 } from './background-removal';
import { buildCharacterPrompt, buildStickerPrompt, buildMultiCharacterStickerPrompt } from './prompt-builder';
import { validatePhoto, processPrompt } from './ai-validation';
import { getOrUploadCharacterFile } from './gemini-files';
import { optimizeIfEnabled } from './image-optimization';
import { decodeBase64ToFile } from './ffmpeg';
import { CHARACTERS_DIR, STICKERS_DIR, TEMP_GENERATED_DIR } from './storage';
import { generateImageViaCivitai, getCivitaiClientForUser, InsufficientBuzzError } from './civitai-orchestrator';

const MAX_ATTEMPTS = 3;
const JOB_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
const JOB_STALE_MS = 5 * 60 * 1000; // 5 minutes - jobs processing longer than this are considered stuck
const STYLE_REFERENCE_PATH = './static/style-reference/justin-cool.png';
const MAX_CONCURRENT_JOBS_PER_USER = 8;

// ============================================================================
// Recovery Functions
// ============================================================================

/**
 * Recover jobs that are stuck in 'processing' state
 * Call this on server startup to reset stuck jobs back to 'queued'
 *
 * Jobs are considered stuck if:
 * - Status is 'processing' AND
 * - updatedAt is older than JOB_STALE_MS (5 minutes)
 *
 * @returns Number of jobs recovered
 */
export async function recoverStuckJobs(): Promise<number> {
  const staleThreshold = new Date(Date.now() - JOB_STALE_MS);

  const stuckJobs = await db
    .select({ id: generationJobs.id })
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.status, 'processing'),
        lt(generationJobs.updatedAt, staleThreshold)
      )
    );

  if (stuckJobs.length === 0) {
    return 0;
  }

  console.log(`[Job Recovery] Found ${stuckJobs.length} stuck job(s), resetting and restarting...`);

  for (const job of stuckJobs) {
    await db.update(generationJobs)
      .set({
        status: 'queued',
        error: 'Recovered from stuck processing state',
        updatedAt: new Date()
      })
      .where(eq(generationJobs.id, job.id));

    console.log(`[Job Recovery] Reset job ${job.id} to queued, restarting...`);

    // Restart processing (fire-and-forget)
    processJob(job.id).catch(err =>
      console.error(`[Job Recovery] Failed to restart job ${job.id}:`, err)
    );
  }

  return stuckJobs.length;
}

/**
 * Clean up orphaned temp files that don't have corresponding jobs
 * Call periodically or on startup
 */
export async function cleanupOrphanedTempFiles(): Promise<void> {
  // Ensure temp directory exists
  if (!existsSync(TEMP_GENERATED_DIR)) {
    return;
  }

  const files = await readdir(TEMP_GENERATED_DIR);

  for (const file of files) {
    const filePath = join(TEMP_GENERATED_DIR, file);
    // Extract job ID from filename (format: {jobId}.png)
    const jobId = file.replace('.png', '');

    // Check if job exists and is still active
    const jobResults = await db
      .select({ status: generationJobs.status })
      .from(generationJobs)
      .where(eq(generationJobs.id, jobId))
      .limit(1);

    const job = jobResults[0];

    // Delete if job doesn't exist or is complete/failed
    if (!job || job.status === 'complete' || job.status === 'failed') {
      await cleanupFile(filePath);
      console.log(`[Cleanup] Removed orphaned temp file: ${file}`);
    }
  }
}

/**
 * Get the fixed cost for image generation in cents
 * Configurable via IMAGE_GEN_COST_CENTS env var, defaults to 3 cents
 */
function getImageGenerationCostCents(): number {
  const costStr = env.IMAGE_GEN_COST_CENTS;
  if (costStr) {
    const cost = parseInt(costStr, 10);
    if (!isNaN(cost) && cost >= 0) {
      return cost;
    }
  }
  return 3; // Default 3 cents per image generation
}

export interface JobResult {
  success: boolean;
  resultId?: string;
  error?: string;
}

/**
 * Process a generation job
 * Handles both character and sticker generation
 */
export async function processJob(jobId: string): Promise<JobResult> {
  // Fetch the job
  const jobResults = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1);
  const job = jobResults[0];

  if (!job) {
    return { success: false, error: 'Job not found' };
  }

  // Check if already completed or failed
  if (job.status === 'complete' || job.status === 'failed') {
    return {
      success: job.status === 'complete',
      resultId: job.resultId || undefined,
      error: job.error || undefined
    };
  }

  // Use optimistic locking - only update if still queued
  const updateResult = await db.update(generationJobs)
    .set({
      status: 'processing',
      attempts: job.attempts + 1,
      updatedAt: new Date()
    })
    .where(and(
      eq(generationJobs.id, jobId),
      eq(generationJobs.status, 'queued')
    ));

  // Check if we successfully claimed the job
  // SQLite doesn't return affected rows easily, so re-fetch the job
  const recheckResults = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1);
  const recheckJob = recheckResults[0];

  if (recheckJob?.status !== 'processing' || recheckJob.attempts !== job.attempts + 1) {
    // Another process already claimed this job
    return { success: false, error: 'Job already being processed' };
  }

  try {
    if (job.type === 'character') {
      return await processCharacterJob(job);
    } else {
      return await processStickerJob(job);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Job ${jobId} failed:`, message);

    // Non-retryable: re-running won't change anything (e.g. Buzz shortage).
    // Mark failed immediately with a flag the UI uses to suppress "retry".
    if (error instanceof InsufficientBuzzError) {
      await db.update(generationJobs)
        .set({
          status: 'failed',
          error: message,
          isRetryable: false,
          updatedAt: new Date()
        })
        .where(eq(generationJobs.id, jobId));

      return { success: false, error: message };
    }

    // Check if we should retry
    // The DB now has job.attempts + 1 from the processing update
    const currentAttempt = job.attempts + 1;
    if (currentAttempt < MAX_ATTEMPTS) {
      await db.update(generationJobs)
        .set({
          status: 'queued',
          error: message,
          updatedAt: new Date()
        })
        .where(eq(generationJobs.id, jobId));

      return { success: false, error: `Attempt ${currentAttempt} failed: ${message}. Will retry.` };
    }

    // Mark as failed after max attempts
    await db.update(generationJobs)
      .set({
        status: 'failed',
        error: message,
        isRetryable: true,
        updatedAt: new Date()
      })
      .where(eq(generationJobs.id, jobId));

    return { success: false, error: message };
  }
}

/**
 * Process a character generation job
 * Handles both new character creation and regeneration
 * Uses checkpoints for crash recovery
 */
async function processCharacterJob(job: typeof generationJobs.$inferSelect): Promise<JobResult> {
  // The userPrompt for character jobs contains the temp photo path
  const userPhotoPath = job.userPrompt;

  // Check if this is a regeneration (resultId already set indicates existing character ID)
  const isRegeneration = !!job.resultId;
  const existingCharacterId = job.resultId;

  // Determine character ID early (for recovery purposes)
  const characterId = isRegeneration ? existingCharacterId! : (job.tempGeneratedImage?.split('/').pop()?.replace('.png', '') || randomUUID());
  const tempGeneratedPath = join(TEMP_GENERATED_DIR, `${job.id}.png`);

  // Check checkpoint to skip completed steps on retry
  const checkpoint = job.checkpoint;

  // -------------------------------------------------------------------------
  // Step 1: Validate photo (skip if already validated or regeneration)
  // -------------------------------------------------------------------------
  if (!checkpoint && !isRegeneration) {
    const validation = await validatePhoto(userPhotoPath);
    const validationCostCents = validation.costCents || 0;

    // Update LLM cost tracking
    await db.update(generationJobs)
      .set({
        llmCostCents: (job.llmCostCents || 0) + validationCostCents,
        checkpoint: 'validated',
        updatedAt: new Date()
      })
      .where(eq(generationJobs.id, job.id));

    if (!validation.valid) {
      // Clean up temp photo on validation failure (privacy requirement)
      await cleanupFile(userPhotoPath);
      await markJobFailed(job.id, validation.error || 'Photo validation failed', false);
      return { success: false, error: validation.error };
    }
  }

  // -------------------------------------------------------------------------
  // Step 2: Generate image (skip if already generated)
  // -------------------------------------------------------------------------
  let generatedImagePath = tempGeneratedPath;

  // Parse character metadata from refinedPrompt
  const characterMetadata = parseCharacterJobMetadata(job.refinedPrompt);

  console.log(`[Character Job ${job.id}] Step 2 - checkpoint: ${checkpoint}, isRegeneration: ${isRegeneration}`);
  console.log(`[Character Job ${job.id}] tempGeneratedPath exists: ${existsSync(tempGeneratedPath)}`);
  console.log(`[Character Job ${job.id}] userPhotoPath: ${userPhotoPath}`);

  if (checkpoint !== 'generated' && !existsSync(tempGeneratedPath)) {
    console.log(`[Character Job ${job.id}] Generating new image...`);

    // Build the prompt with optional additional details
    const { prompt, referenceImages, chromaKeyColor } = buildCharacterPrompt({
      styleReferencePath: STYLE_REFERENCE_PATH,
      userPhotoPath,
      additionalDetails: characterMetadata.additionalDetails
    });

    console.log(`[Character Job ${job.id}] Reference images: ${JSON.stringify(referenceImages)}`);

    // Store chroma key color
    await db.update(generationJobs)
      .set({ chromaKeyColor, updatedAt: new Date() })
      .where(eq(generationJobs.id, job.id));

    // Generate the image — Civitai orchestrator if user has connected an
    // account or the server-wide CIVITAI_API_TOKEN is set; Gemini otherwise.
    const civitai = await getCivitaiClientForUser(job.userId);
    let genResult: GenerationResult;
    if (civitai) {
      console.log(`[Character Job ${job.id}] Using Civitai orchestrator (owner=${civitai.owner})`);
      genResult = await generateImageViaCivitai(civitai.client, prompt, referenceImages, {
        aspectRatio: '1:1',
        imageSize: '2K'
      });
    } else {
      console.log(`[Character Job ${job.id}] Using Gemini fallback`);
      genResult = await generateImage(prompt, referenceImages, {
        aspectRatio: '1:1',
        imageSize: '2K'
      });
    }

    if (!genResult.success || !genResult.imageData) {
      if (genResult.code === 'insufficient_buzz') {
        throw new InsufficientBuzzError(genResult.error);
      }
      throw new Error(genResult.error || 'Image generation failed');
    }

    // Save generated image to temp location for recovery (decode in worker thread)
    const decodeResult = await decodeBase64ToFile(genResult.imageData, tempGeneratedPath);
    if (!decodeResult.success || !existsSync(tempGeneratedPath)) {
      throw new Error(decodeResult.error || 'Failed to save generated image');
    }

    // Track image generation cost and checkpoint
    const imageCostCents = getImageGenerationCostCents();
    await db.update(generationJobs)
      .set({
        imageCostCents,
        buzzCost: genResult.buzzCost ?? null,
        checkpoint: 'generated',
        tempGeneratedImage: tempGeneratedPath,
        updatedAt: new Date()
      })
      .where(eq(generationJobs.id, job.id));
  } else if (existsSync(tempGeneratedPath)) {
    // Recovering from crash - use saved image
    console.log(`[Character Job ${job.id}] SKIPPING generation - using saved image from ${tempGeneratedPath}`);
    generatedImagePath = tempGeneratedPath;
  } else {
    console.log(`[Character Job ${job.id}] SKIPPING generation - checkpoint is '${checkpoint}'`);
  }

  // -------------------------------------------------------------------------
  // Step 3: Remove background and save final image
  // -------------------------------------------------------------------------
  const outputPath = join(CHARACTERS_DIR, `${characterId}.png`);

  console.log(`[Character Job ${job.id}] Step 3 - outputPath: ${outputPath}`);
  console.log(`[Character Job ${job.id}] generatedImagePath: ${generatedImagePath}, exists: ${existsSync(generatedImagePath)}`);

  // Ensure directory exists
  if (!existsSync(CHARACTERS_DIR)) {
    await mkdir(CHARACTERS_DIR, { recursive: true });
  }

  // For regeneration, backup the original file in case of failure
  const backupPath = isRegeneration && existsSync(outputPath)
    ? `${outputPath}.backup`
    : null;

  console.log(`[Character Job ${job.id}] backupPath: ${backupPath}, outputPath exists: ${existsSync(outputPath)}`);

  if (backupPath && existsSync(outputPath)) {
    await rename(outputPath, backupPath);
  }

  // Get chroma key color (may have been set in a previous attempt)
  const chromaKeyColor = job.chromaKeyColor || '#00FF00';

  const bgResult = await removeBackground(
    generatedImagePath,
    outputPath,
    { color: chromaKeyColor }
  );

  if (!bgResult.success) {
    // Restore backup if regeneration failed
    if (backupPath && existsSync(backupPath)) {
      await rename(backupPath, outputPath);
    }
    throw new Error(bgResult.error || 'Background removal failed');
  }

  // Optimize if enabled (may change file extension)
  // Store the actual file path (not an API URL) - allows for future cloud migration
  const finalPath = await optimizeIfEnabled(outputPath);

  console.log(`[Character Job ${job.id}] Final path after optimization: ${finalPath}`);

  // Clean up backup file and temp generated image on success
  if (backupPath && existsSync(backupPath)) {
    await unlink(backupPath);
  }
  await cleanupFile(tempGeneratedPath);

  // Delete the source photo (privacy)
  await cleanupFile(userPhotoPath);

  // -------------------------------------------------------------------------
  // Step 4: Create database record and complete
  // -------------------------------------------------------------------------
  try {
    if (isRegeneration) {
      // For regeneration, update storage path in case format changed
      await db.update(characters)
        .set({ stickerImageUrl: finalPath })
        .where(eq(characters.id, characterId));
    } else {
      // Create new character record
      await db.insert(characters).values({
        id: characterId,
        userId: job.userId,
        name: characterMetadata.name,
        additionalDetails: characterMetadata.additionalDetails || null,
        stickerImageUrl: finalPath
      });

    }

    // Mark job complete and clear checkpoint
    await db.update(generationJobs)
      .set({
        status: 'complete',
        resultId: characterId,
        checkpoint: null,
        tempGeneratedImage: null,
        updatedAt: new Date()
      })
      .where(eq(generationJobs.id, job.id));
  } catch (dbError) {
    // Clean up the generated file if DB operation fails (for new characters only)
    if (!isRegeneration) {
      await cleanupFile(finalPath);
    }
    throw dbError;
  }

  return { success: true, resultId: characterId };
}

/**
 * Process a sticker generation job
 * Handles prompt validation/enhancement as the first step
 * Uses checkpoints for crash recovery
 */
async function processStickerJob(job: typeof generationJobs.$inferSelect): Promise<JobResult> {
  // Parse character IDs
  const characterIds: string[] = job.characterIds ? JSON.parse(job.characterIds) : [];

  // Fetch the characters
  const characterRecords = await Promise.all(
    characterIds.map(async (id) => {
      const results = await db.select().from(characters).where(eq(characters.id, id)).limit(1);
      return results[0];
    })
  );

  const validCharacters = characterRecords.filter(Boolean);

  if (validCharacters.length === 0) {
    await markJobFailed(job.id, 'No valid characters found for sticker generation');
    return { success: false, error: 'No valid characters found' };
  }

  // Check checkpoint to skip completed steps on retry
  const checkpoint = job.checkpoint;
  const tempGeneratedPath = join(TEMP_GENERATED_DIR, `${job.id}.png`);

  // Track costs locally (may accumulate across retries)
  let llmCostCents = job.llmCostCents || 0;
  let imageCostCents = job.imageCostCents || 0;

  // -------------------------------------------------------------------------
  // Step 1: Process prompt through AI (skip if already processed)
  // -------------------------------------------------------------------------
  let chromaKeyColor = job.chromaKeyColor || '#00FF00';
  let refinedPromptFromAI = job.refinedPrompt || job.userPrompt;

  if (!checkpoint) {
    const promptResult = await processPrompt(
      job.userPrompt,
      validCharacters.map(c => ({ id: c.id, name: c.name }))
    );

    // Track LLM cost regardless of validation result
    llmCostCents += promptResult.costCents || 0;
    await db.update(generationJobs)
      .set({
        llmCostCents,
        updatedAt: new Date()
      })
      .where(eq(generationJobs.id, job.id));

    // If prompt validation failed, mark job as failed
    if (!promptResult.valid) {
      await markJobFailed(job.id, promptResult.error || 'Prompt validation failed', false);
      return { success: false, error: promptResult.error };
    }

    // Store the AI results and checkpoint
    chromaKeyColor = promptResult.chromaKeyColor || '#00FF00';
    refinedPromptFromAI = promptResult.refinedPrompt || job.userPrompt;

    await db.update(generationJobs)
      .set({
        refinedPrompt: refinedPromptFromAI,
        chromaKeyColor,
        checkpoint: 'prompt_processed',
        updatedAt: new Date()
      })
      .where(eq(generationJobs.id, job.id));
  }

  // -------------------------------------------------------------------------
  // Step 2: Generate image (skip if already generated)
  // -------------------------------------------------------------------------
  let generatedImagePath = tempGeneratedPath;

  if (checkpoint !== 'generated' && !existsSync(tempGeneratedPath)) {
    // Build the final prompt for image generation
    // stickerImageUrl is now the actual storage path (e.g., ./storage/characters/abc.avif)
    let builtPrompt;
    if (validCharacters.length === 1) {
      const char = validCharacters[0];
      if (!existsSync(char.stickerImageUrl)) {
        throw new Error(`Character image not found for ${char.name} (${char.id}) at ${char.stickerImageUrl}`);
      }
      builtPrompt = buildStickerPrompt({
        characterName: char.name,
        characterImagePath: char.stickerImageUrl,
        userDescription: refinedPromptFromAI,
        chromaKeyColor
      });
    } else {
      const charData = validCharacters.map(c => {
        if (!existsSync(c.stickerImageUrl)) {
          throw new Error(`Character image not found for ${c.name} (${c.id}) at ${c.stickerImageUrl}`);
        }
        return { name: c.name, imagePath: c.stickerImageUrl };
      });
      builtPrompt = buildMultiCharacterStickerPrompt(charData, refinedPromptFromAI, undefined, chromaKeyColor);
    }

    const { prompt, referenceImages } = builtPrompt;

    // Pick provider: Civitai orchestrator if available, otherwise Gemini.
    const civitai = await getCivitaiClientForUser(job.userId);
    let genResult: GenerationResult;
    if (civitai) {
      console.log(`[Sticker Job ${job.id}] Using Civitai orchestrator (owner=${civitai.owner})`);
      genResult = await generateImageViaCivitai(civitai.client, prompt, referenceImages, {
        aspectRatio: '1:1',
        imageSize: '2K'
      });
    } else {
      console.log(`[Sticker Job ${job.id}] Using Gemini fallback`);
      // Get or upload character images to Gemini File API for reuse
      // This avoids re-uploading the same character image on every sticker generation
      const imageRefs: (string | FileRef)[] = await Promise.all(
        validCharacters.map(async (char, index) => {
          const imagePath = referenceImages[index];
          try {
            const fileRef = await getOrUploadCharacterFile(char.id, imagePath);
            return fileRef;
          } catch (error) {
            // Fall back to file path if Gemini File API fails
            console.warn(`[Sticker Job] Failed to get Gemini file for character ${char.id}, using file path:`, error);
            return imagePath;
          }
        })
      );

      genResult = await generateImage(prompt, imageRefs, {
        aspectRatio: '1:1',
        imageSize: '2K'
      });
    }

    if (!genResult.success || !genResult.imageData) {
      if (genResult.code === 'insufficient_buzz') {
        throw new InsufficientBuzzError(genResult.error);
      }
      throw new Error(genResult.error || 'Image generation failed');
    }

    // Save generated image to temp location for recovery (decode in worker thread)
    const decodeResult = await decodeBase64ToFile(genResult.imageData, tempGeneratedPath);
    if (!decodeResult.success || !existsSync(tempGeneratedPath)) {
      throw new Error(decodeResult.error || 'Failed to save generated image');
    }

    // Track image generation cost and checkpoint
    imageCostCents = getImageGenerationCostCents();
    await db.update(generationJobs)
      .set({
        imageCostCents,
        buzzCost: genResult.buzzCost ?? null,
        checkpoint: 'generated',
        tempGeneratedImage: tempGeneratedPath,
        updatedAt: new Date()
      })
      .where(eq(generationJobs.id, job.id));
  } else if (existsSync(tempGeneratedPath)) {
    // Recovering from crash - use saved image
    console.log(`[Recovery] Using saved generated image for job ${job.id}`);
    generatedImagePath = tempGeneratedPath;
  }

  // -------------------------------------------------------------------------
  // Step 3: Remove background and save final image
  // -------------------------------------------------------------------------
  const stickerId = randomUUID();
  const outputPath = join(STICKERS_DIR, `${stickerId}.png`);

  // Ensure directory exists
  if (!existsSync(STICKERS_DIR)) {
    await mkdir(STICKERS_DIR, { recursive: true });
  }

  const bgResult = await removeBackground(
    generatedImagePath,
    outputPath,
    { color: chromaKeyColor }
  );

  if (!bgResult.success) {
    throw new Error(bgResult.error || 'Background removal failed');
  }

  // Optimize if enabled (may change file extension)
  // Store the actual file path (not an API URL) - allows for future cloud migration
  const finalPath = await optimizeIfEnabled(outputPath);

  // Clean up temp generated image
  await cleanupFile(tempGeneratedPath);

  // -------------------------------------------------------------------------
  // Step 4: Create database record and complete
  // -------------------------------------------------------------------------
  const totalCostCents = llmCostCents + imageCostCents;
  try {
    await db.insert(stickers).values({
      id: stickerId,
      jobId: job.id,
      userId: job.userId,
      characterIds: JSON.stringify(characterIds),
      prompt: job.userPrompt,
      imageUrl: finalPath,
      costCents: totalCostCents
    });

    // Mark job complete and clear checkpoint
    await db.update(generationJobs)
      .set({
        status: 'complete',
        resultId: stickerId,
        checkpoint: null,
        tempGeneratedImage: null,
        updatedAt: new Date()
      })
      .where(eq(generationJobs.id, job.id));
  } catch (dbError) {
    // Clean up the generated file if DB insert fails
    await cleanupFile(finalPath);
    throw dbError;
  }

  return { success: true, resultId: stickerId };
}

/**
 * Mark a job as failed
 */
async function markJobFailed(jobId: string, error: string, isRetryable: boolean = false): Promise<void> {
  await db.update(generationJobs)
    .set({
      status: 'failed',
      error,
      isRetryable,
      updatedAt: new Date()
    })
    .where(eq(generationJobs.id, jobId));
}

/**
 * Clean up generated files on failure
 */
async function cleanupFile(filePath: string): Promise<void> {
  try {
    if (existsSync(filePath)) {
      await unlink(filePath);
    }
  } catch (error) {
    console.error('Failed to cleanup file:', filePath, error);
  }
}

/**
 * Check if user has room for a new job
 * Returns true if user has fewer than 8 queued/processing jobs
 */
export async function canCreateJob(userId: string): Promise<boolean> {
  const activeJobs = await db
    .select({ count: sql<number>`count(*)` })
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.userId, userId),
        or(
          eq(generationJobs.status, 'queued'),
          eq(generationJobs.status, 'processing')
        )
      )
    );

  const count = activeJobs[0]?.count ?? 0;
  return count < MAX_CONCURRENT_JOBS_PER_USER;
}

/**
 * Claim the next available job from the queue
 * Prioritizes character jobs over sticker jobs, then by creation time
 * Returns the job ID if a job was claimed, null otherwise
 */
export async function claimNextJob(userId?: string): Promise<string | null> {
  // Build base conditions: queued status
  const baseConditions = [eq(generationJobs.status, 'queued')];

  // Optionally filter by user
  if (userId) {
    baseConditions.push(eq(generationJobs.userId, userId));
  }

  // Find the next job to process, prioritizing character jobs
  // We use a CASE expression to order: character=0, sticker=1
  // This ensures character jobs are processed first
  const nextJobs = await db
    .select()
    .from(generationJobs)
    .where(and(...baseConditions))
    .orderBy(
      // Priority: character jobs first (type='character' comes before type='sticker')
      sql`CASE WHEN ${generationJobs.type} = 'character' THEN 0 ELSE 1 END`,
      // Then by creation time (oldest first)
      asc(generationJobs.createdAt)
    )
    .limit(1);

  const job = nextJobs[0];
  if (!job) {
    return null;
  }

  return job.id;
}

/**
 * Character job metadata stored in refinedPrompt as JSON
 */
interface CharacterJobMetadata {
  name: string;
  additionalDetails?: string;
}

/**
 * Parse character job metadata from refinedPrompt
 * Handles both old format (plain string) and new format (JSON)
 */
function parseCharacterJobMetadata(refinedPrompt: string | null): CharacterJobMetadata {
  if (!refinedPrompt) {
    return { name: 'New Character' };
  }
  try {
    const parsed = JSON.parse(refinedPrompt);
    if (typeof parsed === 'object' && parsed.name) {
      return parsed as CharacterJobMetadata;
    }
  } catch {
    // Not JSON, treat as plain name string (backwards compatibility)
  }
  return { name: refinedPrompt };
}

/**
 * Create a new character generation job
 *
 * @param userId - The user ID
 * @param tempPhotoPath - Path to the temporary photo file
 * @param characterName - Name for the character
 * @param additionalDetails - Optional additional appearance details
 */
export async function createCharacterJob(
  userId: string,
  tempPhotoPath: string,
  characterName?: string,
  additionalDetails?: string
): Promise<string> {
  const jobId = randomUUID();

  const metadata: CharacterJobMetadata = {
    name: characterName || 'New Character',
    additionalDetails: additionalDetails || undefined
  };

  await db.insert(generationJobs).values({
    id: jobId,
    userId,
    type: 'character',
    status: 'queued',
    userPrompt: tempPhotoPath, // Store the temp path
    refinedPrompt: JSON.stringify(metadata) // Store character metadata as JSON
  });

  // Start processing in the background
  processJob(jobId).catch(console.error);

  return jobId;
}

/**
 * Create a new sticker generation job
 * Jobs are created immediately when a request comes in.
 * AI validation and prompt enhancement happen during job processing,
 * ensuring costs are tracked even for rejected prompts.
 *
 * @param userId - The user ID
 * @param userPrompt - Original user prompt
 * @param characterIds - Character IDs to use in the sticker
 */
export async function createStickerJob(
  userId: string,
  userPrompt: string,
  characterIds: string[]
): Promise<string> {
  const jobId = randomUUID();

  await db.insert(generationJobs).values({
    id: jobId,
    userId,
    type: 'sticker',
    status: 'queued',
    userPrompt,
    characterIds: JSON.stringify(characterIds)
  });

  // Start processing in the background
  processJob(jobId).catch(console.error);

  return jobId;
}
