// Database schema for the Civitai-Stickerize example app.
//
// Auth model: Civitai OAuth only. Users are created on first OAuth callback
// and identified by their Civitai user id stored on `users.oauthId`. Long-
// lived Civitai access/refresh tokens are kept in `users.civitai_tokens` as
// a sealed (AES-256-GCM) JSON blob — read it exclusively through
// `loadCivitaiSession()` in `$lib/server/auth/civitai.ts`.

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ============================================================================
// Users
// ============================================================================

export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // UUID
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  profilePhotoUrl: text('profile_photo_url'),
  oauthProvider: text('oauth_provider'), // 'civitai' for this build
  oauthId: text('oauth_id'), // Provider's user id
  // Sealed JSON of Civitai OAuthTokens. Decrypt only via loadCivitaiSession().
  civitaiTokens: text('civitai_tokens'),
  hasReceivedWelcomeSticker: integer('has_received_welcome_sticker', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// ============================================================================
// Characters & Stickers
// ============================================================================

export const characters = sqliteTable('characters', {
  id: text('id').primaryKey(), // UUID
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // Max 30 chars, spaces allowed
  additionalDetails: text('additional_details'), // Max 100 chars, optional appearance details
  stickerImageUrl: text('sticker_image_url').notNull(), // Storage path
  geminiFileId: text('gemini_file_id'), // Gemini File API ID for reuse (fallback path)
  geminiFileExpiry: integer('gemini_file_expiry', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const stickers = sqliteTable('stickers', {
  id: text('id').primaryKey(), // UUID
  jobId: text('job_id').notNull(), // Links to GenerationJob
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  characterIds: text('character_ids').notNull().default('[]'), // JSON array of character IDs (loose reference)
  prompt: text('prompt').notNull(), // User's original prompt
  imageUrl: text('image_url').notNull(), // Storage path
  costCents: integer('cost_cents').notNull().default(0), // Total generation cost
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// ============================================================================
// Generation Jobs
// ============================================================================

export const generationJobs = sqliteTable('generation_jobs', {
  id: text('id').primaryKey(), // UUID
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'character' | 'sticker'
  status: text('status').notNull().default('queued'), // 'queued' | 'processing' | 'complete' | 'failed'

  // Input
  userPrompt: text('user_prompt').notNull(), // Original prompt from user
  refinedPrompt: text('refined_prompt'), // LLM-processed prompt sent to image generation
  characterIds: text('character_ids'), // JSON array for sticker generation
  chromaKeyColor: text('chroma_key_color'), // AI-selected chroma key color (e.g., '#00FF00')

  // Output (populated on completion)
  resultId: text('result_id'), // Character ID or Sticker ID
  error: text('error'), // Error message if failed
  isRetryable: integer('is_retryable', { mode: 'boolean' }), // null = pending, false = content issue, true = transient error

  // Retry tracking
  attempts: integer('attempts').notNull().default(0),

  // Recovery/checkpoint tracking
  // Character: 'validated' | 'generated' | null
  // Sticker: 'prompt_processed' | 'generated' | null
  checkpoint: text('checkpoint'),
  tempGeneratedImage: text('temp_generated_image'),

  // Cost tracking
  llmCostCents: integer('llm_cost_cents'), // OpenRouter LLM cost
  imageCostCents: integer('image_cost_cents'), // Image generation cost
  buzzCost: integer('buzz_cost'), // Actual Civitai Buzz spent (null if Gemini fallback)

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// ============================================================================
// Type Exports
// ============================================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Character = typeof characters.$inferSelect;
export type NewCharacter = typeof characters.$inferInsert;
export type Sticker = typeof stickers.$inferSelect;
export type NewSticker = typeof stickers.$inferInsert;
export type GenerationJob = typeof generationJobs.$inferSelect;
export type NewGenerationJob = typeof generationJobs.$inferInsert;
