declare module "better-sqlite3" {
  interface Statement {
    run(...params: unknown[]): { changes: number };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  namespace Database {
    interface Database {
      exec(sql: string): void;
      prepare(sql: string): Statement;
      loadExtension(path: string): void;
      close(): void;
    }
  }

  interface DatabaseConstructor {
    new (path: string): Database.Database;
  }

  const Database: DatabaseConstructor;
  export default Database;
}
