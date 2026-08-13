CREATE TABLE authenticated_sessions (
  verifier TEXT PRIMARY KEY
    CHECK (length(verifier) = 64 AND verifier NOT GLOB '*[^0-9a-f]*'),
  subject_id TEXT NOT NULL REFERENCES identity_subjects(id),
  authenticated_at TEXT NOT NULL CHECK (julianday(authenticated_at) IS NOT NULL),
  created_at TEXT NOT NULL CHECK (julianday(created_at) IS NOT NULL),
  expires_at TEXT NOT NULL CHECK (julianday(expires_at) IS NOT NULL),
  revoked_at TEXT CHECK (revoked_at IS NULL OR julianday(revoked_at) IS NOT NULL),
  replaced_by_verifier TEXT
    CHECK (
      replaced_by_verifier IS NULL OR
      (length(replaced_by_verifier) = 64 AND replaced_by_verifier NOT GLOB '*[^0-9a-f]*')
    ),
  CHECK (expires_at > created_at),
  CHECK (replaced_by_verifier IS NULL OR revoked_at IS NOT NULL)
);

CREATE INDEX authenticated_sessions_expiry_cleanup
  ON authenticated_sessions (expires_at);

CREATE INDEX authenticated_sessions_revoked_cleanup
  ON authenticated_sessions (revoked_at)
  WHERE revoked_at IS NOT NULL;
