declare module "better-sqlite3" {
  export interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  export interface Statement {
    run(...params: unknown[]): RunResult;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  export interface Database {
    exec(sql: string): void;
    prepare(sql: string): Statement;
    loadExtension(path: string, entrypoint?: string): void;
    close(): void;
  }

  interface DatabaseConstructor {
    new (path: string): Database;
  }

  const Database: DatabaseConstructor;
  export default Database;
}
