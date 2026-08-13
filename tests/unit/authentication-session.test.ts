import { describe, expect, it } from "vitest";
import {
  buildProviderSubjectMappingKey,
  IdentityMappingService,
  UnknownIdentityMappingError,
  type AuthenticatedPrincipal,
  type IdentityMappingStore,
  type NormalizedIdentity,
} from "../../src/application/authentication";
import {
  AuthenticationRequiredError,
  SessionService,
  type Clock,
  type SessionIdGenerator,
  type SessionSecurityEvent,
} from "../../src/application/session";
import { Sha256SessionTokenVerifier } from "../../src/infrastructure/sha256-session-token-verifier";
import { DeterministicIdentityAdapter } from "../../src/local-auth/deterministic-identity-adapter";
import { InMemorySessionStore } from "../../src/local-auth/in-memory-session-store";

const principal: AuthenticatedPrincipal = {
  provider: "oidc",
  issuer: "https://identity.example.test/tenant-a",
  subject: "immutable-object-id-123",
  authenticatedAt: "2026-08-13T01:00:00.000Z",
  email: "presentation-only@example.test",
  displayName: "Presentation Only",
};

class TestIdentityMappingStore implements IdentityMappingStore {
  public constructor(
    private readonly mappings: ReadonlyMap<string, NormalizedIdentity>,
  ) {}

  public async findByProviderIdentity(
    provider: AuthenticatedPrincipal["provider"],
    providerSubject: string,
  ): Promise<NormalizedIdentity | null> {
    return this.mappings.get(`${provider}:${providerSubject}`) ?? null;
  }
}

class SequenceSessionIdGenerator implements SessionIdGenerator {
  private index = 0;

  public constructor(private readonly identifiers: readonly string[]) {}

  public async generate(): Promise<string> {
    const value = this.identifiers[this.index++];
    if (!value) throw new Error("No deterministic session ID remains.");
    return value;
  }
}

function createHarness() {
  let now = new Date("2026-08-13T01:01:00.000Z");
  const events: SessionSecurityEvent[] = [];
  const mappingKey = `${principal.provider}:${buildProviderSubjectMappingKey(principal)}`;
  const mapping = new IdentityMappingService(
    new TestIdentityMappingStore(
      new Map([[mappingKey, { subjectId: "subject-internal-1" }]]),
    ),
  );
  const store = new InMemorySessionStore();
  const clock: Clock = { now: () => new Date(now) };
  const service = new SessionService(
    mapping,
    store,
    new SequenceSessionIdGenerator(["a".repeat(64), "b".repeat(64)]),
    new Sha256SessionTokenVerifier(),
    clock,
    30 * 60 * 1000,
    {
      async record(event) {
        events.push(event);
      },
    },
  );
  return {
    mapping,
    store,
    service,
    events,
    setNow(value: string) {
      now = new Date(value);
    },
  };
}

describe("provider-neutral authentication and session core", () => {
  it("maps immutable provider issuer+subject while treating email/display name as presentation only", async () => {
    const harness = createHarness();
    const adapter = new DeterministicIdentityAdapter({
      ...principal,
      email: " changed@example.test ",
      displayName: " Changed Name ",
    });
    const authenticated = await adapter.authenticate();
    const resolved = await harness.mapping.resolve(authenticated);

    expect(resolved.identity.subjectId).toBe("subject-internal-1");
    expect(resolved.principal.email).toBe("changed@example.test");
    expect(resolved.principal.displayName).toBe("Changed Name");
    expect(buildProviderSubjectMappingKey(principal)).toBe(
      JSON.stringify([principal.issuer, principal.subject]),
    );
  });

  it("fails closed for unknown issuer/subject mappings even when presentation metadata matches", async () => {
    const harness = createHarness();
    await expect(
      harness.mapping.resolve({
        ...principal,
        issuer: "https://identity.example.test/tenant-b",
      }),
    ).rejects.toBeInstanceOf(UnknownIdentityMappingError);
  });

  it("issues opaque bounded bearer tokens and exposes only normalized request context", async () => {
    const harness = createHarness();
    const session = await harness.service.establish(principal);

    expect(session.bearerToken).toMatch(/^[0-9a-f]{64}$/u);
    expect(session.subjectId).toBe("subject-internal-1");
    expect(session.expiresAt).toBe("2026-08-13T01:31:00.000Z");
    const resolved = await harness.service.resolve(session.bearerToken);
    expect(resolved).toEqual({
      subjectId: "subject-internal-1",
      authenticatedAt: "2026-08-13T01:00:00.000Z",
      createdAt: "2026-08-13T01:01:00.000Z",
      expiresAt: "2026-08-13T01:31:00.000Z",
    });

    const serializedSecurityState = JSON.stringify({
      resolved,
      events: harness.events,
    });
    expect(serializedSecurityState).not.toContain(session.bearerToken);
    expect(serializedSecurityState).not.toContain(
      "presentation-only@example.test",
    );
    expect(serializedSecurityState).not.toContain("Presentation Only");
    expect(serializedSecurityState).not.toMatch(
      /accessToken|refreshToken|idToken|password|mfa/iu,
    );
  });

  it("denies expired and explicitly revoked sessions independent of cleanup", async () => {
    const expired = createHarness();
    const expiredSession = await expired.service.establish(principal);
    expired.setNow("2026-08-13T01:31:00.000Z");
    await expect(
      expired.service.resolve(expiredSession.bearerToken),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);

    const revoked = createHarness();
    const revokedSession = await revoked.service.establish(principal);
    await revoked.service.revoke(revokedSession.bearerToken);
    await expect(
      revoked.service.resolve(revokedSession.bearerToken),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    expect(revoked.events.map((event) => event.type)).toEqual([
      "session.established",
      "session.revoked",
    ]);
  });

  it("rotates the bearer token and durable verifier without extending the original expiry", async () => {
    const harness = createHarness();
    const original = await harness.service.establish(principal);
    harness.setNow("2026-08-13T01:05:00.000Z");
    const rotated = await harness.service.rotate(original.bearerToken);

    expect(rotated.bearerToken).not.toBe(original.bearerToken);
    expect(rotated.expiresAt).toBe(original.expiresAt);
    await expect(
      harness.service.resolve(original.bearerToken),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    await expect(
      harness.service.resolve(rotated.bearerToken),
    ).resolves.toMatchObject({
      subjectId: "subject-internal-1",
      expiresAt: original.expiresAt,
    });
    expect(harness.events.map((event) => event.type)).toEqual([
      "session.established",
      "session.rotated",
    ]);
  });
});
