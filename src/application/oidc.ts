import type { AuthenticatedPrincipal } from "./authentication";
import type { Clock } from "./session";

export interface OidcProviderConfiguration {
  id: string;
  issuer: string;
  clientId: string;
  authorizationEndpoint: string;
  redirectUri: string;
}

export interface OidcAuthorizationTransaction {
  transactionId: string;
  providerId: string;
  stateVerifier: string;
  nonceVerifier: string;
  pkceVerifier: string;
  returnTo: string;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
}

export interface OidcAuthorizationTransactionStore {
  save(transaction: OidcAuthorizationTransaction): Promise<void>;
  find(transactionId: string): Promise<OidcAuthorizationTransaction | null>;
  consume(transactionId: string, consumedAt: string): Promise<boolean>;
  cleanup(inactiveBefore: string): Promise<number>;
}

export interface OidcSecurityPrimitives {
  randomHex(byteLength: number): Promise<string>;
  randomPkceVerifier(): Promise<string>;
  sha256Hex(value: string): Promise<string>;
  sha256Base64Url(value: string): Promise<string>;
}

export interface OidcAuthorizationCodeExchange {
  exchange(input: {
    provider: OidcProviderConfiguration;
    authorizationCode: string;
    pkceVerifier: string;
  }): Promise<{ idToken: string }>;
}

export interface OidcIdTokenValidator {
  validate(input: {
    provider: OidcProviderConfiguration;
    idToken: string;
    expectedNonceVerifier: string;
  }): Promise<AuthenticatedPrincipal>;
}

export type OidcAuthenticationRejectionCode =
  | "unknown_provider"
  | "invalid_return_target"
  | "invalid_callback"
  | "transaction_missing"
  | "transaction_expired"
  | "transaction_replayed"
  | "state_mismatch"
  | "code_exchange_rejected"
  | "token_malformed"
  | "unsupported_algorithm"
  | "signing_key_rejected"
  | "invalid_signature"
  | "unknown_issuer"
  | "wrong_audience"
  | "token_expired"
  | "token_not_yet_valid"
  | "token_issued_at_invalid"
  | "invalid_subject"
  | "nonce_mismatch";

export type OidcSecurityEvent =
  | {
      type: "authentication.succeeded";
      providerId: string;
      occurredAt: string;
    }
  | {
      type: "authentication.rejected";
      providerId?: string;
      reasonCode: OidcAuthenticationRejectionCode;
      occurredAt: string;
    };

export interface OidcSecurityAuditSink {
  record(event: OidcSecurityEvent): Promise<void>;
}

export class OidcAuthenticationError extends Error {
  public constructor(
    public readonly reasonCode: OidcAuthenticationRejectionCode,
  ) {
    super("Authentication failed.");
    this.name = "OidcAuthenticationError";
  }
}

export interface OidcAuthorizationStart {
  transactionId: string;
  authorizationUrl: string;
  expiresAt: string;
}

export interface OidcAuthorizationCompletion {
  principal: AuthenticatedPrincipal;
  returnTo: string;
}

const maxAuthorizationTransactionLifetimeMs = 10 * 60 * 1000;
const maxReturnTargetLength = 512;
const maxProviderIdentifierLength = 100;
const maxAuthorizationCodeLength = 4096;
const opaqueTransactionPattern = /^[0-9a-f]{64}$/u;
const verifierDigestPattern = /^[0-9a-f]{64}$/u;
const pkceVerifierPattern = /^[A-Za-z0-9._~-]{43,128}$/u;

export class OidcAuthorizationService {
  private readonly providers = new Map<string, OidcProviderConfiguration>();

