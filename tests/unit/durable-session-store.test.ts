import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  buildProviderSubjectMappingKey,
  IdentityMappingService,
  type AuthenticatedPrincipal,
} from "../../src/application/authentication";
import type {
  DatabaseProvider,
  DatabaseResult,
  DatabaseStatement,
} from "../../src/application/ports";
import {
  AuthenticationRequiredError,
  SessionService,
  type Clock,
  type SessionIdGenerator,
} from "../../src/application/session";
import { DatabaseIdentityMappingStore } from "../../src/infrastructure/database-identity-mapping-store";
import { DatabaseSessionStore } from "../../src/infrastructure/database-session-store";
import { Sha256SessionTokenVerifier } from "../../src/infrastructure/sha256-session-token-verifier";
import {
  applyMigrationFiles,
  loadOrderedMigrations,
} from "../../scripts/migration-files";

type SqlValue = string | number | bigint | Uint8Array | null;

class TransactionalSqliteDatabaseProvider implements DatabaseProvider {
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
      const results: DatabaseResult[] = [];
      for (const statement of statements) {
        results.push(await this.execute(statement.sql, statement.parameters));
      }
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

class SequenceSessionIdGenerator implements SessionIdGenerator {
  private index = 0;

  public constructor(private readonly tokens: readonly string[]) {}

  public async generate(): Promise<string> {
    const token = this.tokens[this.index++];
    if (!token) throw new Error("No test session token remains.");
    return token;
  }
}

const principal: AuthenticatedPrincipal = {
  provider: "oidc",
  issuer: "https://identity.example.test/tenant",
  subject: "immutable-subject",
  authenticatedAt: "2026-08-13T02:00:00.000Z",
};

async function createHarness(tokens: readonly string[] = [
  "a".repeat(64),
  "b".repeat(64),
]) {
  const database = new DatabaseSync(":memory:");
  applyMigrationFiles(database, await loadOrderedMigrations());
  const timestamp = "2026-08-13T02:00:00.000Z";
  database
    .prepare(
      "INSERT INTO identity_subjects (id, display_name, provider, provider_subject, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      "subject-session",
      "Session Subject",
      principal.provider,
      buildProviderSubjectMappingKey(principal),
      timestamp,
    );

  let now = new Date("2026-08-13T02:01:00.000Z");
  const provider = new TransactionalSqliteDatabaseProvider(database);
  const verifier = new Sha256SessionTokenVerifier();
  const sessions = new SessionService(
    new IdentityMappingService(new DatabaseIdentityMappingStore(provider)),
    new DatabaseSessionStore(provider),
    new SequenceSessionIdGenerator(tokens),
    verifier,
    { now: () => new Date(now) } satisfies Clock,
    30 * 60 * 1000,
  );

  return {
    database,
    provider,
    verifier,
    sessions,
    setNow(value: string) {
      now = new Date(value);
    },
  };
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

describe("D1/SQLite durable authenticated session store", () => {
  it("persists only a non-reversible fixed verifier and resolves the raw bearer through it", async () => {
    const harness = await createHarness();
    const session = await harness.sessions.establish(principal);
    const verifier = await harness.verifier.derive(session.bearerToken);
    const row = harness.database
      .prepare(
        "SELECT verifier, subject_id, revoked_at FROM authenticated_sessions",
      )
      .get() as {
      verifier: string;
      subject_id: string;
      revoked_at: string | null;
    };

    expect(row.verifier).toBe(verifier);
    expect(row.verifier).not.toBe(session.bearerToken);
    expect(row.verifier).toMatch(/^[0-9a-f]{64}$/u);
    expect(JSON.stringify(row)).not.toContain(session.bearerToken);
    await expect(
      harness.sessions.resolve(session.bearerToken),
    ).resolves.toMatchObject({ subjectId: "subject-session" });
    await expect(
      harness.sessions.resolve("f".repeat(64)),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);

    harness.database.close();
  });

  it("atomically revokes the old verifier when rotating and rolls back on verifier collision", async () => {
    const harness = await createHarness();
    const original = await harness.sessions.establish(principal);
    const originalVerifier = await harness.verifier.derive(original.bearerToken);
    const collisionVerifier = await harness.verifier.derive("b".repeat(64));

    harness.database
      .prepare(
        "INSERT INTO authenticated_sessions (verifier, subject_id, authenticated_at, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        collisionVerifier,
        "subject-session",
        principal.authenticatedAt,
        "2026-08-13T02:00:30.000Z",
        "2026-08-13T02:31:00.000Z",
      );

    await expect(harness.sessions.rotate(original.bearerToken)).rejects.toThrow();
    const originalAfterCollision = harness.database
      .prepare(
        "SELECT revoked_at FROM authenticated_sessions WHERE verifier = ?",
      )
      .get(originalVerifier) as { revoked_at: string | null };
    expect(originalAfterCollision.revoked_at).toBeNull();
    await expect(
      harness.sessions.resolve(original.bearerToken),
    ).resolves.toBeDefined();
    harness.database.close();

    const successful = await createHarness([
      "c".repeat(64),
      "d".repeat(64),
    ]);
    const first = await successful.sessions.establish(principal);
    successful.setNow("2026-08-13T02:05:00.000Z");
    const rotated = await successful.sessions.rotate(first.bearerToken);
    const firstVerifier = await successful.verifier.derive(first.bearerToken);
    const rotatedVerifier = await successful.verifier.derive(
      rotated.bearerToken,
    );
    const rows = successful.database
      .prepare(
        "SELECT verifier, revoked_at FROM authenticated_sessions ORDER BY created_at",
      )
      .all() as { verifier: string; revoked_at: string | null }[];
    expect(rows).toEqual([
      { verifier: firstVerifier, revoked_at: "2026-08-13T02:05:00.000Z" },
      { verifier: rotatedVerifier, revoked_at: null },
    ]);
    await expect(
      successful.sessions.resolve(first.bearerToken),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    await expect(
      successful.sessions.resolve(rotated.bearerToken),
    ).resolves.toBeDefined();
    successful.database.close();
  });

  it("denies revocation and expiry immediately regardless of asynchronous cleanup timing", async () => {
    const revoked = await createHarness();
    const revokedSession = await revoked.sessions.establish(principal);
    await revoked.sessions.revoke(revokedSession.bearerToken);
    expect(
      revoked.database
        .prepare("SELECT COUNT(*) AS count FROM authenticated_sessions")
        .get(),
    ).toEqual({ count: 1 });
    await expect(
      revoked.sessions.resolve(revokedSession.bearerToken),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    expect(await revoked.sessions.cleanupInactiveSessions()).toBe(1);
    revoked.database.close();

    const expired = await createHarness();
    const expiredSession = await expired.sessions.establish(principal);
    expired.setNow("2026-08-13T02:31:00.000Z");
    expect(
      expired.database
        .prepare("SELECT COUNT(*) AS count FROM authenticated_sessions")
        .get(),
    ).toEqual({ count: 1 });
    await expect(
      expired.sessions.resolve(expiredSession.bearerToken),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    expect(await expired.sessions.cleanupInactiveSessions()).toBe(1);
    expired.database.close();
  });
});
