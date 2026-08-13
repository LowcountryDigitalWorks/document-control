import { readdir, readFile } from "node:fs/promises";

const migrationNamePattern = /^(\d{4})_[a-z0-9_]+\.sql$/u;

export interface OrderedMigration {
  name: string;
  ordinal: number;
  sql: string;
}

export interface SqlExecutor {
  exec(sql: string): void;
}

export const defaultMigrationDirectory = new URL(
  "../migrations/",
  import.meta.url,
);

export function assertContiguousMigrationSequence(
  names: readonly string[],
): void {
  if (names.length === 0) {
    throw new Error("No ordered D1/SQLite migrations were found.");
  }

  names.forEach((name, index) => {
    const match = migrationNamePattern.exec(name);
    if (!match?.[1]) {
      throw new Error(`Invalid migration filename: ${name}`);
    }

    const expectedOrdinal = index + 1;
    const actualOrdinal = Number(match[1]);
    if (actualOrdinal !== expectedOrdinal) {
      const expectedPrefix = expectedOrdinal.toString().padStart(4, "0");
      throw new Error(
        `Migration sequence is not contiguous: expected ${expectedPrefix} at position ${expectedOrdinal}, found ${name}.`,
      );
    }
  });
}

export async function loadOrderedMigrations(
  directory = defaultMigrationDirectory,
): Promise<readonly OrderedMigration[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const sqlNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  assertContiguousMigrationSequence(sqlNames);

  return Promise.all(
    sqlNames.map(async (name) => ({
      name,
      ordinal: Number(name.slice(0, 4)),
      sql: await readFile(new URL(name, directory), "utf8"),
    })),
  );
}

export function applyMigrationFiles(
  database: SqlExecutor,
  migrations: readonly Pick<OrderedMigration, "name" | "sql">[],
): void {
  for (const migration of migrations) {
    try {
      database.exec(migration.sql);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${migration.name} failed: ${detail}`, {
        cause: error,
      });
    }
  }
}