  public constructor(
    providers: readonly OidcProviderConfiguration[],
    private readonly transactions: OidcAuthorizationTransactionStore,
    private readonly codeExchange: OidcAuthorizationCodeExchange,
    private readonly tokenValidator: OidcIdTokenValidator,
    private readonly security: OidcSecurityPrimitives,
    private readonly clock: Clock,
    private readonly transactionLifetimeMs: number,
    private readonly audit?: OidcSecurityAuditSink,
  ) {
    if (
      !Number.isSafeInteger(transactionLifetimeMs) ||
      transactionLifetimeMs <= 0 ||
      transactionLifetimeMs > maxAuthorizationTransactionLifetimeMs
    ) {
      throw new Error(
        "OIDC authorization transaction lifetime must be between 1 ms and 10 minutes.",
      );
    }
    if (providers.length === 0) {
      throw new Error("At least one OIDC provider configuration is required.");
    }
    for (const provider of providers) {
      const normalized = normalizeProviderConfiguration(provider);
      if (this.providers.has(normalized.id)) {
        throw new Error("OIDC provider identifiers must be unique.");
      }
      this.providers.set(normalized.id, normalized);
    }
  }

  public async begin(
    providerId: string,
    returnTo: string,
  ): Promise<OidcAuthorizationStart> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      await this.reject("unknown_provider");
    }

    let normalizedReturnTo: string;
    try {
      normalizedReturnTo = normalizeReturnTarget(returnTo);
    } catch {
      await this.reject("invalid_return_target", provider.id);
    }

    const now = this.clock.now();
    const transactionId = await this.security.randomHex(32);
    const state = await this.security.randomHex(32);
    const nonce = await this.security.randomHex(32);
    const pkceVerifier = await this.security.randomPkceVerifier();
    assertOpaqueTransactionIdentifier(transactionId);
    assertOpaqueTransactionIdentifier(state);
    assertOpaqueTransactionIdentifier(nonce);
    if (!pkceVerifierPattern.test(pkceVerifier)) {
      throw new Error(
        "OIDC PKCE verifier generator returned an invalid value.",
      );
    }

    const stateVerifier = await this.security.sha256Hex(state);
    const nonceVerifier = await this.security.sha256Hex(nonce);
    assertVerifierDigest(stateVerifier);
    assertVerifierDigest(nonceVerifier);
    const expiresAt = new Date(
      now.getTime() + this.transactionLifetimeMs,
    ).toISOString();

    await this.transactions.save({
      transactionId,
      providerId: provider.id,
      stateVerifier,
      nonceVerifier,
      pkceVerifier,
      returnTo: normalizedReturnTo,
      createdAt: now.toISOString(),
      expiresAt,
    });

    const authorizationUrl = new URL(provider.authorizationEndpoint);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("scope", "openid");
    authorizationUrl.searchParams.set("client_id", provider.clientId);
    authorizationUrl.searchParams.set("redirect_uri", provider.redirectUri);
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("nonce", nonce);
    authorizationUrl.searchParams.set(
      "code_challenge",
      await this.security.sha256Base64Url(pkceVerifier),
    );
    authorizationUrl.searchParams.set("code_challenge_method", "S256");

    return {
      transactionId,
      authorizationUrl: authorizationUrl.href,
      expiresAt,
    };
  }

  public async complete(input: {
    transactionId: string;
    state: string;
    authorizationCode: string;
  }): Promise<OidcAuthorizationCompletion> {
    if (
      !opaqueTransactionPattern.test(input.transactionId) ||
      !opaqueTransactionPattern.test(input.state) ||
      input.authorizationCode.length === 0 ||
      input.authorizationCode.length > maxAuthorizationCodeLength ||
      containsControlCharacter(input.authorizationCode)
    ) {
      await this.reject("invalid_callback");
    }

    const transaction = await this.transactions.find(input.transactionId);
    if (!transaction) {
      await this.reject("transaction_missing");
    }
    const provider = this.providers.get(transaction.providerId);
    if (!provider) {
      await this.reject("unknown_provider", transaction.providerId);
    }

    const now = this.clock.now();
    if (transaction.consumedAt !== undefined) {
      await this.reject("transaction_replayed", provider.id);
    }
    if (Date.parse(transaction.expiresAt) <= now.getTime()) {
      await this.reject("transaction_expired", provider.id);
    }

    const presentedStateVerifier = await this.security.sha256Hex(input.state);
    if (presentedStateVerifier !== transaction.stateVerifier) {
      await this.reject("state_mismatch", provider.id);
    }

    const consumed = await this.transactions.consume(
      transaction.transactionId,
      now.toISOString(),
    );
    if (!consumed) {
      await this.reject("transaction_replayed", provider.id);
    }

    let tokenResponse: { idToken: string };
    try {
      tokenResponse = await this.codeExchange.exchange({
        provider,
        authorizationCode: input.authorizationCode,
        pkceVerifier: transaction.pkceVerifier,
      });
    } catch {
      await this.reject("code_exchange_rejected", provider.id);
    }

    let principal: AuthenticatedPrincipal;
    try {
      principal = await this.tokenValidator.validate({
        provider,
        idToken: tokenResponse.idToken,
        expectedNonceVerifier: transaction.nonceVerifier,
      });
    } catch (error) {
      if (error instanceof OidcAuthenticationError) {
        await this.reject(error.reasonCode, provider.id);
      }
      throw error;
    }

    await this.audit?.record({
      type: "authentication.succeeded",
      providerId: provider.id,
      occurredAt: now.toISOString(),
    });
    return { principal, returnTo: transaction.returnTo };
  }

  public async cleanupExpiredTransactions(
    inactiveBefore: Date = this.clock.now(),
  ): Promise<number> {
    if (!Number.isFinite(inactiveBefore.getTime())) {
      throw new Error("OIDC transaction cleanup timestamp is invalid.");
    }
    return this.transactions.cleanup(inactiveBefore.toISOString());
  }

  private async reject(
    reasonCode: OidcAuthenticationRejectionCode,
    providerId?: string,
  ): Promise<never> {
    await this.audit?.record({
      type: "authentication.rejected",
      ...(providerId ? { providerId } : {}),
      reasonCode,
      occurredAt: this.clock.now().toISOString(),
    });
    throw new OidcAuthenticationError(reasonCode);
  }
}

