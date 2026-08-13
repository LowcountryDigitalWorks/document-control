import type {
  AuthenticatedPrincipal,
  IdentityMappingService,
} from "./authentication";

export interface AuthenticatedSession {
  bearerToken: string;
  subjectId: string;
  authenticatedAt: string;
  createdAt: string;
  expiresAt: string;
}

export interface StoredAuthenticatedSession {
  verifier: string;
  subjectId: string;
  authenticatedAt: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
}

export interface AuthenticatedRequestContext {
  subjectId: string;
  authenticatedAt: string;
  createdAt: string;
  expiresAt: string;
}

export interface SessionStore {
  find(verifier: string): Promise<StoredAuthenticatedSession | null>;
  save(session: StoredAuthenticatedSession): Promise<void>;
  revoke(verifier: string, revokedAt: string): Promise<boolean>;
  replace(
    currentVerifier: string,
    replacement: StoredAuthenticatedSession,
    revokedAt: string,
  ): Promise<boolean>;
  cleanup(inactiveBefore: string): Promise<number>;
}

export interface SessionIdGenerator {
  generate(): Promise<string>;
}

export interface SessionTokenVerifier {
  derive(bearerToken: string): Promise<string>;
}

export interface Clock {
  now(): Date;
}

export type SessionSecurityEventType =
  "session.established" | "session.revoked" | "session.rotated";

export interface SessionSecurityEvent {
  type: SessionSecurityEventType;
  subjectId: string;
  occurredAt: string;
}

export interface SessionSecurityAuditSink {
  record(event: SessionSecurityEvent): Promise<void>;
}

export class AuthenticationRequiredError extends Error {
  public constructor() {
    super("Authentication required.");
    this.name = "AuthenticationRequiredError";
  }
}

const maxSessionLifetimeMs = 24 * 60 * 60 * 1000;
const opaqueSessionIdPattern = /^[0-9a-f]{64}$/u;
const sessionVerifierPattern = /^[0-9a-f]{64}$/u;

export class SessionService {
  public constructor(
    private readonly identityMapping: IdentityMappingService,
    private readonly store: SessionStore,
    private readonly idGenerator: SessionIdGenerator,
    private readonly tokenVerifier: SessionTokenVerifier,
    private readonly clock: Clock,
    private readonly sessionLifetimeMs: number,
    private readonly audit?: SessionSecurityAuditSink,
  ) {
    if (
      !Number.isSafeInteger(sessionLifetimeMs) ||
      sessionLifetimeMs <= 0 ||
      sessionLifetimeMs > maxSessionLifetimeMs
    ) {
      throw new Error("Session lifetime must be between 1 ms and 24 hours.");
    }
  }

  public async establish(
    principal: AuthenticatedPrincipal,
  ): Promise<AuthenticatedSession> {
    const mapped = await this.identityMapping.resolve(principal);
    const now = this.clock.now();
    const bearerToken = await this.generateOpaqueSessionId();
    const verifier = await this.deriveVerifier(bearerToken);
    const stored: StoredAuthenticatedSession = {
      verifier,
      subjectId: mapped.identity.subjectId,
      authenticatedAt: mapped.principal.authenticatedAt,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.sessionLifetimeMs).toISOString(),
    };
    await this.store.save(stored);
    await this.recordSecurityEvent(
      "session.established",
      stored.subjectId,
      now,
    );
    return toAuthenticatedSession(bearerToken, stored);
  }

  public async resolve(
    bearerToken: string,
  ): Promise<AuthenticatedRequestContext> {
    const { session } = await this.requireActiveSession(bearerToken);
    return {
      subjectId: session.subjectId,
      authenticatedAt: session.authenticatedAt,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    };
  }

  public async revoke(bearerToken: string): Promise<void> {
    const { session, verifier } = await this.requireActiveSession(bearerToken);
    const now = this.clock.now();
    const revoked = await this.store.revoke(verifier, now.toISOString());
    if (!revoked) throw new AuthenticationRequiredError();
    await this.recordSecurityEvent("session.revoked", session.subjectId, now);
  }

  public async rotate(bearerToken: string): Promise<AuthenticatedSession> {
    const { session: current, verifier: currentVerifier } =
      await this.requireActiveSession(bearerToken);
    const now = this.clock.now();
    const replacementBearerToken = await this.generateOpaqueSessionId();
    const replacementVerifier = await this.deriveVerifier(
      replacementBearerToken,
    );
    if (replacementVerifier === currentVerifier) {
      throw new Error("Session token generator produced a duplicate verifier.");
    }
    const replacement: StoredAuthenticatedSession = {
      verifier: replacementVerifier,
      subjectId: current.subjectId,
      authenticatedAt: current.authenticatedAt,
      createdAt: now.toISOString(),
      expiresAt: current.expiresAt,
    };
    const replaced = await this.store.replace(
      currentVerifier,
      replacement,
      now.toISOString(),
    );
    if (!replaced) throw new AuthenticationRequiredError();
    await this.recordSecurityEvent("session.rotated", current.subjectId, now);
    return toAuthenticatedSession(replacementBearerToken, replacement);
  }

  public async cleanupInactiveSessions(
    inactiveBefore: Date = this.clock.now(),
  ): Promise<number> {
    if (!Number.isFinite(inactiveBefore.getTime())) {
      throw new Error("Session cleanup timestamp is invalid.");
    }
    return this.store.cleanup(inactiveBefore.toISOString());
  }

  private async requireActiveSession(bearerToken: string): Promise<{
    session: StoredAuthenticatedSession;
    verifier: string;
  }> {
    if (!isOpaqueSessionIdentifier(bearerToken)) {
      throw new AuthenticationRequiredError();
    }
    const verifier = await this.deriveVerifier(bearerToken);
    const session = await this.store.find(verifier);
    if (
      !session ||
      session.revokedAt !== undefined ||
      Date.parse(session.expiresAt) <= this.clock.now().getTime()
    ) {
      throw new AuthenticationRequiredError();
    }
    return { session, verifier };
  }

  private async generateOpaqueSessionId(): Promise<string> {
    const bearerToken = await this.idGenerator.generate();
    if (!isOpaqueSessionIdentifier(bearerToken)) {
      throw new Error(
        "Session ID generator returned an invalid opaque identifier.",
      );
    }
    return bearerToken;
  }

  private async deriveVerifier(bearerToken: string): Promise<string> {
    const verifier = await this.tokenVerifier.derive(bearerToken);
    if (!isSessionVerifier(verifier)) {
      throw new Error("Session verifier returned an invalid digest.");
    }
    return verifier;
  }

  private async recordSecurityEvent(
    type: SessionSecurityEventType,
    subjectId: string,
    occurredAt: Date,
  ): Promise<void> {
    await this.audit?.record({
      type,
      subjectId,
      occurredAt: occurredAt.toISOString(),
    });
  }
}

function toAuthenticatedSession(
  bearerToken: string,
  session: StoredAuthenticatedSession,
): AuthenticatedSession {
  return {
    bearerToken,
    subjectId: session.subjectId,
    authenticatedAt: session.authenticatedAt,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  };
}

export function isOpaqueSessionIdentifier(value: string): boolean {
  return opaqueSessionIdPattern.test(value);
}

export function isSessionVerifier(value: string): boolean {
  return sessionVerifierPattern.test(value);
}
