import type {
  SessionStore,
  StoredAuthenticatedSession,
} from "../application/session";

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, StoredAuthenticatedSession>();

  public async find(
    verifier: string,
  ): Promise<StoredAuthenticatedSession | null> {
    const session = this.sessions.get(verifier);
    return session ? { ...session } : null;
  }

  public async save(session: StoredAuthenticatedSession): Promise<void> {
    if (this.sessions.has(session.verifier)) {
      throw new Error("Session verifier already exists.");
    }
    this.sessions.set(session.verifier, { ...session });
  }

  public async revoke(verifier: string, revokedAt: string): Promise<boolean> {
    const session = this.sessions.get(verifier);
    if (
      !session ||
      session.revokedAt !== undefined ||
      Date.parse(session.expiresAt) <= Date.parse(revokedAt)
    ) {
      return false;
    }
    this.sessions.set(verifier, { ...session, revokedAt });
    return true;
  }

  public async replace(
    currentVerifier: string,
    replacement: StoredAuthenticatedSession,
    revokedAt: string,
  ): Promise<boolean> {
    const current = this.sessions.get(currentVerifier);
    if (
      !current ||
      current.revokedAt !== undefined ||
      Date.parse(current.expiresAt) <= Date.parse(revokedAt) ||
      this.sessions.has(replacement.verifier)
    ) {
      return false;
    }
    this.sessions.set(currentVerifier, { ...current, revokedAt });
    this.sessions.set(replacement.verifier, { ...replacement });
    return true;
  }

  public async cleanup(inactiveBefore: string): Promise<number> {
    const before = Date.parse(inactiveBefore);
    let removed = 0;
    for (const [verifier, session] of this.sessions) {
      if (
        Date.parse(session.expiresAt) <= before ||
        (session.revokedAt !== undefined &&
          Date.parse(session.revokedAt) <= before)
      ) {
        this.sessions.delete(verifier);
        removed += 1;
      }
    }
    return removed;
  }
}