export function normalizeReturnTarget(value: string): string {
  if (
    value.length === 0 ||
    value.length > maxReturnTargetLength ||
    containsControlCharacter(value) ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    throw new Error("OIDC return target is invalid.");
  }

  const applicationOrigin = "https://document-control.invalid";
  const parsed = new URL(value, applicationOrigin);
  if (
    parsed.origin !== applicationOrigin ||
    !parsed.pathname.startsWith("/app")
  ) {
    throw new Error("OIDC return target is outside the application boundary.");
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function normalizeProviderConfiguration(
  provider: OidcProviderConfiguration,
): OidcProviderConfiguration {
  const id = provider.id.trim();
  if (
    id.length === 0 ||
    id.length > maxProviderIdentifierLength ||
    containsControlCharacter(id)
  ) {
    throw new Error("OIDC provider identifier is invalid.");
  }

  const issuer = normalizeHttpsUrl(provider.issuer, "OIDC issuer");
  const authorizationEndpoint = normalizeHttpsUrl(
    provider.authorizationEndpoint,
    "OIDC authorization endpoint",
  );
  const redirectUri = normalizeHttpsUrl(
    provider.redirectUri,
    "OIDC redirect URI",
  );
  const clientId = provider.clientId.trim();
  if (
    clientId.length === 0 ||
    clientId.length > 512 ||
    containsControlCharacter(clientId)
  ) {
    throw new Error("OIDC client identifier is invalid.");
  }

  return { id, issuer, clientId, authorizationEndpoint, redirectUri };
}

function normalizeHttpsUrl(value: string, label: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error(`${label} must be a bounded HTTPS URL.`);
  }
  return url.href;
}

function assertOpaqueTransactionIdentifier(value: string): void {
  if (!opaqueTransactionPattern.test(value)) {
    throw new Error("OIDC security generator returned an invalid identifier.");
  }
}

function assertVerifierDigest(value: string): void {
  if (!verifierDigestPattern.test(value)) {
    throw new Error("OIDC security primitive returned an invalid digest.");
  }
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) {
      return true;
    }
  }
  return false;
}
