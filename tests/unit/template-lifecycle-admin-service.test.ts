import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type {
  DatabaseProvider,
  DatabaseResult,
  DatabaseStatement,
} from "../../src/application/ports";
import { TemplateLifecycleAdminService } from "../../src/application/template-lifecycle-admin-service";

const timestamp = "2026-08-10T23:55:00.000Z";
const hash = "a".repeat(64);
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
    this.database.exec("BEGIN");
    try {
      const results = statements.map((item) => {
        const result = this.database
          .prepare(item.sql)
          .run(...toSqlValues(item.parameters ?? []));
        return {
          changes: Number(result.changes),
          lastRowId: Number(result.lastInsertRowid),
        };
      });
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

async function createHarness(): Promise<{
  database: DatabaseSync;
  service: TemplateLifecycleAdminService;
}> {
  const database = new DatabaseSync(":memory:");
  for (const file of [
    "0001_initial.sql",
    "0002_system_role_permissions.sql",
    "0003_workflow_definition_immutability.sql",
    "0004_template_version_lifecycle_integrity.sql",
  ]) {
    database.exec(
      await readFile(
        new URL(`../../migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  }
  database.exec(`
    INSERT INTO tenants (id, name, slug, created_at)
    VALUES ('tenant-1', 'Tenant One', 'tenant-one', '${timestamp}');
    INSERT INTO workspaces (id, tenant_id, name, created_at)
    VALUES ('workspace-1', 'tenant-1', 'Operations', '${timestamp}');
    INSERT INTO identity_subjects (id, display_name, provider, provider_subject, created_at)
    VALUES
      ('creator-1', 'Creator One', 'external', 'creator-1', '${timestamp}'),
      ('manager-1', 'Manager One', 'external', 'manager-1', '${timestamp}');
    INSERT INTO tenant_memberships (id, tenant_id, subject_id, status, created_at)
    VALUES ('membership-manager', 'tenant-1', 'manager-1', 'active', '${timestamp}');
    INSERT INTO templates (id, tenant_id, workspace_id, name, current_version, created_at)
    VALUES ('template-1', 'tenant-1', 'workspace-1', 'Checklist', 1, '${timestamp}');
    INSERT INTO template_versions
      (id, tenant_id, template_id, version_number, lifecycle_state, content_hash,
       content_provider, content_key, created_by_subject_id, provenance, created_at)
    VALUES
      ('template-version-1', 'tenant-1', 'template-1', 1, 'draft', '${hash}',
       'r2', 'tenant-1/workspace-1/template/template-1/version/1/object',
       'creator-1', 'synthetic', '${timestamp}');
  `);
  return {
    database,
    service: new TemplateLifecycleAdminService(
      new SqliteDatabaseProvider(database),
    ),
  };
}

describe("TemplateLifecycleAdminService", () => {
  it("moves a version through the controlled lifecycle without changing content identity", async () => {
    const { database, service } = await createHarness();
    let version = await service.transitionVersion({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      templateVersionId: "template-version-1",
      targetState: "review",
      actorSubjectId: "manager-1",
      auditEventId: "audit-review",
      occurredAt: "2026-08-10T23:56:00.000Z",
    });
    expect(version.lifecycleState).toBe("review");

    await service.transitionVersion({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      templateVersionId: "template-version-1",
      targetState: "approved",
      actorSubjectId: "manager-1",
      auditEventId: "audit-approved",
      occurredAt: "2026-08-10T23:57:00.000Z",
    });
    version = await service.transitionVersion({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      templateVersionId: "template-version-1",
      targetState: "published",
      actorSubjectId: "manager-1",
      auditEventId: "audit-published",
      occurredAt: "2026-08-10T23:58:00.000Z",
    });
    expect(version.lifecycleState).toBe("published");
    expect(version.publishedAt).toBe("2026-08-10T23:58:00.000Z");
    expect(version.contentHash).toBe(hash);
    expect(version.provenance).toBe("synthetic");

    database.exec(`
      INSERT INTO documents
        (id, tenant_id, workspace_id, title, status, current_version_id,
         source_template_id, source_template_version, source_template_hash,
         template_provenance, created_at, updated_at)
      VALUES
        ('document-1', 'tenant-1', 'workspace-1', 'Created from template', 'draft', NULL,
         'template-1', 1, '${hash}', 'approved_template', '${timestamp}', '${timestamp}');
    `);

    version = await service.transitionVersion({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      templateVersionId: "template-version-1",
      targetState: "superseded",
      actorSubjectId: "manager-1",
      auditEventId: "audit-superseded",
      occurredAt: "2026-08-10T23:59:00.000Z",
    });
    expect(version.lifecycleState).toBe("superseded");
    expect(version.supersededAt).toBe("2026-08-10T23:59:00.000Z");
    expect(version.sourceDocumentCount).toBe(1);
    expect(
      database
        .prepare(
          "SELECT source_template_id, source_template_version, source_template_hash FROM documents WHERE id = 'document-1'",
        )
        .get(),
    ).toEqual({
      source_template_id: "template-1",
      source_template_version: 1,
      source_template_hash: hash,
    });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM audit_events").get(),
    ).toEqual({ count: 4 });
  });

  it("rejects direct content identity changes, deletion, and invalid lifecycle jumps", async () => {
    const { database } = await createHarness();
    expect(() =>
      database
        .prepare("UPDATE template_versions SET content_hash = ? WHERE id = ?")
        .run("b".repeat(64), "template-version-1"),
    ).toThrow(/content identity and provenance are immutable/u);
    expect(() =>
      database
        .prepare(
          "UPDATE template_versions SET lifecycle_state = 'published' WHERE id = ?",
        )
        .run("template-version-1"),
    ).toThrow(/invalid template lifecycle transition/u);
    expect(() =>
      database
        .prepare("DELETE FROM template_versions WHERE id = ?")
        .run("template-version-1"),
    ).toThrow(/cannot be deleted/u);
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
