import type { AppDatabase } from '../app-database.js';

export interface Migration {
  version: number;
  description: string;
  up: (db: AppDatabase) => void;
  down: (db: AppDatabase) => void;
}
