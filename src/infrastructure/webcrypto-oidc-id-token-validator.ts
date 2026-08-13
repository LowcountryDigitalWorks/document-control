import type { AuthenticatedPrincipal } from "../application/authentication";
import {
  OidcAuthenticationError,
  type OidcIdTokenValidator,
  type OidcProviderConfiguration,
  type OidcSecurityPrimitives,
} from "../application/oidc";
import type { Clock } from "../application/session";

export interface OidcSigningJwk extends JsonWebKey {
  kid?: string;
  alg?: string;
  use?: string;
}

export interface OidcProviderTrustConfiguration {
  providerId: string;
  issuer: string;
  clientId: string;
  signingKeys: readonly OidcSigningJwk[];
}

type JwtHeader = {
  alg?: unknown;
  kid?: unknown;
  typ?: unknown;
};

type JwtClaims = Record<string, unknown>;

const maxSubjectLength = 512;
const maxEmailLength = 320;
const maxDisplayNameLength = 200;

export class WebCryptoOidcIdTokenValidator implements OidcIdTokenValidator {
  private readonly trust = new Map<string, OidcProviderTrustConfiguration>();

  public constructor(
    configurations: readonly OidcProviderTrustConfiguration[],
    private readonly security: OidcSecurityPrimitives,
    private readonly clock: Clock,
    private readonly clockSkewSeconds = 60,
    private readonly maxTokenAgeSeconds = 10 * 60,
  ) {
    if (
      configurations.length === 0 ||
      !Number.isSafeInteger(clockSkewSeconds) ||
      clockSkewSeconds < 0 ||
      clockSkewSeconds > 300 ||
      !Number.isSafeInteger(maxTokenAgeSeconds) ||
      maxTokenAgeSeconds <= 0 ||
      maxTokenAgeSeconds > 60 * 60
    ) {
      throw new Error("OIDC token validation policy is invalid.");
    }
    for (const configuration of configurations) {
      if (configuration.signingKeys.length === 0) {
        throw new Error("OIDC provider trust requires signing keys.");
      }
      if (this.trust.has(configuration.providerId)) {
        throw new Error("OIDC provider trust identifiers must be unique.");
      }
      this.trust.set(configuration.providerId, {
        ...configuration,
        signingKeys: configuration.signingKeys.map((key) => ({ ...key })),
      });
    }
  }

  public async validate(input: {
    provider: OidcProviderConfiguration;
    idToken: string;
    expectedNonceVerifier: string;
  }): Promise<AuthenticatedPrincipal> {
    const trust = this.trust.get(input.provider.id);
    if (
      !trust ||
      trust.issuer !== input.provider.issuer ||
      trust.clientId !== input.provider.clientId
    ) {
      throw new OidcAuthenticationError("unknown_issuer");
    }

    const parts = input.idToken.split(".");
    if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
      throw new OidcAuthenticationError("token_malformed");
    }
    const [encodedHeader, encodedPayload, encodedSignature] = parts as [
      string,
      string,
      string,
    ];
    const header = parseJsonObject<JwtHeader>(
      decodeBase64Url(encodedHeader),
      "token_malformed",
    );
    if (header.alg !== "RS256") {
      throw new OidcAuthenticationError("unsupported_algorithm");
    }
    if (header.typ !== undefined && header.typ !== "JWT") {
      throw new OidcAuthenticationError("token_malformed");
    }

    const signingKey = selectSigningKey(trust.signingKeys, header.kid);
    let cryptoKey: CryptoKey;
    try {
      cryptoKey = await crypto.subtle.importKey(
        "jwk",
        signingKey,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
    } catch {
      throw new OidcAuthenticationError("signing_key_rejected");
    }

    let decodedSignature: Uint8Array;
    try {
      decodedSignature = decodeBase64Url(encodedSignature);
    } catch {
      throw new OidcAuthenticationError("token_malformed");
    }
    const signature: Uint8Array<ArrayBuffer> = new Uint8Array(
      decodedSignature.byteLength,
    );
    signature.set(decodedSignature);
    const signingInput = new TextEncoder().encode(
      `${encodedHeader}.${encodedPayload}`,
    );
    let signatureValid: boolean;
    try {
      signatureValid = await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        cryptoKey,
        signature,
        signingInput,
      );
    } catch {
      throw new OidcAuthenticationError("invalid_signature");
    }
    if (!signatureValid) {
      throw new OidcAuthenticationError("invalid_signature");
    }

    const claims = parseJsonObject<JwtClaims>(
      decodeBase64Url(encodedPayload),
      "token_malformed",
    );
    validateIssuerAndAudience(claims, trust);
    validateTimes(
      claims,
      this.clock.now(),
      this.clockSkewSeconds,
      this.maxTokenAgeSeconds,
    );

