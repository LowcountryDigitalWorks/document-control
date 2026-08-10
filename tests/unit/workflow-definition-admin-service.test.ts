import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type {
  DatabaseProvider,
  DatabaseResult,
  DatabaseStatement,
} from "../../src/application/ports";
import { WorkflowDefinitionAdminService } from "../../src/application/workflow-definition-admin-service";

const timestamp = "2026-08-10T23:35:00.000Z";
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
  service: WorkflowDefinitionAdminService;
}> {
  const migrationFiles = [
    "0001_initial.sql",
    "0002_system_role_permissions.sql",
    "0003_workflow_definition_immutability.sql",
  ];
  const database = new DatabaseSync(":memory:");
  for (const file of migrationFiles) {
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
    VALUES ('admin-1', 'Admin One', 'external', 'admin-1', '${timestamp}');
    INSERT INTO tenant_memberships (id, tenant_id, subject_id, status, created_at)
    VALUES ('membership-admin', 'tenant-1', 'admin-1', 'active', '${timestamp}');
  `);
  return {
    database,
    service: new WorkflowDefinitionAdminService(
      new SqliteDatabaseProvider(database),
    ),
  };
}

const definitionInput = {
  name: "Document Approval",
  states: ["draft", "review", "approval", "approved"],
  transitions: [
    { from: "draft", to: "review" },
    { from: "review", to: "draft" },
    { from: "review", to: "approval" },
    { from: "approval", to: "approved" },
  ],
} as const;

describe("WorkflowDefinitionAdminService", () => {
  it("creates v1 then appends v2 without changing v1", async () => {
    const { database, service } = await createHarness();

    const first = await service.createDefinition({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      workflowDefinitionId: "workflow-doc-approval",
      actorSubjectId: "admin-1",
      auditEventId: "audit-workflow-v1",
      occurredAt: timestamp,
      input: definitionInput,
    });
    expect(first.version).toBe(1);

    const second = await service.createVersion({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      workflowDefinitionId: "workflow-doc-approval",
      actorSubjectId: "admin-1",
      auditEventId: "audit-workflow-v2",
      occurredAt: "2026-08-10T23:36:00.000Z",
      input: {
        ...definitionInput,
        name: "Document Approval Revised",
        transitions: [
          ...definitionInput.transitions,
          { from: "approval", to: "review" },
        ],
      },
    });
    expect(second.version).toBe(2);

    const catalog = await service.getCatalog("tenant-1", "workspace-1");
    expect(catalog.definitions.map((definition) => definition.version)).toEqual(
      [2, 1],
    );
    expect(catalog.definitions[1]?.name).toBe("Document Approval");

    expect(() =>
      database
        .prepare(
          "UPDATE workflow_definitions SET name = 'Mutated' WHERE id = ? AND version = 1",
        )
        .run("workflow-doc-approval"),
    ).toThrow(/workflow definition versions are immutable/u);
    expect(() =>
      database
        .prepare(
          "DELETE FROM workflow_definitions WHERE id = ? AND version = 1",
        )
        .run("workflow-doc-approval"),
    ).toThrow(/workflow definition versions are immutable/u);

    expect(
      database
        .prepare(
          "SELECT event_type FROM audit_events WHERE id IN (?, ?) ORDER BY id",
        )
        .all("audit-workflow-v1", "audit-workflow-v2"),
    ).toEqual([
      { event_type: "workflow.definition.created" },
      { event_type: "workflow.definition.version_created" },
    ]);
  });

  it("rejects versioning a workflow family outside the tenant", async () => {
    const { service } = await createHarness();

    await expect(
      service.createVersion({
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        workflowDefinitionId: "missing-workflow",
        actorSubjectId: "admin-1",
        auditEventId: "audit-missing",
        occurredAt: timestamp,
        input: definitionInput,
      }),
    ).rejects.toThrow(
      "The requested workflow definition does not exist in this tenant.",
    );
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
