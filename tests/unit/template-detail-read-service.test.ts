import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type {
  DatabaseProvider,
  DatabaseResult,
  DatabaseStatement,
} from "../../src/application/ports";
import {
  TemplateDetailReadService,
  TemplateNotFoundError,
} from "../../src/application/template-detail-read-service";

const createdAt = "2026-08-12T16:00:00.000Z";
const publishedAt = "2026-08-12T16:10:00.000Z";
const secondCreatedAt = "2026-08-12T16:20:00.000Z";
const firstHash = `sha256:${"a".repeat(64)}`;
const secondHash = `sha256:${"b".repeat(64)}`;
type SqlValue = string | number | bigint | Uint8Array | null;

class SqliteDatabaseProvider implements DatabaseProvider {
  public constructor(private readonly database: DatabaseSync) {}

  public async query<Row>(
    sql: string,
    parameters: readonly unknown[] = [],
  ): Promise<readonly Row[]> {
    return this.database.prepare(sql).all(...toSqlValues(parameters)) as Row[];
  }

  public async execute(
    sql: string,
    parameters: readonly unknown[] = [],
  ): Promise<DatabaseResult> {
    const result = this.database.prepare(sql).run(...toSqlValues(parameters));
    return {
      changes: Number(result.changes),
      lastRowId: Number(result.lastInsertRowid),
    };
  }

  public async executeBatch(
    statements: readonly DatabaseStatement[],
  ): Promise<readonly DatabaseResult[]> {
    return Promise.all(
      statements.map((statement) =>
        this.execute(statement.sql, statement.parameters ?? []),
      ),
    );
  }
}

async function createService(): Promise<TemplateDetailReadService> {
  const database = new DatabaseSync(":memory:");
  database.exec(
    await readFile(
      new URL("../../migrations/0001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  database.exec(
    await readFile(
      new URL(
        "../../migrations/0002_system_role_permissions.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  database.exec(`
    INSERT INTO tenants (id, name, slug, created_at)
    VALUES
      ('tenant-1', 'Tenant One', 'tenant-one', '${createdAt}'),
      ('tenant-2', 'Tenant Two', 'tenant-two', '${createdAt}');
    INSERT INTO workspaces (id, tenant_id, name, created_at)
    VALUES
      ('workspace-1', 'tenant-1', 'Operations', '${createdAt}'),
      ('workspace-2', 'tenant-2', 'Other Workspace', '${createdAt}');
    INSERT INTO identity_subjects (id, display_name, provider, provider_subject, created_at)
    VALUES
      ('creator-1', 'Creator One', 'external', 'creator-1', '${createdAt}'),
      ('creator-2', 'Creator Two', 'external', 'creator-2', '${createdAt}');
    INSERT INTO templates (id, tenant_id, workspace_id, name, current_version, created_at)
    VALUES
      ('template-1', 'tenant-1', 'workspace-1', 'Controlled Checklist', NULL, '${createdAt}'),
      ('template-2', 'tenant-2', 'workspace-2', 'Other Template', NULL, '${createdAt}');
    INSERT INTO template_versions
      (id, tenant_id, template_id, version_number, lifecycle_state, content_hash,
       content_provider, content_key, created_by_subject_id, provenance, created_at,
       published_at, superseded_at)
    VALUES
      ('template-version-1', 'tenant-1', 'template-1', 1, 'published', '${firstHash}',
       'r2', 'tenant-1/private/template-v1', 'creator-1', 'Approved source package',
       '${createdAt}', '${publishedAt}', NULL),
      ('template-version-2', 'tenant-1', 'template-1', 2, 'draft', '${secondHash}',
       'r2', 'tenant-1/private/template-v2', 'creator-2', 'Annual controlled revision',
       '${secondCreatedAt}', NULL, NULL),
      ('other-version-1', 'tenant-2', 'template-2', 1, 'published', '${firstHash}',
       'r2', 'tenant-2/private/template-v1', 'creator-2', 'Other tenant provenance',
       '${createdAt}', '${publishedAt}', NULL);
    UPDATE templates SET current_version = 2 WHERE id = 'template-1';
    UPDATE templates SET current_version = 1 WHERE id = 'template-2';
  `);
  return new TemplateDetailReadService(new SqliteDatabaseProvider(database));
}

describe("TemplateDetailReadService", () => {
  it("returns newest-first immutable version evidence without storage or subject internals", async () => {
    const service = await createService();
    const detail = await service.getTemplateDetail(
      "tenant-1",
      "workspace-1",
      "template-1",
    );

    expect(detail).toMatchObject({
      id: "template-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      workspaceName: "Operations",
      name: "Controlled Checklist",
      currentVersion: 2,
      createdAt,
    });
    expect(detail.versions).toHaveLength(2);
    expect(detail.versions[0]).toEqual({
      id: "template-version-2",
      versionNumber: 2,
      lifecycleState: "draft",
      contentHash: secondHash,
      provenance: "Annual controlled revision",
      createdByName: "Creator Two",
      createdAt: secondCreatedAt,
      publishedAt: undefined,
      supersededAt: undefined,
      isCurrent: true,
    });
    expect(detail.versions[1]).toMatchObject({
      id: "template-version-1",
      versionNumber: 1,
      lifecycleState: "published",
      contentHash: firstHash,
      provenance: "Approved source package",
      createdByName: "Creator One",
      publishedAt,
      isCurrent: false,
    });

    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain("contentKey");
    expect(serialized).not.toContain("contentProvider");
    expect(serialized).not.toContain("createdBySubjectId");
    expect(serialized).not.toContain("tenant-1/private/template-v1");
  });

  it("does not resolve a template outside the requested tenant/workspace boundary", async () => {
    const service = await createService();
    await expect(
      service.getTemplateDetail("tenant-1", "workspace-1", "template-2"),
    ).rejects.toBeInstanceOf(TemplateNotFoundError);
    await expect(
      service.getTemplateDetail("tenant-1", "workspace-2", "template-1"),
    ).rejects.toBeInstanceOf(TemplateNotFoundError);
  });
});

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
    throw new Error("Unsupported SQLite test parameter.");
  });
}