    const subject = readRequiredBoundedString(
      claims.sub,
      maxSubjectLength,
      "invalid_subject",
    );
    const nonce = readRequiredBoundedString(
      claims.nonce,
      512,
      "nonce_mismatch",
    );
    const nonceVerifier = await this.security.sha256Hex(nonce);
    if (nonceVerifier !== input.expectedNonceVerifier) {
      throw new OidcAuthenticationError("nonce_mismatch");
    }

    const issuedAt = claims.iat as number;
    const email = readOptionalPresentationString(claims.email, maxEmailLength);
    const displayName = readOptionalPresentationString(
      claims.name,
      maxDisplayNameLength,
    );

    return {
      provider: "oidc",
      issuer: trust.issuer,
      subject,
      authenticatedAt: new Date(issuedAt * 1000).toISOString(),
      ...(email ? { email } : {}),
      ...(displayName ? { displayName } : {}),
    };
  }
}

function selectSigningKey(
  keys: readonly OidcSigningJwk[],
  presentedKid: unknown,
): OidcSigningJwk {
  if (typeof presentedKid !== "string" || presentedKid.length === 0) {
    throw new OidcAuthenticationError("signing_key_rejected");
  }
  const matches = keys.filter(
    (key) =>
      key.kid === presentedKid &&
      key.kty === "RSA" &&
      (key.use === undefined || key.use === "sig") &&
      (key.alg === undefined || key.alg === "RS256"),
  );
  if (matches.length !== 1) {
    throw new OidcAuthenticationError("signing_key_rejected");
  }
  return matches[0] as OidcSigningJwk;
}

function validateIssuerAndAudience(
  claims: JwtClaims,
  trust: OidcProviderTrustConfiguration,
): void {
  if (claims.iss !== trust.issuer) {
    throw new OidcAuthenticationError("unknown_issuer");
  }

  const audiences = Array.isArray(claims.aud)
    ? claims.aud.filter(
        (audience): audience is string => typeof audience === "string",
      )
    : typeof claims.aud === "string"
      ? [claims.aud]
      : [];
  if (
    audiences.length === 0 ||
    !audiences.includes(trust.clientId) ||
    (Array.isArray(claims.aud) && audiences.length !== claims.aud.length)
  ) {
    throw new OidcAuthenticationError("wrong_audience");
  }
  if (audiences.length > 1 && claims.azp !== trust.clientId) {
    throw new OidcAuthenticationError("wrong_audience");
  }
}

function validateTimes(
  claims: JwtClaims,
  now: Date,
  clockSkewSeconds: number,
  maxTokenAgeSeconds: number,
): void {
  const exp = readNumericDate(claims.exp, "token_expired");
  const iat = readNumericDate(claims.iat, "token_issued_at_invalid");
  const nbf =
    claims.nbf === undefined
      ? undefined
      : readNumericDate(claims.nbf, "token_not_yet_valid");
  const nowSeconds = Math.floor(now.getTime() / 1000);

  if (exp <= nowSeconds - clockSkewSeconds) {
    throw new OidcAuthenticationError("token_expired");
  }
  if (nbf !== undefined && nbf > nowSeconds + clockSkewSeconds) {
    throw new OidcAuthenticationError("token_not_yet_valid");
  }
  if (
    iat > nowSeconds + clockSkewSeconds ||
    iat < nowSeconds - maxTokenAgeSeconds - clockSkewSeconds ||
    iat >= exp
  ) {
    throw new OidcAuthenticationError("token_issued_at_invalid");
  }
}

function readNumericDate(
  value: unknown,
  reason: "token_expired" | "token_not_yet_valid" | "token_issued_at_invalid",
): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new OidcAuthenticationError(reason);
  }
  return value as number;
}

function readRequiredBoundedString(
  value: unknown,
  maxLength: number,
  reason: "invalid_subject" | "nonce_mismatch",
): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxLength ||
    value !== value.trim() ||
    containsControlCharacter(value)
  ) {
    throw new OidcAuthenticationError(reason);
  }
  return value;
}

function readOptionalPresentationString(
  value: unknown,
  maxLength: number,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > maxLength ||
    containsControlCharacter(normalized)
  ) {
    return undefined;
  }
  return normalized;
}

function parseJsonObject<T extends object>(
  bytes: Uint8Array,
  reason: "token_malformed",
): T {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error("JWT member is not an object.");
    }
    return parsed as T;
  } catch {
    throw new OidcAuthenticationError(reason);
  }
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new OidcAuthenticationError("token_malformed");
  }
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/") + padding;
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new OidcAuthenticationError("token_malformed");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
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
