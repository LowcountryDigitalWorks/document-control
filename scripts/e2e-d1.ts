import { readdir, readFile } from "node:fs/promises";
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
  const migrationDirectory = new URL("../migrations/", import.meta.url);
  const migrationNames = (await readdir(migrationDirectory))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
    .sort((left, right) => left.localeCompare(right));

  if (migrationNames.length === 0) {
    throw new Error(
      "No ordered D1/SQLite migrations were found for E2E setup.",
    );
  }

  for (const migrationName of migrationNames) {
    database.exec(
      await readFile(new URL(migrationName, migrationDirectory), "utf8"),
    );
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
