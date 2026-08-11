import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type {
  DatabaseProvider,
  DatabaseResult,
  DatabaseStatement,
} from "../../src/application/ports";
import { WorkspaceWorkflowSelectionService } from "../../src/application/workspace-workflow-selection-service";

const timestamp = "2026-08-11T12:00:00.000Z";
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
  service: WorkspaceWorkflowSelectionService;
}> {
  const database = new DatabaseSync(":memory:");
  for (const file of [
    "0001_initial.sql",
    "0002_system_role_permissions.sql",
    "0003_workflow_definition_immutability.sql",
    "0004_template_version_lifecycle_integrity.sql",
    "0005_workspace_workflow_selection.sql",
    "0006_workflow_definition_lifecycle.sql",
  ]) {
    database.exec(
      await readFile(
        new URL(`../../migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  }

  database.exec(`
    INSERT INTO identity_subjects (id, display_name, provider, provider_subject, created_at)
    VALUES ('admin-1', 'Admin One', 'external', 'admin-1', '${timestamp}');
    INSERT INTO tenants (id, name, slug, created_at)
    VALUES ('tenant-1', 'Tenant One', 'tenant-one', '${timestamp}'),
           ('tenant-2', 'Tenant Two', 'tenant-two', '${timestamp}');
    INSERT INTO tenant_memberships (id, tenant_id, subject_id, status, created_at)
    VALUES ('membership-admin-1', 'tenant-1', 'admin-1', 'active', '${timestamp}');
    INSERT INTO workspaces (id, tenant_id, name, created_at)
    VALUES ('workspace-1', 'tenant-1', 'Operations', '${timestamp}'),
           ('workspace-2', 'tenant-2', 'Other', '${timestamp}');
    INSERT INTO workflow_definitions (id, tenant_id, name, version, definition_json, created_at)
    VALUES
      ('workflow-standard', 'tenant-1', 'Standard v1', 1,
       '{"states":["draft","review","approval","approved"],"transitions":[{"from":"draft","to":"review"},{"from":"review","to":"approval"},{"from":"approval","to":"approved"}]}', '${timestamp}'),
      ('workflow-standard', 'tenant-1', 'Standard v2', 2,
       '{"states":["draft","review","approval","approved"],"transitions":[{"from":"draft","to":"review"},{"from":"review","to":"draft"},{"from":"review","to":"approval"},{"from":"approval","to":"approved"}]}', '${timestamp}'),
      ('workflow-other', 'tenant-2', 'Other', 1,
       '{"states":["draft"],"transitions":[]}', '${timestamp}');
  `);

  return {
    database,
    service: new WorkspaceWorkflowSelectionService(
      new SqliteDatabaseProvider(database),
    ),
  };
}

function applicabilityCommand(
  workflowDefinitionVersion: number,
  applicable: boolean,
  suffix: string,
) {
  return {
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    workflowDefinitionId: "workflow-standard",
    workflowDefinitionVersion,
    applicable,
    actorSubjectId: "admin-1",
    auditEventId: `audit-${suffix}`,
    occurredAt: timestamp,
  } as const;
}

function defaultCommand(workflowDefinitionVersion: number, suffix: string) {
  return {
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    workflowDefinitionId: "workflow-standard",
    workflowDefinitionVersion,
    actorSubjectId: "admin-1",
    auditEventId: `audit-${suffix}`,
    occurredAt: timestamp,
  } as const;
}

describe("WorkspaceWorkflowSelectionService", () => {
  it("enables exact versions and moves the workspace default without changing history", async () => {
    const { database, service } = await createHarness();

    await service.setApplicability(applicabilityCommand(1, true, "enable-v1"));
    await service.setDefault(defaultCommand(1, "default-v1"));
    await service.setApplicability(applicabilityCommand(2, true, "enable-v2"));
    await service.setDefault(defaultCommand(2, "default-v2"));

    await expect(
      service.resolveDefault("tenant-1", "workspace-1"),
    ).resolves.toEqual({
      workflowDefinitionId: "workflow-standard",
      workflowDefinitionVersion: 2,
    });

    const catalog = await service.getCatalog("tenant-1", "workspace-1");
    const versionOne = catalog.definitions.find(
      (definition) => definition.workflowDefinitionVersion === 1,
    );
    const versionTwo = catalog.definitions.find(
      (definition) => definition.workflowDefinitionVersion === 2,
    );
    expect(versionOne).toMatchObject({ applicable: true, isDefault: false });
    expect(versionTwo).toMatchObject({ applicable: true, isDefault: true });

    expect(
      database
        .prepare("SELECT event_type FROM audit_events ORDER BY id")
        .all()
        .map((row) => (row as { event_type: string }).event_type),
    ).toEqual([
      "workflow.workspace_default.changed",
      "workflow.workspace_default.changed",
      "workflow.workspace_applicability.enabled",
      "workflow.workspace_applicability.enabled",
    ]);
  });

  it("requires applicability before default selection and protects the current default", async () => {
    const { service } = await createHarness();

    await expect(
      service.setDefault(defaultCommand(1, "missing")),
    ).rejects.toThrow(/must be applicable/u);

    await service.setApplicability(applicabilityCommand(1, true, "enable"));
    await service.setDefault(defaultCommand(1, "default"));
    await expect(
      service.setApplicability(applicabilityCommand(1, false, "disable")),
    ).rejects.toThrow(/cannot be removed/u);
  });

  it("keeps workflow applicability inside the tenant boundary", async () => {
    const { service } = await createHarness();

    await expect(
      service.setApplicability({
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        workflowDefinitionId: "workflow-other",
        workflowDefinitionVersion: 1,
        applicable: true,
        actorSubjectId: "admin-1",
        auditEventId: "audit-cross-tenant",
        occurredAt: timestamp,
      }),
    ).rejects.toThrow(/does not exist in this tenant/u);
  });

  it("allows only one direct database default per workspace", async () => {
    const { database, service } = await createHarness();
    await service.setApplicability(applicabilityCommand(1, true, "enable-v1"));
    await service.setApplicability(applicabilityCommand(2, true, "enable-v2"));
    await service.setDefault(defaultCommand(1, "default-v1"));

    expect(() =>
      database
        .prepare(
          `UPDATE workspace_workflow_assignments
           SET is_default = 1
           WHERE tenant_id = 'tenant-1' AND workspace_id = 'workspace-1'
             AND workflow_definition_version = 2`,
        )
        .run(),
    ).toThrow();
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
