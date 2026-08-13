import type { DatabaseProvider } from "../application/ports";
import {
  isSessionVerifier,
  type SessionStore,
  type StoredAuthenticatedSession,
} from "../application/session";

type SessionRow = {
  verifier: string;
  subject_id: string;
  authenticated_at: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
};

export class DatabaseSessionStore implements SessionStore {
  public constructor(private readonly database: DatabaseProvider) {}

  public async find(
    verifier: string,
  ): Promise<StoredAuthenticatedSession | null> {
    assertVerifier(verifier);
    const rows = await this.database.query<SessionRow>(
      `SELECT verifier, subject_id, authenticated_at, created_at, expires_at, revoked_at
       FROM authenticated_sessions
       WHERE verifier = ?
       LIMIT 1`,
      [verifier],
    );
    const row = rows[0];
    return row ? mapRow(row) : null;
  }

  public async save(session: StoredAuthenticatedSession): Promise<void> {
    assertStoredSession(session);
    await this.database.execute(
      `INSERT INTO authenticated_sessions
         (verifier, subject_id, authenticated_at, created_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, NULL)`,
      [
        session.verifier,
        session.subjectId,
        session.authenticatedAt,
        session.createdAt,
        session.expiresAt,
      ],
    );
  }

  public async revoke(verifier: string, revokedAt: string): Promise<boolean> {
    assertVerifier(verifier);
    assertTimestamp(revokedAt, "Session revocation timestamp");
    const result = await this.database.execute(
      `UPDATE authenticated_sessions
       SET revoked_at = ?
       WHERE verifier = ?
         AND revoked_at IS NULL
         AND expires_at > ?`,
      [revokedAt, verifier, revokedAt],
    );
    return result.changes === 1;
  }

  public async replace(
    currentVerifier: string,
    replacement: StoredAuthenticatedSession,
    revokedAt: string,
  ): Promise<boolean> {
    assertVerifier(currentVerifier);
    assertStoredSession(replacement);
    assertTimestamp(revokedAt, "Session rotation timestamp");
    if (currentVerifier === replacement.verifier) return false;

    const results = await this.database.executeBatch([
      {
        sql: `UPDATE authenticated_sessions
              SET revoked_at = ?
              WHERE verifier = ?
                AND revoked_at IS NULL
                AND expires_at > ?`,
        parameters: [revokedAt, currentVerifier, revokedAt],
      },
      {
        sql: `INSERT INTO authenticated_sessions
                (verifier, subject_id, authenticated_at, created_at, expires_at, revoked_at)
              SELECT ?, ?, ?, ?, ?, NULL
              FROM authenticated_sessions current
              WHERE current.verifier = ?
                AND current.revoked_at = ?
                AND current.expires_at > ?`,
        parameters: [
          replacement.verifier,
          replacement.subjectId,
          replacement.authenticatedAt,
          replacement.createdAt,
          replacement.expiresAt,
          currentVerifier,
          revokedAt,
          revokedAt,
        ],
      },
    ]);

    return results[0]?.changes === 1 && results[1]?.changes === 1;
  }

  public async cleanup(inactiveBefore: string): Promise<number> {
    assertTimestamp(inactiveBefore, "Session cleanup timestamp");
    const result = await this.database.execute(
      `DELETE FROM authenticated_sessions
       WHERE expires_at <= ?
          OR (revoked_at IS NOT NULL AND revoked_at <= ?)`,
      [inactiveBefore, inactiveBefore],
    );
    return result.changes;
  }
}

function mapRow(row: SessionRow): StoredAuthenticatedSession {
  const session: StoredAuthenticatedSession = {
    verifier: row.verifier,
    subjectId: row.subject_id,
    authenticatedAt: row.authenticated_at,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    ...(row.revoked_at ? { revokedAt: row.revoked_at } : {}),
  };
  assertStoredSession(session);
  return session;
}

function assertStoredSession(session: StoredAuthenticatedSession): void {
  assertVerifier(session.verifier);
  if (session.subjectId.trim().length === 0) {
    throw new Error("Session subject is invalid.");
  }
  assertTimestamp(session.authenticatedAt, "Session authentication timestamp");
  assertTimestamp(session.createdAt, "Session creation timestamp");
  assertTimestamp(session.expiresAt, "Session expiry timestamp");
  if (Date.parse(session.expiresAt) <= Date.parse(session.createdAt)) {
    throw new Error("Session expiry must follow creation.");
  }
  if (session.revokedAt !== undefined) {
    assertTimestamp(session.revokedAt, "Session revocation timestamp");
  }
}

function assertVerifier(verifier: string): void {
  if (!isSessionVerifier(verifier)) {
    throw new Error("Session verifier is invalid.");
  }
}

function assertTimestamp(value: string, label: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} is invalid.`);
  }
}
