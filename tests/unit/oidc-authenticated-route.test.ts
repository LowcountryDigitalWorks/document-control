import { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  buildProviderSubjectMappingKey,
  IdentityMappingService,
  UnknownIdentityMappingError,
  type AuthenticatedPrincipal,
} from "../../src/application/authentication";
import { AuthorizationDeniedError } from "../../src/application/authorization";
import {
  OidcAuthenticationError,
  OidcAuthorizationService,
  type OidcAuthorizationCodeExchange,
  type OidcProviderConfiguration,
} from "../../src/application/oidc";
import type {
  DatabaseProvider,
  DatabaseResult,
  DatabaseStatement,
} from "../../src/application/ports";
import { SessionService, type Clock } from "../../src/application/session";
import { TenantContextDeniedError } from "../../src/application/tenant-context";
import {
  authenticatedSessionCookieName,
  clearAuthenticatedSessionCookie,
  createAuthenticatedSessionCookie,
  createAuthenticationMiddleware,
  type AuthenticatedHttpEnvironment,
} from "../../src/http/authentication";
import {
  clearOidcAuthorizationTransactionCookie,
  createOidcAuthorizationTransactionCookie,
  readOidcCallbackInput,
} from "../../src/http/oidc";
import { DatabaseAuthorizationPolicy } from "../../src/infrastructure/database-authorization-policy";
import { DatabaseIdentityMappingStore } from "../../src/infrastructure/database-identity-mapping-store";
import { DatabaseSessionStore } from "../../src/infrastructure/database-session-store";
import { DatabaseTenantContextResolver } from "../../src/infrastructure/database-tenant-context-resolver";
import { Sha256SessionTokenVerifier } from "../../src/infrastructure/sha256-session-token-verifier";
import { WebCryptoOidcIdTokenValidator } from "../../src/infrastructure/webcrypto-oidc-id-token-validator";
import { WebCryptoOidcSecurityPrimitives } from "../../src/infrastructure/webcrypto-oidc-security";
import { InMemoryOidcAuthorizationTransactionStore } from "../../src/local-auth/in-memory-oidc-authorization-transaction-store";
import {
  applyMigrationFiles,
  loadOrderedMigrations,
} from "../../scripts/migration-files";
import { createSyntheticOidcSigningFixture } from "./oidc-test-helpers";

type SqlValue = string | number | bigint | Uint8Array | null;

type RegisteredExchange = {
  expectedChallenge: string;
  idToken: string;
};

const providerConfiguration: OidcProviderConfiguration = {
  id: "synthetic-route-oidc",
  issuer: "https://identity.example.test/route-tenant/v2.0",
  clientId: "document-control-route-test",
  authorizationEndpoint: "https://identity.example.test/oauth2/v2.0/authorize",
  redirectUri: "https://app.example.test/auth/oidc/callback",
};

const timestamp = "2026-08-13T02:30:00.000Z";
const nowSeconds = Date.parse(timestamp) / 1000;

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

class SyntheticAuthorizationCodeExchange implements OidcAuthorizationCodeExchange {
  private readonly exchanges = new Map<string, RegisteredExchange>();

  public constructor(
    private readonly security: WebCryptoOidcSecurityPrimitives,
  ) {}

  public register(
    authorizationCode: string,
    expectedChallenge: string,
    idToken: string,
  ): void {
    this.exchanges.set(authorizationCode, { expectedChallenge, idToken });
  }

  public async exchange(input: {
    provider: OidcProviderConfiguration;
    authorizationCode: string;
    pkceVerifier: string;
  }): Promise<{ idToken: string }> {
    const registered = this.exchanges.get(input.authorizationCode);
    if (!registered || input.provider.id !== providerConfiguration.id) {
      throw new Error("Synthetic authorization code rejected.");
    }
    if (
      (await this.security.sha256Base64Url(input.pkceVerifier)) !==
      registered.expectedChallenge
    ) {
      throw new Error("Synthetic PKCE verification failed.");
    }
    return { idToken: registered.idToken };
  }
}

