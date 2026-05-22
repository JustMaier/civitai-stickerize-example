/**
 * Mock data module for component previews and visual-regression tests.
 * Type definitions intentionally mirror the runtime schema in
 * `$lib/server/db/schema.ts` so previews stay representative without
 * pulling server-only code into the client bundle.
 */

// ============================================================================
// Type Definitions (matching data models from technical architecture)
// ============================================================================

export interface User {
  id: string;
  email: string;
  name: string;
  profilePhotoUrl?: string;
  oauthProvider?: 'civitai';
  oauthId?: string;
  createdAt: Date;
}

export interface Character {
  id: string;
  userId: string;
  name: string;
  stickerImagePath: string;
  createdAt: Date;
}

export interface Sticker {
  id: string;
  jobId: string;
  userId: string;
  characterIds: string[];
  prompt: string;
  imagePath: string;
  costCents: number;
  createdAt: Date;
}

export interface GenerationJob {
  id: string;
  userId: string;
  type: 'character' | 'sticker';
  status: 'queued' | 'processing' | 'complete' | 'failed';
  inputPrompt: string;
  characterIds?: string[];
  resultId?: string;
  error?: string;
  attempts: number;
  llmCostCents?: number;
  imageCostCents?: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Mock Users
// ============================================================================

export const mockUsers: User[] = [
  {
    id: 'user-001',
    email: 'justin@example.com',
    name: 'Justin',
    profilePhotoUrl: undefined,
    oauthProvider: 'civitai',
    oauthId: 'civitai-1',
    createdAt: new Date('2024-01-15T10:00:00Z')
  }
];

// ============================================================================
// Mock Characters
// Using sticker images from static/images/stickers/
// ============================================================================

export const mockCharacters: Character[] = [
  // Justin's characters
  {
    id: 'char-justin-001',
    userId: 'user-001',
    name: 'JustinCool',
    stickerImagePath: '/images/stickers/justin-cool.webp',
    createdAt: new Date('2024-01-16T09:00:00Z')
  },
  {
    id: 'char-justin-002',
    userId: 'user-001',
    name: 'Justin',
    stickerImagePath: '/images/stickers/justin.webp',
    createdAt: new Date('2024-01-17T11:30:00Z')
  },
  {
    id: 'char-justin-003',
    userId: 'user-001',
    name: 'JustinWork',
    stickerImagePath: '/images/stickers/justin-work.webp',
    createdAt: new Date('2024-01-18T08:15:00Z')
  },
  {
    id: 'char-justin-004',
    userId: 'user-001',
    name: 'JustinFitness',
    stickerImagePath: '/images/stickers/justin-fitness.webp',
    createdAt: new Date('2024-01-19T16:45:00Z')
  }
];

// ============================================================================
// Mock Stickers
// ============================================================================

export const mockStickers: Sticker[] = [
  {
    id: 'sticker-001',
    jobId: 'job-001',
    userId: 'user-001',
    characterIds: ['char-justin-001'],
    prompt: 'Justin celebrating with confetti',
    imagePath: '/images/stickers/justin-cool.webp',
    costCents: 5,
    createdAt: new Date('2024-01-20T10:00:00Z')
  },
  {
    id: 'sticker-002',
    jobId: 'job-002',
    userId: 'user-001',
    characterIds: ['char-justin-002'],
    prompt: 'Justin giving a thumbs up',
    imagePath: '/images/stickers/justin.webp',
    costCents: 5,
    createdAt: new Date('2024-01-21T14:30:00Z')
  },
  {
    id: 'sticker-003',
    jobId: 'job-003',
    userId: 'user-001',
    characterIds: ['char-justin-003'],
    prompt: 'Justin at work looking stressed with coffee',
    imagePath: '/images/stickers/justin-work.webp',
    costCents: 5,
    createdAt: new Date('2024-01-22T09:15:00Z')
  },
  {
    id: 'sticker-004',
    jobId: 'job-004',
    userId: 'user-001',
    characterIds: ['char-justin-004'],
    prompt: 'Justin lifting weights at the gym',
    imagePath: '/images/stickers/justin-fitness.webp',
    costCents: 5,
    createdAt: new Date('2024-01-23T17:00:00Z')
  },
  {
    id: 'sticker-009',
    jobId: 'job-009',
    userId: 'user-001',
    characterIds: ['char-justin-001', 'char-justin-002'],
    prompt: 'Two Justins high-fiving each other',
    imagePath: '/images/stickers/justin-cool.webp',
    costCents: 8,
    createdAt: new Date('2024-03-02T10:30:00Z')
  }
];

// ============================================================================
// Mock Generation Jobs (in different states)
// ============================================================================

export const mockJobs: GenerationJob[] = [
  // Completed jobs
  {
    id: 'job-001',
    userId: 'user-001',
    type: 'sticker',
    status: 'complete',
    inputPrompt: 'Justin celebrating with confetti',
    characterIds: ['char-justin-001'],
    resultId: 'sticker-001',
    error: undefined,
    attempts: 1,
    llmCostCents: 2,
    imageCostCents: 3,
    createdAt: new Date('2024-01-20T09:58:00Z'),
    updatedAt: new Date('2024-01-20T10:00:00Z')
  },
  {
    id: 'job-002',
    userId: 'user-001',
    type: 'sticker',
    status: 'complete',
    inputPrompt: 'Justin giving a thumbs up',
    characterIds: ['char-justin-002'],
    resultId: 'sticker-002',
    error: undefined,
    attempts: 1,
    llmCostCents: 2,
    imageCostCents: 3,
    createdAt: new Date('2024-01-21T14:28:00Z'),
    updatedAt: new Date('2024-01-21T14:30:00Z')
  },
  // Queued job
  {
    id: 'job-011',
    userId: 'user-001',
    type: 'sticker',
    status: 'queued',
    inputPrompt: 'Justin surfing on a giant wave',
    characterIds: ['char-justin-001'],
    resultId: undefined,
    error: undefined,
    attempts: 0,
    llmCostCents: undefined,
    imageCostCents: undefined,
    createdAt: new Date('2024-03-04T09:00:00Z'),
    updatedAt: new Date('2024-03-04T09:00:00Z')
  },
  // Failed job
  {
    id: 'job-013',
    userId: 'user-001',
    type: 'sticker',
    status: 'failed',
    inputPrompt: 'Justin doing something inappropriate',
    characterIds: ['char-justin-001'],
    resultId: undefined,
    error: 'Content policy violation detected in prompt',
    attempts: 1,
    llmCostCents: 2,
    imageCostCents: undefined,
    createdAt: new Date('2024-03-04T08:00:00Z'),
    updatedAt: new Date('2024-03-04T08:01:00Z')
  },
  // Character creation job (complete)
  {
    id: 'job-015',
    userId: 'user-001',
    type: 'character',
    status: 'complete',
    inputPrompt: 'Create sticker character from photo',
    characterIds: undefined,
    resultId: 'char-justin-001',
    error: undefined,
    attempts: 1,
    llmCostCents: 3,
    imageCostCents: 5,
    createdAt: new Date('2024-01-16T08:55:00Z'),
    updatedAt: new Date('2024-01-16T09:00:00Z')
  }
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get a mock user by ID
 */
export function getMockUser(id: string): User | undefined {
  return mockUsers.find((user) => user.id === id);
}

/**
 * Get a mock user by email
 */
export function getMockUserByEmail(email: string): User | undefined {
  return mockUsers.find((user) => user.email === email);
}

/**
 * Get a mock character by ID
 */
export function getMockCharacter(id: string): Character | undefined {
  return mockCharacters.find((char) => char.id === id);
}

/**
 * Get all mock characters for a user
 */
export function getMockCharactersByUser(userId: string): Character[] {
  return mockCharacters.filter((char) => char.userId === userId);
}

/**
 * Get a mock sticker by ID
 */
export function getMockSticker(id: string): Sticker | undefined {
  return mockStickers.find((sticker) => sticker.id === id);
}

/**
 * Get all mock stickers for a user
 */
export function getMockStickersByUser(userId: string): Sticker[] {
  return mockStickers.filter((sticker) => sticker.userId === userId);
}

/**
 * Get mock stickers for a user with pagination
 */
export function getMockStickersByUserPaginated(
  userId: string,
  limit: number = 20,
  cursor?: string
): { stickers: Sticker[]; nextCursor: string | null } {
  const userStickers = mockStickers
    .filter((sticker) => sticker.userId === userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  let startIndex = 0;
  if (cursor) {
    const cursorIndex = userStickers.findIndex((s) => s.id === cursor);
    if (cursorIndex !== -1) {
      startIndex = cursorIndex + 1;
    }
  }

  const paginatedStickers = userStickers.slice(startIndex, startIndex + limit);
  const nextCursor =
    startIndex + limit < userStickers.length
      ? paginatedStickers[paginatedStickers.length - 1]?.id ?? null
      : null;

  return { stickers: paginatedStickers, nextCursor };
}

/**
 * Get a mock generation job by ID
 */
export function getMockJob(id: string): GenerationJob | undefined {
  return mockJobs.find((job) => job.id === id);
}

/**
 * Get all mock jobs for a user
 */
export function getMockJobsByUser(userId: string): GenerationJob[] {
  return mockJobs.filter((job) => job.userId === userId);
}

/**
 * Get active (queued or processing) jobs for a user
 */
export function getMockActiveJobsByUser(userId: string): GenerationJob[] {
  return mockJobs.filter(
    (job) =>
      job.userId === userId &&
      (job.status === 'queued' || job.status === 'processing')
  );
}

/**
 * Get stickers that feature a specific character
 */
export function getMockStickersByCharacter(characterId: string): Sticker[] {
  return mockStickers.filter((sticker) =>
    sticker.characterIds.includes(characterId)
  );
}
