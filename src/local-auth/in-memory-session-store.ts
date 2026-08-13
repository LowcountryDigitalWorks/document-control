import type {
  AuthenticatedSession,
  SessionStore,
} from "../application/session";

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, AuthenticatedSession>();

  public async find(sessionId: string): Promise<AuthenticatedSession | null> {
    const session = this.sessions.get(sessionId);
    return session ? { ...session } : null;
  }

  public async save(session: AuthenticatedSession): Promise<void> {
    if (this.sessions.has(session.sessionId)) {
      throw new Error("Session identifier already exists.");
    }
    this.sessions.set(session.sessionId, { ...session });
  }

  public async revoke(sessionId: string, revokedAt: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || session.revokedAt !== undefined) return false;
    this.sessions.set(sessionId, { ...session, revokedAt });
    return true;
  }

  public async replace(
    currentSessionId: string,
    replacement: AuthenticatedSession,
    revokedAt: string,
  ): Promise<boolean> {
    const current = this.sessions.get(currentSessionId);
    if (
      !current ||
      current.revokedAt !== undefined ||
      this.sessions.has(replacement.sessionId)
    ) {
      return false;
    }
    this.sessions.set(currentSessionId, { ...current, revokedAt });
    this.sessions.set(replacement.sessionId, { ...replacement });
    return true;
  }
}