async function createHarness() {
  const database = new DatabaseSync(":memory:");
  applyMigrationFiles(database, await loadOrderedMigrations());
  const databaseProvider = new TransactionalSqliteDatabaseProvider(database);
  const signing = await createSyntheticOidcSigningFixture("route-test-key");
  const security = new WebCryptoOidcSecurityPrimitives();
  const exchange = new SyntheticAuthorizationCodeExchange(security);
  const clock: Clock = { now: () => new Date(timestamp) };

  const mappedPrincipal: AuthenticatedPrincipal = {
    provider: "oidc",
    issuer: providerConfiguration.issuer,
    subject: "mapped-route-subject",
    authenticatedAt: timestamp,
  };
  seedApplicationState(database, mappedPrincipal);

  const oidc = new OidcAuthorizationService(
    [providerConfiguration],
    new InMemoryOidcAuthorizationTransactionStore(),
    exchange,
    new WebCryptoOidcIdTokenValidator(
      [
        {
          providerId: providerConfiguration.id,
          issuer: providerConfiguration.issuer,
          clientId: providerConfiguration.clientId,
          signingKeys: [signing.publicJwk],
        },
      ],
      security,
      clock,
      0,
      10 * 60,
    ),
    security,
    clock,
    5 * 60 * 1000,
  );

  let sessionCounter = 0;
  const sessions = new SessionService(
    new IdentityMappingService(
      new DatabaseIdentityMappingStore(databaseProvider),
    ),
    new DatabaseSessionStore(databaseProvider),
    {
      async generate() {
        sessionCounter += 1;
        return sessionCounter.toString(16).padStart(64, "0");
      },
    },
    new Sha256SessionTokenVerifier(),
    clock,
    30 * 60 * 1000,
  );
  const tenantContext = new DatabaseTenantContextResolver(databaseProvider);
  const authorization = new DatabaseAuthorizationPolicy(databaseProvider);

  const app = new Hono<AuthenticatedHttpEnvironment>();
  app.get("/auth/oidc/start", async (context) => {
    try {
      const start = await oidc.begin(
        providerConfiguration.id,
        context.req.query("returnTo") ?? "/app/protected/tenant-a/workspace-a",
      );
      context.header(
        "Set-Cookie",
        createOidcAuthorizationTransactionCookie(
          start.transactionId,
          context.req.url,
          5 * 60,
        ),
      );
      return context.redirect(start.authorizationUrl, 302);
    } catch (error) {
      if (error instanceof OidcAuthenticationError) {
        return context.text("Authentication failed.", 401);
      }
      throw error;
    }
  });

  app.get("/auth/oidc/callback", async (context) => {
    try {
      const callback = readOidcCallbackInput(
        context.req.url,
        context.req.header("Cookie"),
      );
      if (!callback) return context.text("Authentication failed.", 401);
      const completion = await oidc.complete(callback);
      const session = await sessions.establish(completion.principal);
      const maxAge = Math.floor(
        (Date.parse(session.expiresAt) - Date.parse(timestamp)) / 1000,
      );
      context.header(
        "Set-Cookie",
        clearOidcAuthorizationTransactionCookie(context.req.url),
      );
      context.header(
        "Set-Cookie",
        createAuthenticatedSessionCookie(
          session.bearerToken,
          context.req.url,
          maxAge,
        ),
        { append: true },
      );
      return context.redirect(completion.returnTo, 303);
    } catch (error) {
      if (
        error instanceof OidcAuthenticationError ||
        error instanceof UnknownIdentityMappingError
      ) {
        return context.text("Authentication failed.", 401);
      }
      throw error;
    }
  });

  app.use("/app/*", createAuthenticationMiddleware(sessions));
  app.get("/app/protected/:tenantId/:workspaceId", async (context) => {
    const authenticated = context.get("authenticated");
    try {
      const resolved = await tenantContext.resolve(
        authenticated.subjectId,
        context.req.param("tenantId"),
        context.req.param("workspaceId"),
      );
      await authorization.assertAllowed({
        subjectId: resolved.subjectId,
        tenantId: resolved.tenantId,
        workspaceId: resolved.workspaceId,
        permission: "document.create",
      });
      return context.json({
        subjectId: resolved.subjectId,
        tenantId: resolved.tenantId,
        workspaceId: resolved.workspaceId,
      });
    } catch (error) {
      if (
        error instanceof TenantContextDeniedError ||
        error instanceof AuthorizationDeniedError
      ) {
        return context.text("Not available.", 404);
      }
      throw error;
    }
  });

  app.post("/app/logout", async (context) => {
    const cookieHeader = context.req.header("Cookie") ?? "";
    const match = cookieHeader.match(
      new RegExp(`${authenticatedSessionCookieName}=([0-9a-f]{64})`, "u"),
    );
    if (match?.[1]) await sessions.revoke(match[1]);
    context.header(
      "Set-Cookie",
      clearAuthenticatedSessionCookie(context.req.url),
    );
    return context.text("Signed out.");
  });

  return { database, signing, exchange, app };
}

