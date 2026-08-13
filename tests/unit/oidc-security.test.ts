import { describe, expect, it } from "vitest";
import {
  OidcAuthenticationError,
  OidcAuthorizationService,
  normalizeReturnTarget,
  type OidcAuthorizationCodeExchange,
  type OidcProviderConfiguration,
  type OidcSecurityEvent,
} from "../../src/application/oidc";
import type { Clock } from "../../src/application/session";
import { WebCryptoOidcIdTokenValidator } from "../../src/infrastructure/webcrypto-oidc-id-token-validator";
import { WebCryptoOidcSecurityPrimitives } from "../../src/infrastructure/webcrypto-oidc-security";
import { InMemoryOidcAuthorizationTransactionStore } from "../../src/local-auth/in-memory-oidc-authorization-transaction-store";
import {
  createSyntheticOidcSigningFixture,
  tamperJwtSignature,
} from "./oidc-test-helpers";

const provider: OidcProviderConfiguration = {
  id: "synthetic-oidc",
  issuer: "https://identity.example.test/tenant/v2.0",
  clientId: "document-control-test-client",
  authorizationEndpoint:
    "https://identity.example.test/oauth2/v2.0/authorize",
  redirectUri: "https://app.example.test/auth/oidc/callback",
};

const nowIso = "2026-08-13T02:10:00.000Z";
const nowSeconds = Date.parse(nowIso) / 1000;

type RegisteredExchange = {
  expectedChallenge: string;
  idToken: string;
};

class SyntheticAuthorizationCodeExchange
  implements OidcAuthorizationCodeExchange
{
  private readonly exchanges = new Map<string, RegisteredExchange>();

  public constructor(private readonly security: WebCryptoOidcSecurityPrimitives) {}

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
    if (!registered || input.provider.id !== provider.id) {
      throw new Error("Synthetic authorization code rejected.");
    }
    const presentedChallenge = await this.security.sha256Base64Url(
      input.pkceVerifier,
    );
    if (presentedChallenge !== registered.expectedChallenge) {
      throw new Error("Synthetic PKCE verification failed.");
    }
    return { idToken: registered.idToken };
  }
}

async function createHarness() {
  let now = new Date(nowIso);
  const security = new WebCryptoOidcSecurityPrimitives();
  const signing = await createSyntheticOidcSigningFixture();
  const transactions = new InMemoryOidcAuthorizationTransactionStore();
  const exchange = new SyntheticAuthorizationCodeExchange(security);
  const events: OidcSecurityEvent[] = [];
  const clock: Clock = { now: () => new Date(now) };
  const validator = new WebCryptoOidcIdTokenValidator(
    [
      {
        providerId: provider.id,
        issuer: provider.issuer,
        clientId: provider.clientId,
        signingKeys: [signing.publicJwk],
      },
    ],
    security,
    clock,
    0,
    10 * 60,
  );
  const service = new OidcAuthorizationService(
    [provider],
    transactions,
    exchange,
    validator,
    security,
    clock,
    5 * 60 * 1000,
    {
      async record(event) {
        events.push(event);
      },
    },
  );

  return {
    service,
    signing,
    security,
    transactions,
    exchange,
    events,
    setNow(value: string) {
      now = new Date(value);
    },
  };
}

function validClaims(nonce: string): Record<string, unknown> {
  return {
    iss: provider.issuer,
    aud: provider.clientId,
    sub: "immutable-subject-123",
    nonce,
    iat: nowSeconds - 30,
    nbf: nowSeconds - 30,
    exp: nowSeconds + 5 * 60,
    email: "presentation-only@example.test",
    name: "Presentation Only",
  };
}

function readAuthorizationValues(authorizationUrl: string) {
  const url = new URL(authorizationUrl);
  const state = url.searchParams.get("state");
  const nonce = url.searchParams.get("nonce");
  const codeChallenge = url.searchParams.get("code_challenge");
  if (!state || !nonce || !codeChallenge) {
    throw new Error("Synthetic authorization request is incomplete.");
  }
  return { url, state, nonce, codeChallenge };
}

