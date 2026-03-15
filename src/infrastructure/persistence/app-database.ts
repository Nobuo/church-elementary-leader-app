/**
 * Database adapter interface — abstracts over better-sqlite3 and bun:sqlite.
 * Both libraries implement this subset of the API.
 */

export interface AppStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface AppDatabase {
  prepare(sql: string): AppStatement;
  exec(sql: string): void;
  transaction<T>(fn: () => T): () => T;
}
