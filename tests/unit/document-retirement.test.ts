import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { DocumentWorkflowService } from "../../src/application/document-workflow-service";
import type {
  DatabaseProvider,
  DatabaseResult,
  DatabaseStatement,
} from "../../src/application/ports";
import { buildDocumentVersionContentKey } from "../../src/infrastructure/content-key";

type SqlValue = string | number | bigint | Uint8Array | null;
const timestamp = "2026-08-11T23:45:00.000Z";
const tenantId = "tenant-retirement";
const workspaceId = "workspace-records";
const documentId = "document-approved";
const versionId = "document-approved-v1";
const hash = `sha256:${"a".repeat(64)}`;

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
  service: DocumentWorkflowService;
}> {
  const database = new DatabaseSync(":memory:");
  for (const migration of [
    "0001_initial.sql",
    "0002_system_role_permissions.sql",
    "0008_controlled_document_retirement.sql",
  ]) {
    database.exec(
      await readFile(
        new URL(`../../migrations/${migration}`, import.meta.url),
        "utf8",
      ),
    );
  }

  database.exec(`
    INSERT INTO identity_subjects (id, display_name, provider, provider_subject, created_at)
    VALUES
      ('owner-1', 'Owner One', 'external', 'owner-1', '${timestamp}'),
      ('approver-1', 'Approver One', 'external', 'approver-1', '${timestamp}');
    INSERT INTO tenants (id, name, slug, created_at)
    VALUES ('${tenantId}', 'Retirement Tenant', 'retirement-tenant', '${timestamp}');
    INSERT INTO workspaces (id, tenant_id, name, created_at)
    VALUES ('${workspaceId}', '${tenantId}', 'Records', '${timestamp}');
    INSERT INTO tenant_memberships (id, tenant_id, subject_id, status, created_at)
    VALUES
      ('membership-owner', '${tenantId}', 'owner-1', 'active', '${timestamp}'),
      ('membership-approver', '${tenantId}', 'approver-1', 'active', '${timestamp}');
    INSERT INTO documents
      (id, tenant_id, workspace_id, title, status, current_version_id,
       source_template_id, source_template_version, source_template_hash,
       template_provenance, created_at, updated_at)
    VALUES
      ('${documentId}', '${tenantId}', '${workspaceId}', 'Approved Record', 'approved', NULL,
       NULL, NULL, NULL, 'none', '${timestamp}', '${timestamp}');
    INSERT INTO document_versions
      (id, tenant_id, document_id, version_number, content_hash, content_provider,
       content_key, created_by_subject_id, created_at)
    VALUES
      ('${versionId}', '${tenantId}', '${documentId}', 1, '${hash}', 'r2',
       'tenants/${tenantId}/workspaces/${workspaceId}/documents/${documentId}/versions/${versionId}/content',
       'owner-1', '${timestamp}');
    UPDATE documents SET current_version_id = '${versionId}' WHERE id = '${documentId}';
    INSERT INTO workflow_definitions (id, tenant_id, name, version, definition_json, created_at)
    VALUES
      ('workflow-approval', '${tenantId}', 'Approval', 1,
       '{"states":["draft","approved"],"transitions":[{"from":"draft","to":"approved"}]}',
       '${timestamp}');
    INSERT INTO workflow_instances
      (id, tenant_id, document_id, document_version_id, workflow_definition_id,
       workflow_definition_version, state, created_at, updated_at)
    VALUES
      ('workflow-instance-1', '${tenantId}', '${documentId}', '${versionId}', 'workflow-approval',
       1, 'approved', '${timestamp}', '${timestamp}');
    INSERT INTO approvals
      (id, tenant_id, document_id, document_version_id, content_hash, actor_subject_id,
       workflow_instance_id, workflow_definition_id, workflow_definition_version, approved_at)
    VALUES
      ('approval-1', '${tenantId}', '${documentId}', '${versionId}', '${hash}', 'approver-1',
       'workflow-instance-1', 'workflow-approval', 1, '${timestamp}');
  `);

  return {
    database,
    service: new DocumentWorkflowService(new SqliteDatabaseProvider(database)),
  };
}

