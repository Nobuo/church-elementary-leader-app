/**
 * データベースアダプターのインターフェース。better-sqlite3 と bun:sqlite の差を吸収する。
 * どちらのライブラリも、この API の一部を実装している。
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
