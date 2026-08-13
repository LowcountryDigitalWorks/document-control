import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  buildProviderSubjectMappingKey,
  IdentityMappingService,
  type AuthenticatedPrincipal,
} from "../../src/application/authentication";
import { AuthorizationDeniedError } from "../../src/application/authorization";
import type {
  DatabaseProvider,
  DatabaseResult,
  DatabaseStatement,
} from "../../src/application/ports";
import { SessionService, type Clock } from "../../src/application/session";
import { TenantContextDeniedError } from "../../src/application/tenant-context";
import { DatabaseAuthorizationPolicy } from "../../src/infrastructure/database-authorization-policy";
import { DatabaseIdentityMappingStore } from "../../src/infrastructure/database-identity-mapping-store";
import { DatabaseTenantContextResolver } from "../../src/infrastructure/database-tenant-context-resolver";
import { InMemorySessionStore } from "../../src/local-auth/in-memory-session-store";
import {
  applyMigrationFiles,
  loadOrderedMigrations,
} from "../../scripts/migration-files";

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
    const results: DatabaseResult[] = [];
    for (const statement of statements) {
      results.push(await this.execute(statement.sql, statement.parameters));
    }
    return results;
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
  const database = new DatabaseSync(":memory:");
  applyMigrationFiles(database, await loadOrderedMigrations());
  return database;
}

function run(
  database: DatabaseSync,
  sql: string,
  ...parameters: SqlValue[]
): void {
  database.prepare(sql).run(...parameters);
}

const principal: AuthenticatedPrincipal = {
  provider: "entra",
  issuer: "https://login.example.test/directory/v2.0",
  subject: "immutable-directory-object-1",
  authenticatedAt: "2026-08-13T01:00:00.000Z",
  email: "not-authority@example.test",
  displayName: "Not Authority",
};

async function seed(database: DatabaseSync): Promise<void> {
  const timestamp = "2026-08-13T01:00:00.000Z";
  run(
    database,
    "INSERT INTO identity_subjects (id, display_name, email, provider, provider_subject, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    "subject-authenticated",
    "Mapped User",
    "mapped@example.test",
    principal.provider,
    buildProviderSubjectMappingKey(principal),
    timestamp,
  );
  for (const suffix of ["a", "b"]) {
    run(
      database,
      "INSERT INTO tenants (id, name, slug, created_at) VALUES (?, ?, ?, ?)",
      `tenant-${suffix}`,
      `Tenant ${suffix.toUpperCase()}`,
      `tenant-${suffix}`,
      timestamp,
    );
    run(
      database,
      "INSERT INTO workspaces (id, tenant_id, name, created_at) VALUES (?, ?, ?, ?)",
      `workspace-${suffix}`,
      `tenant-${suffix}`,
      `Workspace ${suffix.toUpperCase()}`,
      timestamp,
    );
  }
  run(
    database,
    "INSERT INTO tenant_memberships (id, tenant_id, subject_id, status, created_at) VALUES ('membership-a', 'tenant-a', 'subject-authenticated', 'active', ?)",
    timestamp,
  );
  run(
    database,
    "INSERT INTO role_bindings (id, role_definition_id, subject_id, tenant_id, workspace_id, created_at) VALUES ('binding-a', 'role-author', 'subject-authenticated', 'tenant-a', 'workspace-a', ?)",
    timestamp,
  );
}

describe("authenticated tenant and authorization boundary", () => {
  it("re-checks live membership and role authority after session issuance", async () => {
    const database = await createDatabase();
    await seed(database);
    const provider = new SqliteDatabaseProvider(database);
    const mapping = new IdentityMappingService(
      new DatabaseIdentityMappingStore(provider),
    );
    const store = new InMemorySessionStore();
    const clock: Clock = {
      now: () => new Date("2026-08-13T01:01:00.000Z"),
    };
    const sessions = new SessionService(
      mapping,
      store,
      { async generate() { return "c".repeat(64); } },
      clock,
      30 * 60 * 1000,
    );
    const tenantContext = new DatabaseTenantContextResolver(provider);
    const authorization = new DatabaseAuthorizationPolicy(provider);
    const session = await sessions.establish(principal);
    const authenticated = await sessions.resolve(session.sessionId);

    await expect(
      tenantContext.resolve(
        authenticated.subjectId,
        "tenant-a",
        "workspace-a",
      ),
    ).resolves.toEqual({
      subjectId: "subject-authenticated",
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
    });
    await expect(
      authorization.assertAllowed({
        subjectId: authenticated.subjectId,
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
        permission: "document.create",
      }),
    ).resolves.toBeUndefined();

    run(
      database,
      "UPDATE tenant_memberships SET status = 'suspended' WHERE id = 'membership-a'",
    );
    await expect(sessions.resolve(session.sessionId)).resolves.toMatchObject({
      subjectId: "subject-authenticated",
    });
    await expect(
      tenantContext.resolve(
        authenticated.subjectId,
        "tenant-a",
        "workspace-a",
      ),
    ).rejects.toBeInstanceOf(TenantContextDeniedError);
    await expect(
      authorization.assertAllowed({
        subjectId: authenticated.subjectId,
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
        permission: "document.create",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);

    run(
      database,
      "UPDATE tenant_memberships SET status = 'active' WHERE id = 'membership-a'",
    );
    run(database, "DELETE FROM role_bindings WHERE id = 'binding-a'");
    await expect(
      tenantContext.resolve(
        authenticated.subjectId,
        "tenant-a",
        "workspace-a",
      ),
    ).resolves.toBeDefined();
    await expect(
      authorization.assertAllowed({
        subjectId: authenticated.subjectId,
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
        permission: "document.create",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);

    database.close();
  });

  it("treats browser tenant/workspace identifiers as selectors, not authority", async () => {
    const database = await createDatabase();
    await seed(database);
    const resolver = new DatabaseTenantContextResolver(
      new SqliteDatabaseProvider(database),
    );

    await expect(
      resolver.resolve("subject-authenticated", "tenant-b", "workspace-b"),
    ).rejects.toBeInstanceOf(TenantContextDeniedError);
    await expect(
      resolver.resolve("subject-authenticated", "tenant-a", "workspace-b"),
    ).rejects.toBeInstanceOf(TenantContextDeniedError);
    await expect(
      resolver.resolve("subject-authenticated", "tenant-b"),
    ).rejects.toBeInstanceOf(TenantContextDeniedError);

    database.close();
  });
});
