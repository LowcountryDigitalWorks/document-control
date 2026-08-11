import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type {
  DatabaseProvider,
  DatabaseResult,
  DatabaseStatement,
} from "../../src/application/ports";
import { RolesAccessAdminService } from "../../src/application/roles-access-admin-service";

const timestamp = "2026-08-10T23:10:00.000Z";
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
  service: RolesAccessAdminService;
}> {
  const initial = await readFile(
    new URL("../../migrations/0001_initial.sql", import.meta.url),
    "utf8",
  );
  const permissions = await readFile(
    new URL(
      "../../migrations/0002_system_role_permissions.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const database = new DatabaseSync(":memory:");
  database.exec(initial);
  database.exec(permissions);
  database.exec(`
    INSERT INTO tenants (id, name, slug, created_at)
    VALUES ('tenant-1', 'Tenant One', 'tenant-one', '${timestamp}');
    INSERT INTO workspaces (id, tenant_id, name, created_at)
    VALUES
      ('workspace-1', 'tenant-1', 'Operations', '${timestamp}'),
      ('workspace-2', 'tenant-1', 'Records', '${timestamp}');
    INSERT INTO identity_subjects (id, display_name, provider, provider_subject, created_at)
    VALUES
      ('admin-1', 'Admin One', 'external', 'admin-1', '${timestamp}'),
      ('member-1', 'Member One', 'external', 'member-1', '${timestamp}'),
      ('member-2', 'Member Two', 'entra', 'member-2', '${timestamp}'),
      ('inactive-1', 'Inactive One', 'external', 'inactive-1', '${timestamp}');
    INSERT INTO tenant_memberships (id, tenant_id, subject_id, status, created_at)
    VALUES
      ('membership-admin', 'tenant-1', 'admin-1', 'active', '${timestamp}'),
      ('membership-member', 'tenant-1', 'member-1', 'active', '${timestamp}'),
      ('membership-member-2', 'tenant-1', 'member-2', 'active', '${timestamp}'),
      ('membership-inactive', 'tenant-1', 'inactive-1', 'suspended', '${timestamp}');
    INSERT INTO role_bindings
      (id, role_definition_id, subject_id, tenant_id, workspace_id, created_at)
    VALUES
      ('binding-admin', 'role-workspace-admin', 'admin-1', 'tenant-1', 'workspace-1', '${timestamp}');
  `);
  return {
    database,
    service: new RolesAccessAdminService(new SqliteDatabaseProvider(database)),
  };
}

describe("RolesAccessAdminService", () => {
  it("creates and updates a tenant-owned custom workspace role with audit evidence", async () => {
    const { database, service } = await createHarness();

    const created = await service.createCustomWorkspaceRole({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      roleDefinitionId: "role-custom-records",
      roleKey: "custom_records",
      name: "Records Coordinator",
      permissions: ["audit.read", "document.read", "document.review"],
      actorSubjectId: "admin-1",
      auditEventId: "audit-role-created",
      occurredAt: timestamp,
    });
    expect(created.changed).toBe(true);
    expect(created.snapshot.roles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "role-custom-records",
          name: "Records Coordinator",
          key: "custom_records",
          isSystem: false,
          permissions: ["document.read", "document.review", "audit.read"],
          assignmentCount: 0,
        }),
      ]),
    );
    expect(
      database
        .prepare(
          "SELECT event_type, entity_type FROM audit_events WHERE id = ?",
        )
        .get("audit-role-created"),
    ).toEqual({
      event_type: "role.definition.created",
      entity_type: "role_definition",
    });

    await service.assignWorkspaceRole({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      subjectId: "member-1",
      roleDefinitionId: "role-custom-records",
      bindingId: "binding-custom-1",
      actorSubjectId: "admin-1",
      auditEventId: "audit-custom-binding-1",
      occurredAt: timestamp,
    });
    await service.assignWorkspaceRole({
      tenantId: "tenant-1",
      workspaceId: "workspace-2",
      subjectId: "member-2",
      roleDefinitionId: "role-custom-records",
      bindingId: "binding-custom-2",
      actorSubjectId: "admin-1",
      auditEventId: "audit-custom-binding-2",
      occurredAt: timestamp,
    });

    await expect(
      service.updateCustomWorkspaceRole({
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        roleDefinitionId: "role-custom-records",
        name: "Records Lead",
        permissions: ["document.read", "document.review", "audit.read"],
        acknowledgeAssignments: false,
        actorSubjectId: "admin-1",
        auditEventId: "audit-role-update-blocked",
        occurredAt: timestamp,
      }),
    ).rejects.toThrow(/currently affects 2 assignments/iu);

    const updated = await service.updateCustomWorkspaceRole({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      roleDefinitionId: "role-custom-records",
      name: "Records Lead",
      permissions: [
        "document.read",
        "document.review",
        "document.approve",
        "audit.read",
      ],
      acknowledgeAssignments: true,
      actorSubjectId: "admin-1",
      auditEventId: "audit-role-updated",
      occurredAt: timestamp,
    });
    expect(updated.changed).toBe(true);
    expect(updated.snapshot.roles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "role-custom-records",
          name: "Records Lead",
          assignmentCount: 2,
          assignedMembers: ["Member One — Operations", "Member Two — Records"],
        }),
      ]),
    );
    expect(
      database
        .prepare("SELECT event_type FROM audit_events WHERE id = ?")
        .get("audit-role-updated"),
    ).toEqual({ event_type: "role.definition.updated" });
  });

  it("rejects administrative permissions and duplicate custom role names", async () => {
    const { service } = await createHarness();

    await expect(
      service.createCustomWorkspaceRole({
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        roleDefinitionId: "role-custom-unsafe",
        roleKey: "custom_unsafe",
        name: "Unsafe Role",
        permissions: ["document.read", "role.manage"],
        actorSubjectId: "admin-1",
        auditEventId: "audit-unsafe",
        occurredAt: timestamp,
      }),
    ).rejects.toThrow(/not available to tenant-defined workspace roles/iu);

    await service.createCustomWorkspaceRole({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      roleDefinitionId: "role-custom-records",
      roleKey: "custom_records",
      name: "Records Coordinator",
      permissions: ["document.read"],
      actorSubjectId: "admin-1",
      auditEventId: "audit-role-created",
      occurredAt: timestamp,
    });
    await expect(
      service.createCustomWorkspaceRole({
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        roleDefinitionId: "role-custom-records-2",
        roleKey: "custom_records_2",
        name: "records coordinator",
        permissions: ["document.read"],
        actorSubjectId: "admin-1",
        auditEventId: "audit-role-created-2",
        occurredAt: timestamp,
      }),
    ).rejects.toThrow(/with this name already exists/iu);
  });

  it("assigns and removes an eligible workspace role with audit evidence", async () => {
    const { database, service } = await createHarness();

    const assigned = await service.assignWorkspaceRole({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      subjectId: "member-1",
      roleDefinitionId: "role-viewer",
      bindingId: "binding-viewer",
      actorSubjectId: "admin-1",
      auditEventId: "audit-created",
      occurredAt: timestamp,
    });
    expect(assigned.changed).toBe(true);
    expect(assigned.snapshot.bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "binding-viewer",
          subjectId: "member-1",
          roleKey: "viewer",
        }),
      ]),
    );
    expect(
      database
        .prepare("SELECT event_type FROM audit_events WHERE id = ?")
        .get("audit-created"),
    ).toEqual({ event_type: "role.binding.created" });

    const duplicate = await service.assignWorkspaceRole({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      subjectId: "member-1",
      roleDefinitionId: "role-viewer",
      bindingId: "binding-viewer-duplicate",
      actorSubjectId: "admin-1",
      auditEventId: "audit-duplicate",
      occurredAt: timestamp,
    });
    expect(duplicate.changed).toBe(false);
    expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM audit_events WHERE id = ?")
        .get("audit-duplicate"),
    ).toEqual({ count: 0 });

    const removed = await service.removeWorkspaceRole({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      bindingId: "binding-viewer",
      actorSubjectId: "admin-1",
      auditEventId: "audit-removed",
      occurredAt: timestamp,
    });
    expect(removed.changed).toBe(true);
    expect(removed.snapshot.bindings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "binding-viewer" }),
      ]),
    );
    expect(
      database
        .prepare("SELECT event_type FROM audit_events WHERE id = ?")
        .get("audit-removed"),
    ).toEqual({ event_type: "role.binding.removed" });
  });

  it("rejects tenant roles and inactive members", async () => {
    const { service } = await createHarness();

    await expect(
      service.assignWorkspaceRole({
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        subjectId: "member-1",
        roleDefinitionId: "role-tenant-admin",
        bindingId: "binding-invalid-role",
        actorSubjectId: "admin-1",
        auditEventId: "audit-invalid-role",
        occurredAt: timestamp,
      }),
    ).rejects.toThrow(
      "Only a workspace-scoped role available to this tenant can be assigned here.",
    );

    await expect(
      service.assignWorkspaceRole({
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        subjectId: "inactive-1",
        roleDefinitionId: "role-viewer",
        bindingId: "binding-inactive",
        actorSubjectId: "admin-1",
        auditEventId: "audit-inactive",
        occurredAt: timestamp,
      }),
    ).rejects.toThrow(
      "Workspace roles can only be assigned to an active member of this tenant.",
    );
  });

  it("blocks self-removal of a workspace role-management grant", async () => {
    const { database, service } = await createHarness();

    await expect(
      service.removeWorkspaceRole({
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        bindingId: "binding-admin",
        actorSubjectId: "admin-1",
        auditEventId: "audit-self-remove",
        occurredAt: timestamp,
      }),
    ).rejects.toThrow(
      "The acting administrator cannot remove their own role-management grant from this screen.",
    );
    expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM role_bindings WHERE id = ?")
        .get("binding-admin"),
    ).toEqual({ count: 1 });
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
