-- Content Ingestion Architecture I.
-- D1/SQLite remains authoritative for intake ownership/lifecycle metadata.
-- Binary bytes remain behind the provider-neutral ContentStore boundary.

CREATE TABLE content_ingestions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  workspace_id TEXT NOT NULL,
  initiating_subject_id TEXT NOT NULL,
  display_filename TEXT NOT NULL CHECK (length(display_filename) BETWEEN 1 AND 255),
  declared_media_type TEXT CHECK (declared_media_type IS NULL OR length(declared_media_type) BETWEEN 3 AND 127),
  accepted_media_type TEXT CHECK (accepted_media_type IS NULL OR length(accepted_media_type) BETWEEN 3 AND 127),
  state TEXT NOT NULL CHECK (state IN ('intake_initiated','staged','validation_pending','accepted','rejected','processing_failed')),
  storage_provider TEXT NOT NULL CHECK (length(storage_provider) BETWEEN 1 AND 128),
  storage_key TEXT NOT NULL UNIQUE CHECK (length(storage_key) BETWEEN 1 AND 1024),
  byte_length INTEGER CHECK (byte_length IS NULL OR byte_length BETWEEN 1 AND 10485760),
  content_hash TEXT CHECK (content_hash IS NULL OR (length(content_hash)=71 AND substr(content_hash,1,7)='sha256:' AND substr(content_hash,8) NOT GLOB '*[^0-9a-f]*')),
  failure_code TEXT CHECK (failure_code IS NULL OR failure_code IN ('unsupported_content','malformed_content','storage_write_failed','stored_content_missing','stored_content_integrity_failed','validation_failed')),
  created_at TEXT NOT NULL,
  staged_at TEXT,
  accepted_at TEXT,
  rejected_at TEXT,
  failed_at TEXT,
  last_event_id TEXT NOT NULL,
  last_actor_subject_id TEXT NOT NULL REFERENCES identity_subjects(id),
  last_event_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id, tenant_id) REFERENCES workspaces(id, tenant_id),
  FOREIGN KEY (tenant_id, initiating_subject_id) REFERENCES tenant_memberships(tenant_id, subject_id),
  UNIQUE (id, tenant_id, workspace_id),
  CHECK ((content_hash IS NULL AND byte_length IS NULL) OR (content_hash IS NOT NULL AND byte_length IS NOT NULL)),
  CHECK (
    (state='accepted' AND accepted_media_type IS NOT NULL AND staged_at IS NOT NULL AND accepted_at IS NOT NULL AND rejected_at IS NULL AND failed_at IS NULL AND failure_code IS NULL AND content_hash IS NOT NULL AND byte_length IS NOT NULL)
    OR (state='rejected' AND accepted_media_type IS NULL AND staged_at IS NOT NULL AND accepted_at IS NULL AND rejected_at IS NOT NULL AND failed_at IS NULL AND failure_code IN ('unsupported_content','malformed_content') AND content_hash IS NOT NULL AND byte_length IS NOT NULL)
    OR (state='processing_failed' AND accepted_media_type IS NULL AND accepted_at IS NULL AND rejected_at IS NULL AND failed_at IS NOT NULL AND failure_code IN ('storage_write_failed','stored_content_missing','stored_content_integrity_failed','validation_failed'))
    OR (state IN ('intake_initiated','staged','validation_pending') AND accepted_media_type IS NULL AND accepted_at IS NULL AND rejected_at IS NULL AND failed_at IS NULL AND failure_code IS NULL)
  ),
  CHECK (state NOT IN ('staged','validation_pending') OR (staged_at IS NOT NULL AND content_hash IS NOT NULL AND byte_length IS NOT NULL))
);

CREATE INDEX content_ingestions_scope_state_idx ON content_ingestions (tenant_id, workspace_id, state, created_at, id);

CREATE TRIGGER content_ingestions_ownership_immutable
BEFORE UPDATE OF id, tenant_id, workspace_id, initiating_subject_id, display_filename, declared_media_type, storage_provider, storage_key, created_at ON content_ingestions
BEGIN
  SELECT RAISE(ABORT, 'content ingestion ownership and intake metadata are immutable');
END;

CREATE TRIGGER content_ingestions_received_identity_set_once
BEFORE UPDATE OF content_hash, byte_length ON content_ingestions
WHEN OLD.content_hash IS NOT NULL OR OLD.byte_length IS NOT NULL OR NEW.content_hash IS NULL OR NEW.byte_length IS NULL
BEGIN
  SELECT RAISE(ABORT, 'content ingestion received hash and length are set once');
END;

CREATE TRIGGER content_ingestions_state_transition
BEFORE UPDATE OF state ON content_ingestions
WHEN NOT (
  (OLD.state='intake_initiated' AND NEW.state IN ('staged','processing_failed')) OR
  (OLD.state='staged' AND NEW.state IN ('validation_pending','processing_failed')) OR
  (OLD.state='validation_pending' AND NEW.state IN ('accepted','rejected','processing_failed'))
)
BEGIN
  SELECT RAISE(ABORT, 'content ingestion lifecycle transition is invalid');
END;

CREATE TRIGGER content_ingestions_event_cursor_requires_change
BEFORE UPDATE OF last_event_id, last_actor_subject_id, last_event_at ON content_ingestions
WHEN NEW.state=OLD.state AND NEW.content_hash IS OLD.content_hash AND NEW.byte_length IS OLD.byte_length
BEGIN
  SELECT RAISE(ABORT, 'content ingestion event cursor requires authoritative evidence change');
END;

CREATE TRIGGER content_ingestions_no_delete
BEFORE DELETE ON content_ingestions
BEGIN
  SELECT RAISE(ABORT, 'content ingestion disposition is not authorized by this release');
END;