async function prepareCompletion(
  harness: Awaited<ReturnType<typeof createHarness>>,
  claimsTransform: (
    claims: Record<string, unknown>,
  ) => Record<string, unknown> = (claims) => claims,
) {
  const start = await harness.service.begin(
    provider.id,
    "/app/tenant-a/workspace-a",
  );
  const authorization = readAuthorizationValues(start.authorizationUrl);
  const claims = claimsTransform(validClaims(authorization.nonce));
  const idToken = await harness.signing.sign(claims);
  const authorizationCode = `code-${start.transactionId.slice(0, 16)}`;
  harness.exchange.register(
    authorizationCode,
    authorization.codeChallenge,
    idToken,
  );
  return { start, authorization, authorizationCode, idToken };
}

async function expectOidcRejection(
  promise: Promise<unknown>,
  reasonCode: OidcAuthenticationError["reasonCode"],
): Promise<void> {
  try {
    await promise;
    throw new Error("Expected OIDC authentication rejection.");
  } catch (error) {
    expect(error).toBeInstanceOf(OidcAuthenticationError);
    expect((error as OidcAuthenticationError).reasonCode).toBe(reasonCode);
    expect((error as Error).message).toBe("Authentication failed.");
  }
}

describe("OIDC Authorization Code security boundary", () => {
  it("creates a code-flow request with cryptographic state, nonce, and PKCE S256 and validates a signed assertion", async () => {
    const harness = await createHarness();
    const prepared = await prepareCompletion(harness);
    const { url, state, nonce } = prepared.authorization;

    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid");
    expect(url.searchParams.get("client_id")).toBe(provider.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(provider.redirectUri);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(state).toMatch(/^[0-9a-f]{64}$/u);
    expect(nonce).toMatch(/^[0-9a-f]{64}$/u);

    const stored = await harness.transactions.find(
      prepared.start.transactionId,
    );
    expect(stored).not.toBeNull();
    expect(stored?.stateVerifier).not.toBe(state);
    expect(stored?.nonceVerifier).not.toBe(nonce);
    expect(stored?.returnTo).toBe("/app/tenant-a/workspace-a");
    expect(stored?.pkceVerifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/u);

    const completion = await harness.service.complete({
      transactionId: prepared.start.transactionId,
      state,
      authorizationCode: prepared.authorizationCode,
    });
    expect(completion.returnTo).toBe("/app/tenant-a/workspace-a");
    expect(completion.principal).toEqual({
      provider: "oidc",
      issuer: provider.issuer,
      subject: "immutable-subject-123",
      authenticatedAt: new Date((nowSeconds - 30) * 1000).toISOString(),
      email: "presentation-only@example.test",
      displayName: "Presentation Only",
    });
    expect(harness.events).toEqual([
      {
        type: "authentication.succeeded",
        providerId: provider.id,
        occurredAt: nowIso,
      },
    ]);
  });

  it("fails closed for signature, issuer, audience, time, subject, and nonce failures", async () => {
    const signatureHarness = await createHarness();
    const signaturePrepared = await prepareCompletion(signatureHarness);
    signatureHarness.exchange.register(
      signaturePrepared.authorizationCode,
      signaturePrepared.authorization.codeChallenge,
      tamperJwtSignature(signaturePrepared.idToken),
    );
    await expectOidcRejection(
      signatureHarness.service.complete({
        transactionId: signaturePrepared.start.transactionId,
        state: signaturePrepared.authorization.state,
        authorizationCode: signaturePrepared.authorizationCode,
      }),
      "invalid_signature",
    );

    for (const [reasonCode, transform] of [
      [
        "unknown_issuer",
        (claims: Record<string, unknown>) => ({
          ...claims,
          iss: "https://identity.example.test/other/v2.0",
        }),
      ],
      [
        "wrong_audience",
        (claims: Record<string, unknown>) => ({
          ...claims,
          aud: "some-other-client",
        }),
      ],
      [
        "token_expired",
        (claims: Record<string, unknown>) => ({
          ...claims,
          exp: nowSeconds - 1,
        }),
      ],
      [
        "token_not_yet_valid",
        (claims: Record<string, unknown>) => ({
          ...claims,
          nbf: nowSeconds + 60,
        }),
      ],
      [
        "invalid_subject",
        (claims: Record<string, unknown>) => ({ ...claims, sub: "" }),
      ],
      [
        "nonce_mismatch",
        (claims: Record<string, unknown>) => ({
          ...claims,
          nonce: "f".repeat(64),
        }),
      ],
    ] as const) {
      const harness = await createHarness();
      const prepared = await prepareCompletion(harness, transform);
      await expectOidcRejection(
        harness.service.complete({
          transactionId: prepared.start.transactionId,
          state: prepared.authorization.state,
          authorizationCode: prepared.authorizationCode,
        }),
        reasonCode,
      );
    }
  });

  it("rejects state mismatch, PKCE mismatch, callback replay, and expired authorization transactions", async () => {
    const stateHarness = await createHarness();
    const statePrepared = await prepareCompletion(stateHarness);
    const wrongState = `${statePrepared.authorization.state.slice(0, -1)}${
      statePrepared.authorization.state.endsWith("a") ? "b" : "a"
    }`;
    await expectOidcRejection(
      stateHarness.service.complete({
        transactionId: statePrepared.start.transactionId,
        state: wrongState,
        authorizationCode: statePrepared.authorizationCode,
      }),
      "state_mismatch",
    );

    const pkceHarness = await createHarness();
    const pkcePrepared = await prepareCompletion(pkceHarness);
    pkceHarness.exchange.register(
      pkcePrepared.authorizationCode,
      await pkceHarness.security.sha256Base64Url(
        "z".repeat(43),
      ),
      pkcePrepared.idToken,
    );
    await expectOidcRejection(
      pkceHarness.service.complete({
        transactionId: pkcePrepared.start.transactionId,
        state: pkcePrepared.authorization.state,
        authorizationCode: pkcePrepared.authorizationCode,
      }),
      "code_exchange_rejected",
    );

    const replayHarness = await createHarness();
    const replayPrepared = await prepareCompletion(replayHarness);
    await replayHarness.service.complete({
      transactionId: replayPrepared.start.transactionId,
      state: replayPrepared.authorization.state,
      authorizationCode: replayPrepared.authorizationCode,
    });
    await expectOidcRejection(
      replayHarness.service.complete({
        transactionId: replayPrepared.start.transactionId,
        state: replayPrepared.authorization.state,
        authorizationCode: replayPrepared.authorizationCode,
      }),
      "transaction_replayed",
    );

    const expiredHarness = await createHarness();
    const expiredPrepared = await prepareCompletion(expiredHarness);
    expiredHarness.setNow("2026-08-13T02:16:00.000Z");
    await expectOidcRejection(
      expiredHarness.service.complete({
        transactionId: expiredPrepared.start.transactionId,
        state: expiredPrepared.authorization.state,
        authorizationCode: expiredPrepared.authorizationCode,
      }),
      "transaction_expired",
    );
  });

  it("rejects open redirects and keeps authentication audit events free of protocol secrets", async () => {
    expect(() => normalizeReturnTarget("/app/documents")).not.toThrow();
    for (const target of [
      "https://evil.example.test/app",
      "//evil.example.test/app",
      "/not-the-app",
      "/app\\evil.example.test",
    ]) {
      expect(() => normalizeReturnTarget(target)).toThrow();
    }

    const harness = await createHarness();
    await expectOidcRejection(
      harness.service.begin(provider.id, "https://evil.example.test/app"),
      "invalid_return_target",
    );

    const prepared = await prepareCompletion(harness);
    await harness.service.complete({
      transactionId: prepared.start.transactionId,
      state: prepared.authorization.state,
      authorizationCode: prepared.authorizationCode,
    });
    const serializedEvents = JSON.stringify(harness.events);
    expect(serializedEvents).not.toContain(prepared.authorization.state);
    expect(serializedEvents).not.toContain(prepared.authorization.nonce);
    expect(serializedEvents).not.toContain(prepared.authorizationCode);
    expect(serializedEvents).not.toContain(prepared.idToken);
    expect(serializedEvents).not.toContain(
      (await harness.transactions.find(prepared.start.transactionId))
        ?.pkceVerifier ?? "unreachable-test-value",
    );
  });
});
