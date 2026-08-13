import { readFile } from "node:fs/promises";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  IdentityMappingService,
  type AuthenticatedPrincipal,
  type IdentityMappingStore,
} from "../../src/application/authentication";
import { SessionService, type Clock } from "../../src/application/session";
import { hasSameOrigin } from "../../src/http/demo-session";
import {
  authenticatedSessionCookieName,
  clearAuthenticatedSessionCookie,
  createAuthenticatedSessionCookie,
  createAuthenticationMiddleware,
  type AuthenticatedHttpEnvironment,
} from "../../src/http/authentication";
import { InMemorySessionStore } from "../../src/local-auth/in-memory-session-store";

const principal: AuthenticatedPrincipal = {
  provider: "external",
  issuer: "urn:ldw:test-identity",
  subject: "deterministic-test-subject",
  authenticatedAt: "2026-08-13T01:00:00.000Z",
};

function createHarness() {
  let now = new Date("2026-08-13T01:01:00.000Z");
  const store = new InMemorySessionStore();
  const mappingStore: IdentityMappingStore = {
    async findByProviderIdentity() {
      return { subjectId: "subject-http-1" };
    },
  };
  let counter = 0;
  const clock: Clock = { now: () => new Date(now) };
  const sessions = new SessionService(
    new IdentityMappingService(mappingStore),
    store,
    {
      async generate() {
        counter += 1;
        return counter.toString(16).padStart(64, "0");
      },
    },
    clock,
    30 * 60 * 1000,
  );
  const app = new Hono<AuthenticatedHttpEnvironment>();
  app.use("/protected/*", createAuthenticationMiddleware(sessions));
  app.get("/protected/context", (context) =>
    context.json(context.get("authenticated")),
  );

  return {
    app,
    sessions,
    store,
    setNow(value: string) {
      now = new Date(value);
    },
  };
}

describe("HTTP authenticated-session boundary", () => {
  it("requires an authenticated context and returns bounded failures", async () => {
    const harness = createHarness();
    const missing = await harness.app.request(
      "http://example.test/protected/context",
    );
    expect(missing.status).toBe(401);
    expect(await missing.text()).toBe("Authentication required.");

    const session = await harness.sessions.establish(principal);
    const authenticated = await harness.app.request(
      "http://example.test/protected/context",
      {
        headers: {
          Cookie: `${authenticatedSessionCookieName}=${session.sessionId}`,
        },
      },
    );
    expect(authenticated.status).toBe(200);
    expect(await authenticated.json()).toEqual({
      subjectId: "subject-http-1",
      authenticatedAt: "2026-08-13T01:00:00.000Z",
      createdAt: "2026-08-13T01:01:00.000Z",
      expiresAt: "2026-08-13T01:31:00.000Z",
    });
  });

  it("denies the same protected route after session expiry or revocation", async () => {
    const expired = createHarness();
    const expiredSession = await expired.sessions.establish(principal);
    expired.setNow("2026-08-13T01:31:00.000Z");
    const expiredResponse = await expired.app.request(
      "http://example.test/protected/context",
      {
        headers: {
          Cookie: `${authenticatedSessionCookieName}=${expiredSession.sessionId}`,
        },
      },
    );
    expect(expiredResponse.status).toBe(401);

    const revoked = createHarness();
    const revokedSession = await revoked.sessions.establish(principal);
    await revoked.sessions.revoke(revokedSession.sessionId);
    const revokedResponse = await revoked.app.request(
      "http://example.test/protected/context",
      {
        headers: {
          Cookie: `${authenticatedSessionCookieName}=${revokedSession.sessionId}`,
        },
      },
    );
    expect(revokedResponse.status).toBe(401);
  });

  it("uses conservative bounded cookie semantics without reusing the synthetic demo cookie", () => {
    const sessionId = "d".repeat(64);
    expect(
      createAuthenticatedSessionCookie(
        sessionId,
        "https://app.example.test/",
        1800,
      ),
    ).toBe(
      `${authenticatedSessionCookieName}=${sessionId}; Path=/; Max-Age=1800; HttpOnly; SameSite=Strict; Secure`,
    );
    expect(
      createAuthenticatedSessionCookie(
        sessionId,
        "http://localhost:8787/",
        1800,
      ),
    ).not.toContain("Secure");
    expect(clearAuthenticatedSessionCookie("https://app.example.test/")).toBe(
      `${authenticatedSessionCookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict; Secure`,
    );
    expect(authenticatedSessionCookieName).not.toBe("ldw_guided_demo_session");
  });

  it("keeps production-auth contracts unwired from the existing synthetic /demo application", async () => {
    const appSource = await readFile(
      new URL("../../src/http/app.ts", import.meta.url),
      "utf8",
    );
    const demoSource = await readFile(
      new URL("../../src/http/demo-session.ts", import.meta.url),
      "utf8",
    );

    expect(appSource).not.toContain("createAuthenticationMiddleware");
    expect(appSource).not.toContain("local-auth");
    expect(demoSource).toContain("ldw_guided_demo_session");
    expect(demoSource).not.toContain(authenticatedSessionCookieName);
    expect(hasSameOrigin("https://app.example.test/path", "https://app.example.test")).toBe(true);
    expect(hasSameOrigin("https://app.example.test/path", "https://evil.example.test")).toBe(false);
  });
});
