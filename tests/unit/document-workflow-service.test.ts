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

const timestamp = "2026-08-10T19:00:00.000Z";
const tenantId = "tenant-persisted-demo";
const workspaceId = "workspace-operations";
const documentId = "document-opening-checklist";

class SqliteDatabaseProvider implements DatabaseProvider {
  public constructor(private readonly database: DatabaseSync) {}

  public async query<Row>(
    sql: string,
    parameters: readonly unknown[] = [],
  ): Promise<readonly Row[]> {
    return this.database.prepare(sql).all(...sqlValues(parameters)) as Row[];
  }

  public async execute(
    sql: string,
    parameters: readonly unknown[] = [],
  ): Promise<DatabaseResult> {
    const result = this.database.prepare(sql).run(...sqlValues(parameters));
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
          .run(...sqlValues(statement.parameters ?? []));
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

type SqlValue = string | number | bigint | Uint8Array | null;

function sqlValues(values: readonly unknown[]): SqlValue[] {
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
  const subjects: readonly (readonly [string, string, string])[] = [
    ["subject-author", "Avery Author", "author"],
    ["subject-reviewer", "Riley Reviewer", "reviewer"],
    ["subject-approver", "Alex Approver", "approver"],
  ];

  for (const [id, name, providerSubject] of subjects) {
    run(
      database,
      "INSERT INTO identity_subjects (id, display_name, provider, provider_subject, created_at) VALUES (?, ?, 'external', ?, ?)",
      id,
      name,
      providerSubject,
      timestamp,
    );
  }

  run(
    database,
    "INSERT INTO tenants (id, name, slug, created_at) VALUES (?, ?, ?, ?)",
    tenantId,
    "Persisted Harbor Demo",
    "persisted-harbor-demo",
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

  for (const subjectId of [
    "subject-author",
    "subject-reviewer",
    "subject-approver",
  ]) {
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
    "INSERT INTO templates (id, tenant_id, workspace_id, name, current_version, created_at) VALUES (?, ?, ?, ?, NULL, ?)",
    "template-sop",
    tenantId,
    workspaceId,
    "Standard Operating Procedure",
    timestamp,
  );
  run(
    database,
    `INSERT INTO template_versions
       (id, tenant_id, template_id, version_number, lifecycle_state, content_hash,
        content_provider, content_key, created_by_subject_id, provenance, created_at, published_at)
     VALUES (?, ?, ?, 1, 'published', ?, 'r2', ?, ?, ?, ?, ?)`,
    "template-sop-v1",
    tenantId,
    "template-sop",
    `sha256:${"a".repeat(64)}`,
    "tenants/tenant-persisted-demo/workspaces/workspace-operations/templates/template-sop/versions/template-sop-v1/content",
    "subject-author",
    "LDW synthetic persisted workflow test",
    timestamp,
    timestamp,
  );
  run(
    database,
    "UPDATE templates SET current_version = 1 WHERE id = ? AND tenant_id = ?",
    "template-sop",
    tenantId,
  );

  run(
    database,
    `INSERT INTO workflow_definitions
       (id, tenant_id, name, version, definition_json, created_at)
     VALUES (?, ?, ?, 1, ?, ?)`,
    "workflow-standard",
    tenantId,
    "Standard review and approval",
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

describe("persisted document workflow service", () => {
  it("persists create, review, approval, changed version, and audit evidence", async () => {
    const database = await createDatabase();
    seedFoundation(database);
    const service = new DocumentWorkflowService(
      new SqliteDatabaseProvider(database),
    );

    const versionOneKey = buildDocumentVersionContentKey({
      tenantId,
      workspaceId,
      documentId,
      versionId: "document-v1",
    });
    const versionOne = await service.createDocumentFromTemplate({
      tenantId,
      workspaceId,
      documentId,
      title: "Harbor Opening Checklist",
      templateId: "template-sop",
      templateVersion: 1,
      versionId: "document-v1",
      contentHash: `sha256:${"1".repeat(64)}`,
      contentKey: versionOneKey,
      actorSubjectId: "subject-author",
      occurredAt: "2026-08-10T19:01:00.000Z",
      auditEventId: "audit-document-created",
    });

    const workflow = await service.startWorkflow({
      tenantId,
      documentId,
      workflowInstanceId: "workflow-instance-v1",
      workflowDefinitionId: "workflow-standard",
      workflowDefinitionVersion: 1,
      actorSubjectId: "subject-author",
      occurredAt: "2026-08-10T19:02:00.000Z",
      auditEventId: "audit-workflow-started",
    });
    expect(workflow.documentVersionId).toBe(versionOne.id);
    expect(workflow.state).toBe("draft");

    const inReview = await service.transition({
      tenantId,
      workflowInstanceId: workflow.id,
      targetState: "review",
      actorSubjectId: "subject-author",
      occurredAt: "2026-08-10T19:03:00.000Z",
      auditEventId: "audit-submitted-review",
    });
    expect(inReview.state).toBe("review");

    await service.recordReview({
      tenantId,
      workflowInstanceId: workflow.id,
      reviewId: "review-v1",
      actorSubjectId: "subject-reviewer",
      decision: "accepted",
      comment: "Synthetic persisted review accepted.",
      occurredAt: "2026-08-10T19:04:00.000Z",
      auditEventId: "audit-review-accepted",
    });

    const approval = await service.approveCurrentVersion({
      tenantId,
      workflowInstanceId: workflow.id,
      approvalId: "approval-v1",
      actorSubjectId: "subject-approver",
      occurredAt: "2026-08-10T19:05:00.000Z",
      auditEventId: "audit-version-approved",
    });
    expect(approval.documentVersionId).toBe(versionOne.id);
    expect(approval.contentHash).toBe(versionOne.contentHash);

    const approvedEvidence = await service.getEvidence(tenantId, documentId);
    expect(approvedEvidence.document.status).toBe("approved");
    expect(approvedEvidence.versions).toHaveLength(1);
    expect(approvedEvidence.versions[0]?.exactApprovalApplies).toBe(true);

    const versionTwoKey = buildDocumentVersionContentKey({
      tenantId,
      workspaceId,
      documentId,
      versionId: "document-v2",
    });
    const versionTwo = await service.createChangedVersion({
      tenantId,
      documentId,
      versionId: "document-v2",
      contentHash: `sha256:${"2".repeat(64)}`,
      contentKey: versionTwoKey,
      actorSubjectId: "subject-author",
      occurredAt: "2026-08-10T19:06:00.000Z",
      auditEventId: "audit-version-two-created",
    });

    const changedEvidence = await service.getEvidence(tenantId, documentId);
    expect(changedEvidence.currentVersion.id).toBe(versionTwo.id);
    expect(changedEvidence.document.status).toBe("draft");
    expect(changedEvidence.versions).toHaveLength(2);
    expect(changedEvidence.versions[0]?.exactApprovalApplies).toBe(true);
    expect(changedEvidence.versions[1]?.exactApprovalApplies).toBe(false);

    const auditRows = database
      .prepare(
        "SELECT event_type AS eventType FROM audit_events WHERE tenant_id = ? ORDER BY occurred_at ASC",
      )
      .all(tenantId) as { eventType: string }[];
    expect(auditRows.map((row) => row.eventType)).toEqual([
      "document.created_from_template",
      "workflow.started",
      "workflow.transitioned",
      "document.version.reviewed",
      "document.version.approved",
      "document.version.created",
    ]);
  });

  it("rolls back a multi-statement application change when one statement fails", async () => {
    const database = await createDatabase();
    seedFoundation(database);
    const provider = new SqliteDatabaseProvider(database);

    await expect(
      provider.executeBatch([
        {
          sql: "INSERT INTO tenants (id, name, slug, created_at) VALUES (?, ?, ?, ?)",
          parameters: ["tenant-rollback", "Rollback", "rollback", timestamp],
        },
        {
          sql: "INSERT INTO tenants (id, name, slug, created_at) VALUES (?, ?, ?, ?)",
          parameters: [tenantId, "Duplicate", "duplicate", timestamp],
        },
      ]),
    ).rejects.toThrow();

    const rows = database
      .prepare("SELECT id FROM tenants WHERE id = ?")
      .all("tenant-rollback");
    expect(rows).toHaveLength(0);
  });

  it("rejects arbitrary content keys and non-current approvals", async () => {
    const database = await createDatabase();
    seedFoundation(database);
    const service = new DocumentWorkflowService(
      new SqliteDatabaseProvider(database),
    );

    await expect(
      service.createDocumentFromTemplate({
        tenantId,
        workspaceId,
        documentId,
        title: "Unsafe key",
        templateId: "template-sop",
        templateVersion: 1,
        versionId: "document-v1",
        contentHash: `sha256:${"1".repeat(64)}`,
        contentKey: "arbitrary/path",
        actorSubjectId: "subject-author",
        occurredAt: timestamp,
        auditEventId: "audit-unsafe",
      }),
    ).rejects.toThrow(/application-owned key builder/);
  });
});
