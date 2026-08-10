import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

type SqlValue = string | number | bigint | Uint8Array | null;

interface TestPreparedStatement {
  bind(...values: unknown[]): TestPreparedStatement;
  all<Row>(): Promise<{
    success: true;
    results: Row[];
    meta: { changes: number; last_row_id: number };
  }>;
  run(): Promise<{
    success: true;
    results: unknown[];
    meta: { changes: number; last_row_id: number };
  }>;
}

export async function createE2eD1Database(): Promise<D1Database> {
  const database = new DatabaseSync(":memory:");
  const migrations = await Promise.all([
    readFile(
      new URL("../migrations/0001_initial.sql", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../migrations/0002_system_role_permissions.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../migrations/0003_workflow_definition_immutability.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  for (const migration of migrations) {
    database.exec(migration);
  }

  const createPrepared = (
    sql: string,
    values: readonly unknown[] = [],
  ): TestPreparedStatement => ({
    bind: (...nextValues: unknown[]) => createPrepared(sql, nextValues),
    all: async <Row>() => {
      const results = database
        .prepare(sql)
        .all(...toSqlValues(values)) as Row[];
      return {
        success: true,
        results,
        meta: { changes: 0, last_row_id: 0 },
      };
    },
    run: async () => {
      const result = database.prepare(sql).run(...toSqlValues(values));
      return {
        success: true,
        results: [],
        meta: {
          changes: Number(result.changes),
          last_row_id: Number(result.lastInsertRowid),
        },
      };
    },
  });

  const binding = {
    prepare: (sql: string) => createPrepared(sql),
    batch: async (statements: readonly TestPreparedStatement[]) => {
      database.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) {
          results.push(await statement.run());
        }
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };

  return binding as unknown as D1Database;
}

function toSqlValues(values: readonly unknown[]): SqlValue[] {
  return values.map((value) => {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "bigint" ||
      value instanceof Uint8Array
    ) {
      return value;
    }
    throw new Error("Unsupported SQLite e2e parameter.");
  });
}
