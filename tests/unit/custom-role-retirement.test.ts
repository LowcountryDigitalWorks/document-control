import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type {
  DatabaseProvider,
  DatabaseResult,
  DatabaseStatement,
} from "../../src/application/ports";
import { RolesAccessAdminService } from "../../src/application/roles-access-admin-service";

type SqlValue = string | number | bigint | Uint8Array | null;
const timestamp = "2026-08-11T22:45:00.000Z";

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
  service: RolesAccessAdminService;
}> {
  const database = new DatabaseSync(":memory:");
  for (const migration of [
    "0001_initial.sql",
    "0002_system_role_permissions.sql",
    "0007_custom_role_retirement.sql",
  ]) {
    database.exec(
      await readFile(
        new URL(`../../migrations/${migration}`, import.meta.url),
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
      ('admin-1', 'Admin One', 'external', 'admin-1', '${timestamp}'),
      ('member-1', 'Member One', 'entra', 'entra-member-1', '${timestamp}');
    INSERT INTO tenant_memberships (id, tenant_id, subject_id, status, created_at)
    VALUES
      ('membership-admin', 'tenant-1', 'admin-1', 'active', '${timestamp}'),
      ('membership-member', 'tenant-1', 'member-1', 'active', '${timestamp}');
  `);
  return {
    database,
    service: new RolesAccessAdminService(new SqliteDatabaseProvider(database)),
  };
}

describe("custom workspace role retirement", () => {
  it("requires assignments to be removed, retires terminally, and blocks future use", async () => {
    const { database, service } = await createHarness();
    await service.createCustomWorkspaceRole({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      roleDefinitionId: "role-custom-records",
      roleKey: "custom_records",
      name: "Records Coordinator",
      permissions: ["document.read", "audit.read"],
      actorSubjectId: "admin-1",
      auditEventId: "audit-create",
      occurredAt: timestamp,
    });
    await service.assignWorkspaceRole({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      subjectId: "member-1",
      roleDefinitionId: "role-custom-records",
      bindingId: "binding-records",
      actorSubjectId: "admin-1",
      auditEventId: "audit-assign",
      occurredAt: timestamp,
    });

    await expect(
      service.retireCustomWorkspaceRole({
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        roleDefinitionId: "role-custom-records",
        actorSubjectId: "admin-1",
        auditEventId: "audit-retire-blocked",
        occurredAt: timestamp,
      }),
    ).rejects.toThrow(/remove all 1 current assignment/iu);

    await service.removeWorkspaceRole({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      bindingId: "binding-records",
      actorSubjectId: "admin-1",
      auditEventId: "audit-remove",
      occurredAt: timestamp,
    });
    const retired = await service.retireCustomWorkspaceRole({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      roleDefinitionId: "role-custom-records",
      actorSubjectId: "admin-1",
      auditEventId: "audit-retired",
      occurredAt: timestamp,
    });

    expect(retired.changed).toBe(true);
    expect(
      retired.snapshot.roles.find((role) => role.id === "role-custom-records"),
    ).toMatchObject({ retiredAt: timestamp, assignmentCount: 0 });
    expect(
      database
        .prepare("SELECT event_type FROM audit_events WHERE id = ?")
        .get("audit-retired"),
    ).toEqual({ event_type: "role.definition.retired" });

    await expect(
      service.updateCustomWorkspaceRole({
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        roleDefinitionId: "role-custom-records",
        name: "Records Lead",
        permissions: ["document.read"],
        acknowledgeAssignments: false,
        actorSubjectId: "admin-1",
        auditEventId: "audit-update-after-retire",
        occurredAt: timestamp,
      }),
    ).rejects.toThrow("Retired custom roles cannot be edited.");

    await expect(
      service.assignWorkspaceRole({
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        subjectId: "member-1",
        roleDefinitionId: "role-custom-records",
        bindingId: "binding-after-retire",
        actorSubjectId: "admin-1",
        auditEventId: "audit-after-retire",
        occurredAt: timestamp,
      }),
    ).rejects.toThrow(/only a workspace-scoped role available/iu);

    expect(() =>
      database.exec(`
        INSERT INTO role_bindings
          (id, role_definition_id, subject_id, tenant_id, workspace_id, created_at)
        VALUES
          ('direct-retired-binding', 'role-custom-records', 'member-1', 'tenant-1', 'workspace-1', '${timestamp}');
      `),
    ).toThrow(/retired custom roles cannot receive new assignments/iu);
    expect(() =>
      database.exec(
        "UPDATE role_definitions SET retired_at = NULL WHERE id = 'role-custom-records';",
      ),
    ).toThrow(/retirement is terminal/iu);
  });

  it("does not allow built-in roles to be retired at the database boundary", async () => {
    const { database } = await createHarness();
    expect(() =>
      database.exec(
        `UPDATE role_definitions SET retired_at = '${timestamp}' WHERE id = 'role-viewer';`,
      ),
    ).toThrow(/only tenant-owned custom workspace roles can be retired/iu);
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
