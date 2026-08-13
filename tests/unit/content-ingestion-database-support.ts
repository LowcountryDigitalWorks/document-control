import { DatabaseSync } from "node:sqlite";
import {
  applyMigrationFiles,
  loadOrderedMigrations,
} from "../../scripts/migration-files";
import { AuthorizedContentIngestionService } from "../../src/application/authorized-content-ingestion-service";
import {
  ContentIngestionService,
  type ContentValidationResult,
  type ContentValidator,
} from "../../src/application/content-ingestion";
import type {
  ContentObject,
  ContentStore,
  DatabaseProvider,
  DatabaseResult,
  DatabaseStatement,
} from "../../src/application/ports";
import { DatabaseAuthorizationPolicy } from "../../src/infrastructure/database-authorization-policy";
import { DatabaseContentIngestionRepository } from "../../src/infrastructure/database-content-ingestion-repository";
import { sha256 } from "../../src/domain/hash";
import { SequenceIds } from "./content-ingestion-memory-support";

type Param = string | number | null;
export const timestamp = "2026-08-13T16:00:00.000Z";

class SqliteProvider implements DatabaseProvider {
  public constructor(private readonly database: DatabaseSync) {}
  public async query<Row>(
    sql: string,
    parameters: readonly unknown[] = [],
  ): Promise<readonly Row[]> {
    return this.database
      .prepare(sql)
      .all(...parameters.map((v) => v as Param)) as Row[];
  }
  public async execute(
    sql: string,
    parameters: readonly unknown[] = [],
  ): Promise<DatabaseResult> {
    const result = this.database
      .prepare(sql)
      .run(...parameters.map((v) => v as Param));
    return {
      changes: Number(result.changes),
      lastRowId: Number(result.lastInsertRowid),
    };
  }
  public async executeBatch(
    statements: readonly DatabaseStatement[],
  ): Promise<readonly DatabaseResult[]> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results: DatabaseResult[] = [];
      for (const statement of statements)
        results.push(
          await this.execute(statement.sql, statement.parameters ?? []),
        );
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

class MemoryStore implements ContentStore {
  private readonly objects = new Map<string, ContentObject>();
  public async get(
    key: string,
    expectedHash: string,
  ): Promise<ContentObject | null> {
    const object = this.objects.get(key);
    if (!object) return null;
    if (object.contentHash !== expectedHash) throw new Error("hash");
    return { ...object, bytes: object.bytes.slice(0) };
  }
  public async create(key: string, object: ContentObject): Promise<void> {
    if (this.objects.has(key)) throw new Error("duplicate");
    if ((await sha256(new Uint8Array(object.bytes))) !== object.contentHash)
      throw new Error("hash");
    this.objects.set(key, { ...object, bytes: object.bytes.slice(0) });
  }
}
class AcceptPdf implements ContentValidator {
  public async validate(): Promise<ContentValidationResult> {
    return { outcome: "accepted", acceptedMediaType: "application/pdf" };
  }
}

export async function databaseFixture() {
  const database = new DatabaseSync(":memory:");
  applyMigrationFiles(database, await loadOrderedMigrations());
  seed(database);
  const provider = new SqliteProvider(database);
  const repository = new DatabaseContentIngestionRepository(provider);
  const ingestion = new ContentIngestionService(
    repository,
    new MemoryStore(),
    new AcceptPdf(),
    new SequenceIds(),
    "r2",
  );
  return {
    database,
    repository,
    service: new AuthorizedContentIngestionService(
      ingestion,
      new DatabaseAuthorizationPolicy(provider),
    ),
  };
}

export function run(
  database: DatabaseSync,
  sql: string,
  ...parameters: Param[]
): void {
  database.prepare(sql).run(...parameters);
}

function seed(database: DatabaseSync): void {
  run(
    database,
    "INSERT INTO identity_subjects (id, display_name, provider, provider_subject, created_at) VALUES (?, ?, 'external', ?, ?)",
    "subject-a",
    "Subject A",
    "subject-a",
    timestamp,
  );
  for (const [tenant, workspace] of [
    ["tenant-a", "workspace-a"],
    ["tenant-b", "workspace-b"],
  ] as const) {
    run(
      database,
      "INSERT INTO tenants (id, name, slug, created_at) VALUES (?, ?, ?, ?)",
      tenant,
      tenant,
      tenant,
      timestamp,
    );
    run(
      database,
      "INSERT INTO workspaces (id, tenant_id, name, created_at) VALUES (?, ?, ?, ?)",
      workspace,
      tenant,
      workspace,
      timestamp,
    );
  }
  run(
    database,
    "INSERT INTO tenant_memberships (id, tenant_id, subject_id, status, created_at) VALUES (?, ?, ?, 'active', ?)",
    "membership-a",
    "tenant-a",
    "subject-a",
    timestamp,
  );
  run(
    database,
    "INSERT INTO role_bindings (id, role_definition_id, subject_id, tenant_id, workspace_id, created_at) VALUES (?, 'role-author', ?, ?, ?, ?)",
    "binding-a",
    "subject-a",
    "tenant-a",
    "workspace-a",
    timestamp,
  );
}
