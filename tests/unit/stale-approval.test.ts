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

const tenantId = "tenant-stale-approval";
const workspaceId = "workspace-stale-approval";
const documentId = "document-stale-approval";
const timestamp = "2026-08-10T20:10:00.000Z";

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
      const results = statements.map((statement) => {
        const result = this.database
          .prepare(statement.sql)
          .run(...toSqlValues(statement.parameters ?? []));
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

async function createDatabase(): Promise<DatabaseSync> {
  const migration = await readFile(
    new URL("../../migrations/0001_initial.sql", import.meta.url),
    "utf8",
  );
  const database = new DatabaseSync(":memory:");
  database.exec(migration);
  return database;
}

function run(
  database: DatabaseSync,
  sql: string,
  ...parameters: SqlValue[]
): void {
  database.prepare(sql).run(...parameters);
}

function seedFoundation(database: DatabaseSync): void {
  const subjects: readonly (readonly [string, string])[] = [
    ["subject-author", "Author"],
    ["subject-reviewer", "Reviewer"],
    ["subject-approver", "Approver"],
  ];

  for (const [id, name] of subjects) {
    run(
      database,
      "INSERT INTO identity_subjects (id, display_name, provider, provider_subject, created_at) VALUES (?, ?, 'external', ?, ?)",
      id,
      name,
      id,
      timestamp,
    );
  }

  run(
    database,
    "INSERT INTO tenants (id, name, slug, created_at) VALUES (?, ?, ?, ?)",
    tenantId,
    "Stale Approval Demo",
    "stale-approval-demo",
    timestamp,
  );
  run(
    database,
    "INSERT INTO workspaces (id, tenant_id, name, created_at) VALUES (?, ?, ?, ?)",
    workspaceId,
    tenantId,
    "Operations",
    timestamp,
  );

  for (const [subjectId] of subjects) {
    run(
      database,
      "INSERT INTO tenant_memberships (id, tenant_id, subject_id, status, created_at) VALUES (?, ?, ?, 'active', ?)",
      `membership-${subjectId}`,
      tenantId,
      subjectId,
      timestamp,
    );
  }

  run(
    database,
    "INSERT INTO templates (id, tenant_id, workspace_id, name, current_version, created_at) VALUES ('template-1', ?, ?, 'Template', NULL, ?)",
    tenantId,
    workspaceId,
    timestamp,
  );
  run(
    database,
    `INSERT INTO template_versions
       (id, tenant_id, template_id, version_number, lifecycle_state, content_hash,
        content_provider, content_key, created_by_subject_id, provenance, created_at, published_at)
     VALUES ('template-version-1', ?, 'template-1', 1, 'published', ?, 'r2', ?,
             'subject-author', 'Synthetic test', ?, ?)`,
    tenantId,
    `sha256:${"a".repeat(64)}`,
    `tenants/${tenantId}/workspaces/${workspaceId}/templates/template-1/versions/template-version-1/content`,
    timestamp,
    timestamp,
  );
  run(
    database,
    "UPDATE templates SET current_version = 1 WHERE id = 'template-1' AND tenant_id = ?",
    tenantId,
  );

  run(
    database,
    `INSERT INTO workflow_definitions
       (id, tenant_id, name, version, definition_json, created_at)
     VALUES ('workflow-1', ?, 'Standard approval', 1, ?, ?)`,
    tenantId,
    JSON.stringify({
      states: ["draft", "review", "approval", "approved"],
      transitions: [
        { from: "draft", to: "review" },
        { from: "review", to: "draft" },
        { from: "review", to: "approval" },
        { from: "approval", to: "draft" },
        { from: "approval", to: "approved" },
      ],
    }),
    timestamp,
  );
}

describe("stale workflow approval protection", () => {
  it("rejects approval after a newer document version becomes current", async () => {
    const database = await createDatabase();
    seedFoundation(database);
    const service = new DocumentWorkflowService(
      new SqliteDatabaseProvider(database),
    );

    await service.createDocumentFromTemplate({
      tenantId,
      workspaceId,
      documentId,
      title: "Version-aware policy",
      templateId: "template-1",
      templateVersion: 1,
      versionId: "version-1",
      contentHash: `sha256:${"1".repeat(64)}`,
      contentKey: buildDocumentVersionContentKey({
        tenantId,
        workspaceId,
        documentId,
        versionId: "version-1",
      }),
      actorSubjectId: "subject-author",
      occurredAt: "2026-08-10T20:11:00.000Z",
      auditEventId: "audit-create",
    });

    const workflow = await service.startWorkflow({
      tenantId,
      documentId,
      workflowInstanceId: "workflow-instance-1",
      workflowDefinitionId: "workflow-1",
      workflowDefinitionVersion: 1,
      actorSubjectId: "subject-author",
      occurredAt: "2026-08-10T20:12:00.000Z",
      auditEventId: "audit-workflow-start",
    });
    await service.transition({
      tenantId,
      workflowInstanceId: workflow.id,
      targetState: "review",
      actorSubjectId: "subject-author",
      occurredAt: "2026-08-10T20:13:00.000Z",
      auditEventId: "audit-review-start",
    });
    await service.recordReview({
      tenantId,
      workflowInstanceId: workflow.id,
      reviewId: "review-1",
      actorSubjectId: "subject-reviewer",
      decision: "accepted",
      occurredAt: "2026-08-10T20:14:00.000Z",
      auditEventId: "audit-review-accepted",
    });

    await service.createChangedVersion({
      tenantId,
      documentId,
      versionId: "version-2",
      contentHash: `sha256:${"2".repeat(64)}`,
      contentKey: buildDocumentVersionContentKey({
        tenantId,
        workspaceId,
        documentId,
        versionId: "version-2",
      }),
      actorSubjectId: "subject-author",
      occurredAt: "2026-08-10T20:15:00.000Z",
      auditEventId: "audit-version-2",
    });

    await expect(
      service.approveCurrentVersion({
        tenantId,
        workflowInstanceId: workflow.id,
        approvalId: "approval-stale",
        actorSubjectId: "subject-approver",
        occurredAt: "2026-08-10T20:16:00.000Z",
        auditEventId: "audit-stale-approval",
      }),
    ).rejects.toThrow(/superseded workflow version/);

    const approvals = database
      .prepare("SELECT id FROM approvals WHERE tenant_id = ?")
      .all(tenantId);
    expect(approvals).toHaveLength(0);
  });
});
