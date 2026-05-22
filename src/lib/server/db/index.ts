import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { DATABASE_PATH } from '../storage';

// Ensure storage directory exists
const storageDir = dirname(DATABASE_PATH);
if (!existsSync(storageDir)) {
	mkdirSync(storageDir, { recursive: true });
}

// Initialize SQLite connection
const sqlite = new Database(DATABASE_PATH);

// Enable foreign key constraints (MUST be set before any queries)
sqlite.pragma('foreign_keys = ON');

// Enable WAL mode for better concurrent performance
sqlite.pragma('journal_mode = WAL');

// Export drizzle instance with schema
export const db = drizzle(sqlite, { schema });

// Export the raw sqlite connection for advanced use cases
export { sqlite };
