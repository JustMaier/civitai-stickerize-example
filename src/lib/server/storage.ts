import { env } from '$env/dynamic/private';
import { join } from 'path';

// Base storage directory (defaults to ./storage)
export const STORAGE_DIR = env.STORAGE_PATH || './storage';

// Database path
export const DATABASE_PATH = env.DATABASE_PATH || join(STORAGE_DIR, 'stickerize.db');

// Subdirectories
export const CHARACTERS_DIR = join(STORAGE_DIR, 'characters');
export const STICKERS_DIR = join(STORAGE_DIR, 'stickers');
export const TEMP_DIR = join(STORAGE_DIR, 'temp');
export const TEMP_GENERATED_DIR = join(TEMP_DIR, 'generated');
