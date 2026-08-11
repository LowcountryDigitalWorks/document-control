import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  AuthorizationDeniedError,
  DatabaseAuthorizationPolicy,
} from "../../src/application/authorization";
import { MemberAdminService } from "../../src/application/member-admin-service";
import type {
  DatabaseProvider,
  DatabaseResult,
  DatabaseStatement,
} from "../../src/application/ports";

const timestamp = "2026-08-11T22:30:00.000Z";
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
  provider: SqliteDatabaseProvider;
  service: MemberAdminService;
}> {
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
    VALUES ('tenant-1', 'Tenant One', 'tenant-one', '${timestamp}');
    INSERT INTO workspaces (id, tenant_id, name, created_at)
    VALUES ('workspace-1', 'tenant-1', 'Operations', '${timestamp}');
    INSERT INTO identity_subjects
      (id, display_name, email, provider, provider_subject, created_at)
    VALUES
      ('admin-1', 'Admin One', 'admin@example.com', 'external', 'admin-1', '${timestamp}'),
      ('entra-1', 'Entra Member', 'entra@example.com', 'entra', 'entra-object-1', '${timestamp}');
    INSERT INTO tenant_memberships (id, tenant_id, subject_id, status, created_at)
    VALUES
      ('membership-admin', 'tenant-1', 'admin-1', 'active', '${timestamp}'),
      ('membership-entra', 'tenant-1', 'entra-1', 'active', '${timestamp}');
    INSERT INTO role_bindings
      (id, role_definition_id, subject_id, tenant_id, workspace_id, created_at)
    VALUES
      ('binding-admin', 'role-tenant-admin', 'admin-1', 'tenant-1', NULL, '${timestamp}'),
      ('binding-entra-viewer', 'role-viewer', 'entra-1', 'tenant-1', 'workspace-1', '${timestamp}');
  `);
  const provider = new SqliteDatabaseProvider(database);
  return {
    database,
    provider,
    service: new MemberAdminService(provider),
  };
}

describe("MemberAdminService", () => {
  it("creates a staged app-local member without credentials and activates it", async () => {
    const { database, service } = await createHarness();
    const created = await service.createDirectMember({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      membershipId: "membership-local-1",
      subjectId: "subject-local-1",
      providerSubject: "local-subject-1",
      displayName: "  Jordan   Smith ",
      email: "JORDAN@example.com",
      initialStatus: "invited",
      actorSubjectId: "admin-1",
      auditEventId: "audit-member-created",
      occurredAt: timestamp,
    });

    expect(created.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          membershipId: "membership-local-1",
          subjectId: "subject-local-1",
          displayName: "Jordan Smith",
          email: "jordan@example.com",
          provider: "local",
          providerSubject: "local-subject-1",
          status: "invited",
        }),
      ]),
    );
    expect(
      database
        .prepare(
          "SELECT event_type, entity_type FROM audit_events WHERE id = ?",
        )
        .get("audit-member-created"),
    ).toEqual({
      event_type: "tenant.membership.created",
      entity_type: "tenant_membership",
    });

    const activated = await service.transitionMembership({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      membershipId: "membership-local-1",
      targetStatus: "active",
      actorSubjectId: "admin-1",
      auditEventId: "audit-member-activated",
      occurredAt: timestamp,
    });
    expect(
      activated.members.find(
        (member) => member.membershipId === "membership-local-1",
      )?.status,
    ).toBe("active");
  });

  it("suspends an Entra-backed member without deleting role bindings and immediately denies authorization", async () => {
    const { database, provider, service } = await createHarness();
    const authorization = new DatabaseAuthorizationPolicy(provider);

    await expect(
      authorization.assertAllowed({
        subjectId: "entra-1",
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        permission: "document.read",
      }),
    ).resolves.toBeUndefined();

    const suspended = await service.transitionMembership({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      membershipId: "membership-entra",
      targetStatus: "suspended",
      actorSubjectId: "admin-1",
      auditEventId: "audit-member-suspended",
      occurredAt: timestamp,
    });
    expect(
      suspended.members.find(
        (member) => member.membershipId === "membership-entra",
      ),
    ).toMatchObject({
      provider: "entra",
      status: "suspended",
      workspaceRoleBindingCount: 1,
    });
    expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM role_bindings WHERE id = ?")
        .get("binding-entra-viewer"),
    ).toEqual({ count: 1 });
    await expect(
      authorization.assertAllowed({
        subjectId: "entra-1",
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        permission: "document.read",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it("blocks self-suspension and duplicate tenant email provisioning", async () => {
    const { service } = await createHarness();
    await expect(
      service.transitionMembership({
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        membershipId: "membership-admin",
        targetStatus: "suspended",
        actorSubjectId: "admin-1",
        auditEventId: "audit-self-suspend",
        occurredAt: timestamp,
      }),
    ).rejects.toThrow(/cannot suspend their own membership/iu);

    await expect(
      service.createDirectMember({
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        membershipId: "membership-duplicate",
        subjectId: "subject-duplicate",
        providerSubject: "local-duplicate",
        displayName: "Duplicate Member",
        email: "ENTRA@example.com",
        initialStatus: "active",
        actorSubjectId: "admin-1",
        auditEventId: "audit-duplicate",
        occurredAt: timestamp,
      }),
    ).rejects.toThrow(/email address already exists/iu);
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
