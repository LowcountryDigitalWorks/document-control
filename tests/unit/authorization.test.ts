import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { AuthorizationDeniedError } from "../../src/application/authorization";
import type {
  DatabaseProvider,
  DatabaseResult,
  DatabaseStatement,
} from "../../src/application/ports";
import { DatabaseAuthorizationPolicy } from "../../src/infrastructure/database-authorization-policy";

const timestamp = "2026-08-10T20:20:00.000Z";

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
  return database;
}

function run(
  database: DatabaseSync,
  sql: string,
  ...parameters: SqlValue[]
): void {
  database.prepare(sql).run(...parameters);
}

function seedAuthorizationScenario(database: DatabaseSync): void {
  for (const subject of ["author", "viewer", "platform"]) {
    run(
      database,
      "INSERT INTO identity_subjects (id, display_name, provider, provider_subject, created_at) VALUES (?, ?, 'external', ?, ?)",
      `subject-${subject}`,
      subject,
      subject,
      timestamp,
    );
  }

  for (const tenant of ["a", "b"]) {
    run(
      database,
      "INSERT INTO tenants (id, name, slug, created_at) VALUES (?, ?, ?, ?)",
      `tenant-${tenant}`,
      `Tenant ${tenant.toUpperCase()}`,
      `tenant-${tenant}`,
      timestamp,
    );
    run(
      database,
      "INSERT INTO workspaces (id, tenant_id, name, created_at) VALUES (?, ?, ?, ?)",
      `workspace-${tenant}`,
      `tenant-${tenant}`,
      `Workspace ${tenant.toUpperCase()}`,
      timestamp,
    );
  }

  for (const subject of ["author", "viewer"]) {
    run(
      database,
      "INSERT INTO tenant_memberships (id, tenant_id, subject_id, status, created_at) VALUES (?, 'tenant-a', ?, 'active', ?)",
      `membership-${subject}`,
      `subject-${subject}`,
      timestamp,
    );
  }

  run(
    database,
    "INSERT INTO role_bindings (id, role_definition_id, subject_id, tenant_id, workspace_id, created_at) VALUES ('binding-author', 'role-author', 'subject-author', 'tenant-a', 'workspace-a', ?)",
    timestamp,
  );
  run(
    database,
    "INSERT INTO role_bindings (id, role_definition_id, subject_id, tenant_id, workspace_id, created_at) VALUES ('binding-viewer', 'role-viewer', 'subject-viewer', 'tenant-a', 'workspace-a', ?)",
    timestamp,
  );
  run(
    database,
    "INSERT INTO role_bindings (id, role_definition_id, subject_id, tenant_id, workspace_id, created_at) VALUES ('binding-platform', 'role-platform-admin', 'subject-platform', NULL, NULL, ?)",
    timestamp,
  );

  run(
    database,
    "INSERT INTO documents (id, tenant_id, workspace_id, title, status, current_version_id, template_provenance, created_at, updated_at) VALUES ('document-a', 'tenant-a', 'workspace-a', 'Document A', 'draft', NULL, 'none', ?, ?)",
    timestamp,
    timestamp,
  );
  run(
    database,
    "INSERT INTO documents (id, tenant_id, workspace_id, title, status, current_version_id, template_provenance, created_at, updated_at) VALUES ('document-b', 'tenant-b', 'workspace-b', 'Document B', 'draft', NULL, 'none', ?, ?)",
    timestamp,
    timestamp,
  );
}

describe("database authorization policy", () => {
  it("allows configured author permissions only inside the bound workspace", async () => {
    const database = await createDatabase();
    seedAuthorizationScenario(database);
    const policy = new DatabaseAuthorizationPolicy(
      new SqliteDatabaseProvider(database),
    );

    await expect(
      policy.assertAllowed({
        subjectId: "subject-author",
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
        permission: "document.create",
      }),
    ).resolves.toBeUndefined();
    await expect(
      policy.assertAllowed({
        subjectId: "subject-author",
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
        permission: "template.use",
      }),
    ).resolves.toBeUndefined();
    await expect(
      policy.assertAllowed({
        subjectId: "subject-author",
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
        permission: "document.approve",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      policy.assertAllowed({
        subjectId: "subject-author",
        tenantId: "tenant-b",
        workspaceId: "workspace-b",
        permission: "document.create",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it("resolves document scope and enforces viewer permissions", async () => {
    const database = await createDatabase();
    seedAuthorizationScenario(database);
    const policy = new DatabaseAuthorizationPolicy(
      new SqliteDatabaseProvider(database),
    );

    await expect(
      policy.assertAllowed({
        subjectId: "subject-viewer",
        tenantId: "tenant-a",
        documentId: "document-a",
        permission: "document.read",
      }),
    ).resolves.toBeUndefined();
    await expect(
      policy.assertAllowed({
        subjectId: "subject-viewer",
        tenantId: "tenant-a",
        documentId: "document-a",
        permission: "document.version.create",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it("allows a platform administrator across tenants without tenant membership", async () => {
    const database = await createDatabase();
    seedAuthorizationScenario(database);
    const policy = new DatabaseAuthorizationPolicy(
      new SqliteDatabaseProvider(database),
    );

    await expect(
      policy.assertAllowed({
        subjectId: "subject-platform",
        tenantId: "tenant-b",
        documentId: "document-b",
        permission: "document.approve",
      }),
    ).resolves.toBeUndefined();
  });

  it("denies an inactive tenant membership even when a scoped role binding exists", async () => {
    const database = await createDatabase();
    seedAuthorizationScenario(database);
    run(
      database,
      "UPDATE tenant_memberships SET status = 'suspended' WHERE id = 'membership-author'",
    );
    const policy = new DatabaseAuthorizationPolicy(
      new SqliteDatabaseProvider(database),
    );

    await expect(
      policy.assertAllowed({
        subjectId: "subject-author",
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
        permission: "document.create",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });
});
