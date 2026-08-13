export type ExternalAuthenticationProvider =
  | "oidc"
  | "saml"
  | "entra"
  | "external";

export interface AuthenticatedPrincipal {
  provider: ExternalAuthenticationProvider;
  issuer: string;
  subject: string;
  authenticatedAt: string;
  email?: string;
  displayName?: string;
}

export interface NormalizedIdentity {
  subjectId: string;
}

export interface IdentityMappingStore {
  findByProviderIdentity(
    provider: ExternalAuthenticationProvider,
    providerSubject: string,
  ): Promise<NormalizedIdentity | null>;
}

export class UnknownIdentityMappingError extends Error {
  public constructor() {
    super("The authenticated identity is not provisioned for this application.");
    this.name = "UnknownIdentityMappingError";
  }
}

const maxIssuerLength = 512;
const maxSubjectLength = 512;
const maxEmailLength = 320;
const maxDisplayNameLength = 200;

export function normalizeAuthenticatedPrincipal(
  principal: AuthenticatedPrincipal,
): AuthenticatedPrincipal {
  const issuer = normalizeRequiredIdentifier(
    principal.issuer,
    "Authentication issuer",
    maxIssuerLength,
  );
  const subject = normalizeRequiredIdentifier(
    principal.subject,
    "Authentication subject",
    maxSubjectLength,
  );
  const authenticatedAt = normalizeTimestamp(principal.authenticatedAt);
  const email = normalizeOptionalPresentationValue(
    principal.email,
    "Authentication email metadata",
    maxEmailLength,
  );
  const displayName = normalizeOptionalPresentationValue(
    principal.displayName,
    "Authentication display-name metadata",
    maxDisplayNameLength,
  );

  return {
    provider: principal.provider,
    issuer,
    subject,
    authenticatedAt,
    ...(email ? { email } : {}),
    ...(displayName ? { displayName } : {}),
  };
}

export function buildProviderSubjectMappingKey(
  principal: Pick<AuthenticatedPrincipal, "issuer" | "subject">,
): string {
  const issuer = normalizeRequiredIdentifier(
    principal.issuer,
    "Authentication issuer",
    maxIssuerLength,
  );
  const subject = normalizeRequiredIdentifier(
    principal.subject,
    "Authentication subject",
    maxSubjectLength,
  );
  return JSON.stringify([issuer, subject]);
}

export class IdentityMappingService {
  public constructor(private readonly store: IdentityMappingStore) {}

  public async resolve(
    principal: AuthenticatedPrincipal,
  ): Promise<{ identity: NormalizedIdentity; principal: AuthenticatedPrincipal }> {
    const normalized = normalizeAuthenticatedPrincipal(principal);
    const identity = await this.store.findByProviderIdentity(
      normalized.provider,
      buildProviderSubjectMappingKey(normalized),
    );
    if (!identity) {
      throw new UnknownIdentityMappingError();
    }
    return { identity, principal: normalized };
  }
}

function normalizeRequiredIdentifier(
  value: string,
  label: string,
  maxLength: number,
): string {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > maxLength ||
    containsControlCharacter(normalized)
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

function normalizeTimestamp(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("Authentication timestamp is invalid.");
  }
  return parsed.toISOString();
}

function normalizeOptionalPresentationValue(
  value: string | undefined,
  label: string,
  maxLength: number,
): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (normalized.length === 0) return undefined;
  if (normalized.length > maxLength || containsControlCharacter(normalized)) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

function containsControlCharacter(value: string): boolean {
  return /[\u0000-\u001f\u007f]/u.test(value);
}