function seedApplicationState(
  database: DatabaseSync,
  mappedPrincipal: AuthenticatedPrincipal,
): void {
  run(
    database,
    "INSERT INTO identity_subjects (id, display_name, provider, provider_subject, created_at) VALUES (?, ?, ?, ?, ?)",
    "subject-route",
    "Mapped Route Subject",
    mappedPrincipal.provider,
    buildProviderSubjectMappingKey(mappedPrincipal),
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
    "INSERT INTO tenant_memberships (id, tenant_id, subject_id, status, created_at) VALUES ('membership-route', 'tenant-a', 'subject-route', 'active', ?)",
    timestamp,
  );
  run(
    database,
    "INSERT INTO role_bindings (id, role_definition_id, subject_id, tenant_id, workspace_id, created_at) VALUES ('binding-route', 'role-author', 'subject-route', 'tenant-a', 'workspace-a', ?)",
    timestamp,
  );
}

async function performOidcLogin(
  harness: Awaited<ReturnType<typeof createHarness>>,
  subject = "mapped-route-subject",
): Promise<{ sessionCookie: string; transactionCookie: string }> {
  const startResponse = await harness.app.request(
    "https://app.example.test/auth/oidc/start?returnTo=%2Fapp%2Fprotected%2Ftenant-a%2Fworkspace-a",
  );
  expect(startResponse.status).toBe(302);
  const authorizationLocation = startResponse.headers.get("location");
  const transactionSetCookie = startResponse.headers.get("set-cookie");
  if (!authorizationLocation || !transactionSetCookie) {
    throw new Error("OIDC start response was incomplete.");
  }
  const transactionCookie = readCookiePair(
    transactionSetCookie,
    "ldw_oidc_authorization_transaction",
  );
  const authorizationUrl = new URL(authorizationLocation);
  const state = authorizationUrl.searchParams.get("state");
  const nonce = authorizationUrl.searchParams.get("nonce");
  const codeChallenge = authorizationUrl.searchParams.get("code_challenge");
  if (!state || !nonce || !codeChallenge) {
    throw new Error("OIDC authorization request was incomplete.");
  }

  const idToken = await harness.signing.sign({
    iss: providerConfiguration.issuer,
    aud: providerConfiguration.clientId,
    sub: subject,
    nonce,
    iat: nowSeconds - 30,
    nbf: nowSeconds - 30,
    exp: nowSeconds + 5 * 60,
  });
  const authorizationCode = `route-code-${subject}`;
  harness.exchange.register(authorizationCode, codeChallenge, idToken);

  const callbackResponse = await harness.app.request(
    `https://app.example.test/auth/oidc/callback?state=${encodeURIComponent(state)}&code=${encodeURIComponent(authorizationCode)}`,
    { headers: { Cookie: transactionCookie } },
  );
  if (subject !== "mapped-route-subject") {
    expect(callbackResponse.status).toBe(401);
    expect(await callbackResponse.text()).toBe("Authentication failed.");
    expect(callbackResponse.headers.get("set-cookie") ?? "").not.toContain(
      authenticatedSessionCookieName,
    );
    return { sessionCookie: "", transactionCookie };
  }

  expect(callbackResponse.status).toBe(303);
  expect(callbackResponse.headers.get("location")).toBe(
    "/app/protected/tenant-a/workspace-a",
  );
  const callbackSetCookie = callbackResponse.headers.get("set-cookie");
  if (!callbackSetCookie) throw new Error("OIDC callback did not set cookies.");
  const sessionCookie = readCookiePair(
    callbackSetCookie,
    authenticatedSessionCookieName,
  );
  return { sessionCookie, transactionCookie };
}

