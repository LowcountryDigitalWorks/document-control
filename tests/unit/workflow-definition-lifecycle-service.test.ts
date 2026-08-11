import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type {
  DatabaseProvider,
  DatabaseResult,
  DatabaseStatement,
} from "../../src/application/ports";
import { WorkflowDefinitionAdminService } from "../../src/application/workflow-definition-admin-service";
import { WorkspaceWorkflowSelectionService } from "../../src/application/workspace-workflow-selection-service";

const timestamp = "2026-08-11T18:30:00.000Z";
const hash = `sha256:${"a".repeat(64)}`;
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
  definitions: WorkflowDefinitionAdminService;
  selections: WorkspaceWorkflowSelectionService;
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
    VALUES ('tenant-1', 'Tenant One', 'tenant-one', '${timestamp}');
    INSERT INTO tenant_memberships (id, tenant_id, subject_id, status, created_at)
    VALUES ('membership-admin', 'tenant-1', 'admin-1', 'active', '${timestamp}');
    INSERT INTO workspaces (id, tenant_id, name, created_at)
    VALUES ('workspace-1', 'tenant-1', 'Operations', '${timestamp}'),
           ('workspace-2', 'tenant-1', 'Quality', '${timestamp}');
  `);

  const provider = new SqliteDatabaseProvider(database);
  return {
    database,
    definitions: new WorkflowDefinitionAdminService(provider),
    selections: new WorkspaceWorkflowSelectionService(provider),
  };
}

const definitionInput = {
  name: "Document Approval",
  states: ["draft", "review", "approved"],
  transitions: [
    { from: "draft", to: "review" },
    { from: "review", to: "approved" },
  ],
} as const;

function applicability(
  workspaceId: string,
  version: number,
  applicable: boolean,
  suffix: string,
) {
  return {
    tenantId: "tenant-1",
    workspaceId,
    workflowDefinitionId: "workflow-standard",
    workflowDefinitionVersion: version,
    applicable,
    actorSubjectId: "admin-1",
    auditEventId: `audit-${suffix}`,
    occurredAt: timestamp,
  } as const;
}

function defaultCommand(workspaceId: string, version: number, suffix: string) {
  return {
    tenantId: "tenant-1",
    workspaceId,
    workflowDefinitionId: "workflow-standard",
    workflowDefinitionVersion: version,
    actorSubjectId: "admin-1",
    auditEventId: `audit-${suffix}`,
    occurredAt: timestamp,
  } as const;
}

describe("workflow definition lifecycle", () => {
  it("deprecates without rewriting existing defaults, then retires only after assignments are removed", async () => {
    const { database, definitions, selections } = await createHarness();
    await definitions.createDefinition({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      workflowDefinitionId: "workflow-standard",
      actorSubjectId: "admin-1",
      auditEventId: "audit-create-v1",
      occurredAt: timestamp,
      input: definitionInput,
    });
    await definitions.createVersion({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      workflowDefinitionId: "workflow-standard",
      actorSubjectId: "admin-1",
      auditEventId: "audit-create-v2",
      occurredAt: timestamp,
      input: { ...definitionInput, name: "Document Approval v2" },
    });

    await selections.setApplicability(
      applicability("workspace-1", 1, true, "w1-v1-enable"),
    );
    await selections.setDefault(defaultCommand("workspace-1", 1, "w1-v1-default"));
    await selections.setApplicability(
      applicability("workspace-2", 1, true, "w2-v1-enable"),
    );

    database.exec(`
      INSERT INTO documents
        (id, tenant_id, workspace_id, title, status, current_version_id,
         template_provenance, created_at, updated_at)
      VALUES ('document-1', 'tenant-1', 'workspace-1', 'Policy', 'draft', NULL,
              'none', '${timestamp}', '${timestamp}');
      INSERT INTO document_versions
        (id, tenant_id, document_id, version_number, content_hash, content_provider,
         content_key, created_by_subject_id, created_at)
      VALUES ('document-version-1', 'tenant-1', 'document-1', 1, '${hash}', 'r2',
              'tenant-1/workspace-1/document-1/1/object', 'admin-1', '${timestamp}');
      UPDATE documents SET current_version_id = 'document-version-1' WHERE id = 'document-1';
      INSERT INTO workflow_instances
        (id, tenant_id, document_id, document_version_id, workflow_definition_id,
         workflow_definition_version, state, created_at, updated_at)
      VALUES ('instance-v1', 'tenant-1', 'document-1', 'document-version-1',
              'workflow-standard', 1, 'draft', '${timestamp}', '${timestamp}');
    `);

    const deprecated = await definitions.transitionLifecycle({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      workflowDefinitionId: "workflow-standard",
      workflowDefinitionVersion: 1,
      targetState: "deprecated",
      actorSubjectId: "admin-1",
      auditEventId: "audit-deprecate-v1",
      occurredAt: timestamp,
    });
    expect(deprecated).toMatchObject({
      lifecycleState: "deprecated",
      workspaceAssignmentCount: 2,
      instanceCount: 1,
    });
    expect(deprecated.availableLifecycleTransitions).toEqual(["active"]);

    await expect(
      selections.resolveDefault("tenant-1", "workspace-1"),
    ).resolves.toEqual({
      workflowDefinitionId: "workflow-standard",
      workflowDefinitionVersion: 1,
    });
    await expect(
      selections.setDefault(defaultCommand("workspace-2", 1, "w2-v1-default")),
    ).rejects.toThrow(/only an active workflow version/u);

    await expect(
      definitions.transitionLifecycle({
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        workflowDefinitionId: "workflow-standard",
        workflowDefinitionVersion: 1,
        targetState: "retired",
        actorSubjectId: "admin-1",
        auditEventId: "audit-retire-blocked",
        occurredAt: timestamp,
      }),
    ).rejects.toThrow(/remove this workflow version from every workspace/u);

    await selections.setApplicability(
      applicability("workspace-1", 2, true, "w1-v2-enable"),
    );
    await selections.setDefault(defaultCommand("workspace-1", 2, "w1-v2-default"));
    await selections.setApplicability(
      applicability("workspace-1", 1, false, "w1-v1-disable"),
    );
    await selections.setApplicability(
      applicability("workspace-2", 1, false, "w2-v1-disable"),
    );

    const retired = await definitions.transitionLifecycle({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      workflowDefinitionId: "workflow-standard",
      workflowDefinitionVersion: 1,
      targetState: "retired",
      actorSubjectId: "admin-1",
      auditEventId: "audit-retire-v1",
      occurredAt: timestamp,
    });
    expect(retired.lifecycleState).toBe("retired");
    expect(retired.availableLifecycleTransitions).toEqual([]);
    expect(
      database.prepare("SELECT state FROM workflow_instances WHERE id = 'instance-v1'").get(),
    ).toEqual({ state: "draft" });
  });

  it("enforces lifecycle rules directly at the SQLite boundary", async () => {
    const { database, definitions } = await createHarness();
    await definitions.createDefinition({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      workflowDefinitionId: "workflow-standard",
      actorSubjectId: "admin-1",
      auditEventId: "audit-create",
      occurredAt: timestamp,
      input: definitionInput,
    });

    expect(() =>
      database
        .prepare(
          `UPDATE workflow_definition_lifecycle
           SET lifecycle_state = 'retired', changed_by_subject_id = 'admin-1', changed_at = ?
           WHERE tenant_id = 'tenant-1' AND workflow_definition_id = 'workflow-standard'
             AND workflow_definition_version = 1`,
        )
        .run(timestamp),
    ).toThrow(/invalid workflow lifecycle transition/u);

    database
      .prepare(
        `UPDATE workflow_definition_lifecycle
         SET lifecycle_state = 'deprecated', changed_by_subject_id = 'admin-1', changed_at = ?
         WHERE tenant_id = 'tenant-1' AND workflow_definition_id = 'workflow-standard'
           AND workflow_definition_version = 1`,
      )
      .run(timestamp);

    expect(() =>
      database
        .prepare(
          `INSERT INTO workspace_workflow_assignments
            (tenant_id, workspace_id, workflow_definition_id, workflow_definition_version,
             is_default, created_by_subject_id, created_at, updated_by_subject_id, updated_at)
           VALUES ('tenant-1', 'workspace-1', 'workflow-standard', 1, 0,
                   'admin-1', ?, 'admin-1', ?)`,
        )
        .run(timestamp, timestamp),
    ).toThrow(/only active workflow versions/u);

    database
      .prepare(
        `UPDATE workflow_definition_lifecycle
         SET lifecycle_state = 'retired', changed_by_subject_id = 'admin-1', changed_at = ?
         WHERE tenant_id = 'tenant-1' AND workflow_definition_id = 'workflow-standard'
           AND workflow_definition_version = 1`,
      )
      .run(timestamp);

    expect(() =>
      database
        .prepare(
          `UPDATE workflow_definition_lifecycle
           SET lifecycle_state = 'active', changed_by_subject_id = 'admin-1', changed_at = ?
           WHERE tenant_id = 'tenant-1' AND workflow_definition_id = 'workflow-standard'
             AND workflow_definition_version = 1`,
        )
        .run(timestamp),
    ).toThrow(/invalid workflow lifecycle transition/u);
    expect(() =>
      database
        .prepare(
          `DELETE FROM workflow_definition_lifecycle
           WHERE tenant_id = 'tenant-1' AND workflow_definition_id = 'workflow-standard'
             AND workflow_definition_version = 1`,
        )
        .run(),
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
