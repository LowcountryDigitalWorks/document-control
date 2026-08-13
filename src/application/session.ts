import type {
  AuthenticatedPrincipal,
  IdentityMappingService,
} from "./authentication";

export interface AuthenticatedSession {
  sessionId: string;
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
  find(sessionId: string): Promise<AuthenticatedSession | null>;
  save(session: AuthenticatedSession): Promise<void>;
  revoke(sessionId: string, revokedAt: string): Promise<boolean>;
  replace(
    currentSessionId: string,
    replacement: AuthenticatedSession,
    revokedAt: string,
  ): Promise<boolean>;
}

export interface SessionIdGenerator {
  generate(): Promise<string>;
}

export interface Clock {
  now(): Date;
}

export type SessionSecurityEventType =
  | "session.established"
  | "session.revoked"
  | "session.rotated";

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

export class SessionService {
  public constructor(
    private readonly identityMapping: IdentityMappingService,
    private readonly store: SessionStore,
    private readonly idGenerator: SessionIdGenerator,
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
    const sessionId = await this.generateOpaqueSessionId();
    const session: AuthenticatedSession = {
      sessionId,
      subjectId: mapped.identity.subjectId,
      authenticatedAt: mapped.principal.authenticatedAt,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.sessionLifetimeMs).toISOString(),
    };
    await this.store.save(session);
    await this.recordSecurityEvent("session.established", session.subjectId, now);
    return session;
  }

  public async resolve(sessionId: string): Promise<AuthenticatedRequestContext> {
    const session = await this.requireActiveSession(sessionId);
    return {
      subjectId: session.subjectId,
      authenticatedAt: session.authenticatedAt,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    };
  }

  public async revoke(sessionId: string): Promise<void> {
    const session = await this.requireActiveSession(sessionId);
    const now = this.clock.now();
    const revoked = await this.store.revoke(session.sessionId, now.toISOString());
    if (!revoked) throw new AuthenticationRequiredError();
    await this.recordSecurityEvent("session.revoked", session.subjectId, now);
  }

  public async rotate(sessionId: string): Promise<AuthenticatedSession> {
    const current = await this.requireActiveSession(sessionId);
    const now = this.clock.now();
    const replacement: AuthenticatedSession = {
      sessionId: await this.generateOpaqueSessionId(),
      subjectId: current.subjectId,
      authenticatedAt: current.authenticatedAt,
      createdAt: now.toISOString(),
      expiresAt: current.expiresAt,
    };
    const replaced = await this.store.replace(
      current.sessionId,
      replacement,
      now.toISOString(),
    );
    if (!replaced) throw new AuthenticationRequiredError();
    await this.recordSecurityEvent("session.rotated", current.subjectId, now);
    return replacement;
  }

  private async requireActiveSession(
    sessionId: string,
  ): Promise<AuthenticatedSession> {
    if (!isOpaqueSessionIdentifier(sessionId)) {
      throw new AuthenticationRequiredError();
    }
    const session = await this.store.find(sessionId);
    if (
      !session ||
      session.revokedAt !== undefined ||
      Date.parse(session.expiresAt) <= this.clock.now().getTime()
    ) {
      throw new AuthenticationRequiredError();
    }
    return session;
  }

  private async generateOpaqueSessionId(): Promise<string> {
    const sessionId = await this.idGenerator.generate();
    if (!isOpaqueSessionIdentifier(sessionId)) {
      throw new Error("Session ID generator returned an invalid opaque identifier.");
    }
    return sessionId;
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

export function isOpaqueSessionIdentifier(value: string): boolean {
  return opaqueSessionIdPattern.test(value);
}