describe("controlled document retirement", () => {
  it("retires approved exact evidence and blocks later mutation while preserving history", async () => {
    const { database, service } = await createHarness();

    const retired = await service.retireDocument({
      tenantId,
      documentId,
      actorSubjectId: "owner-1",
      auditEventId: "audit-retired",
      occurredAt: timestamp,
    });

    expect(retired.status).toBe("retired");
    expect(
      database
        .prepare("SELECT status FROM documents WHERE id = ?")
        .get(documentId),
    ).toEqual({ status: "retired" });
    expect(
      database
        .prepare("SELECT event_type FROM audit_events WHERE id = ?")
        .get("audit-retired"),
    ).toEqual({ event_type: "document.retired" });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM approvals").get(),
    ).toEqual({ count: 1 });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM document_versions").get(),
    ).toEqual({ count: 1 });

    await expect(
      service.createChangedVersion({
        tenantId,
        documentId,
        versionId: "document-approved-v2",
        contentHash: `sha256:${"b".repeat(64)}`,
        contentKey: buildDocumentVersionContentKey({
          tenantId,
          workspaceId,
          documentId,
          versionId: "document-approved-v2",
        }),
        actorSubjectId: "owner-1",
        auditEventId: "audit-version-after-retire",
        occurredAt: timestamp,
      }),
    ).rejects.toThrow(/Retired documents are historical/iu);

    expect(() =>
      database.exec(
        `UPDATE documents SET status = 'approved' WHERE id = '${documentId}';`,
      ),
    ).toThrow(/retirement is terminal/iu);
    expect(() =>
      database.exec(`
        INSERT INTO document_versions
          (id, tenant_id, document_id, version_number, content_hash, content_provider,
           content_key, created_by_subject_id, created_at)
        VALUES
          ('direct-v2', '${tenantId}', '${documentId}', 2, 'sha256:${"c".repeat(64)}', 'r2',
           'direct-key', 'owner-1', '${timestamp}');
      `),
    ).toThrow(/cannot receive new versions/iu);
    expect(() =>
      database.exec(
        `UPDATE workflow_instances SET state = 'draft' WHERE id = 'workflow-instance-1';`,
      ),
    ).toThrow(/historical and cannot change/iu);
  });

  it("requires approved status plus exact current-version approval evidence", async () => {
    const { database, service } = await createHarness();
    database.exec("DELETE FROM approvals;");

    expect(() =>
      database.exec(
        `UPDATE documents SET status = 'retired' WHERE id = '${documentId}';`,
      ),
    ).toThrow(/exact current-version approval evidence/iu);

    await expect(
      service.retireDocument({
        tenantId,
        documentId,
        actorSubjectId: "owner-1",
        auditEventId: "audit-no-approval",
        occurredAt: timestamp,
      }),
    ).rejects.toThrow(/exact approval evidence/iu);

    database.exec(
      `UPDATE documents SET status = 'draft' WHERE id = '${documentId}';`,
    );
    await expect(
      service.retireDocument({
        tenantId,
        documentId,
        actorSubjectId: "owner-1",
        auditEventId: "audit-draft",
        occurredAt: timestamp,
      }),
    ).rejects.toThrow(/Only approved documents can be retired/iu);
  });

  it("grants document retirement to owners and administrators but not authors", async () => {
    const { database } = await createHarness();
    const rows = database
      .prepare(
        `SELECT role_key AS roleKey, permissions_json AS permissionsJson
         FROM role_definitions
         WHERE role_key IN ('tenant_admin', 'workspace_admin', 'document_owner', 'author')
         ORDER BY role_key`,
      )
      .all() as { roleKey: string; permissionsJson: string }[];

    const grants = new Map(
      rows.map((row) => [
        row.roleKey,
        JSON.parse(row.permissionsJson) as string[],
      ]),
    );
    expect(grants.get("tenant_admin")).toContain("document.retire");
    expect(grants.get("workspace_admin")).toContain("document.retire");
    expect(grants.get("document_owner")).toContain("document.retire");
    expect(grants.get("author")).not.toContain("document.retire");
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