function readCookiePair(setCookieHeader: string, name: string): string {
  const match = setCookieHeader.match(
    new RegExp(`${name}=([A-Za-z0-9._~-]+)`, "u"),
  );
  if (!match?.[1]) throw new Error(`Cookie ${name} was not present.`);
  return `${name}=${match[1]}`;
}

function run(
  database: DatabaseSync,
  sql: string,
  ...parameters: SqlValue[]
): void {
  database.prepare(sql).run(...parameters);
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

describe("test-only authenticated OIDC route composition", () => {
  it("flows signed OIDC through mapping, durable session, current tenant context, and current permission authorization", async () => {
    const harness = await createHarness();
    const { sessionCookie } = await performOidcLogin(harness);

    const valid = await harness.app.request(
      "https://app.example.test/app/protected/tenant-a/workspace-a",
      { headers: { Cookie: sessionCookie } },
    );
    expect(valid.status).toBe(200);
    expect(await valid.json()).toEqual({
      subjectId: "subject-route",
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
    });

    const stored = harness.database
      .prepare(
        "SELECT verifier, subject_id, revoked_at FROM authenticated_sessions",
      )
      .get() as {
      verifier: string;
      subject_id: string;
      revoked_at: string | null;
    };
    const rawBearer = sessionCookie.split("=")[1] as string;
    expect(stored.verifier).not.toBe(rawBearer);
    expect(JSON.stringify(stored)).not.toContain(rawBearer);

    const crossTenant = await harness.app.request(
      "https://app.example.test/app/protected/tenant-b/workspace-b",
      { headers: { Cookie: sessionCookie } },
    );
    expect(crossTenant.status).toBe(404);
    expect(await crossTenant.text()).toBe("Not available.");

    run(
      harness.database,
      "UPDATE tenant_memberships SET status = 'suspended' WHERE id = 'membership-route'",
    );
    const suspended = await harness.app.request(
      "https://app.example.test/app/protected/tenant-a/workspace-a",
      { headers: { Cookie: sessionCookie } },
    );
    expect(suspended.status).toBe(404);

    run(
      harness.database,
      "UPDATE tenant_memberships SET status = 'active' WHERE id = 'membership-route'",
    );
    run(
      harness.database,
      "DELETE FROM role_bindings WHERE id = 'binding-route'",
    );
    const roleRemoved = await harness.app.request(
      "https://app.example.test/app/protected/tenant-a/workspace-a",
      { headers: { Cookie: sessionCookie } },
    );
    expect(roleRemoved.status).toBe(404);

    harness.database.close();
  });

  it("keeps unknown identities and the synthetic demo cookie outside the production-style authenticated boundary", async () => {
    const harness = await createHarness();
    await performOidcLogin(harness, "unknown-route-subject");

    const demoCookieAttempt = await harness.app.request(
      "https://app.example.test/app/protected/tenant-a/workspace-a",
      { headers: { Cookie: "ldw_guided_demo_session=demo-session-123" } },
    );
    expect(demoCookieAttempt.status).toBe(401);
    expect(await demoCookieAttempt.text()).toBe("Authentication required.");

    harness.database.close();
  });

  it("revokes on logout, clears the bounded authenticated cookie, and immediately denies the old bearer", async () => {
    const harness = await createHarness();
    const { sessionCookie } = await performOidcLogin(harness);

    const logout = await harness.app.request(
      "https://app.example.test/app/logout",
      {
        method: "POST",
        headers: { Cookie: sessionCookie },
      },
    );
    expect(logout.status).toBe(200);
    expect(logout.headers.get("set-cookie")).toContain(
      `${authenticatedSessionCookieName}=; Path=/app; Max-Age=0; HttpOnly; SameSite=Lax; Secure`,
    );

    const afterLogout = await harness.app.request(
      "https://app.example.test/app/protected/tenant-a/workspace-a",
      { headers: { Cookie: sessionCookie } },
    );
    expect(afterLogout.status).toBe(401);

    harness.database.close();
  });
});
