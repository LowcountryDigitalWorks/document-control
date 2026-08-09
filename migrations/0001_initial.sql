PRAGMA foreign_keys = ON;

CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (tenant_id, name)
);

CREATE TABLE role_assignments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  actor_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'administrator', 'author', 'reviewer', 'approver', 'reader')),
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, actor_id, role)
);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'in_review', 'approved', 'retired')),
  current_version_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE document_versions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  document_id TEXT NOT NULL REFERENCES documents(id),
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  content_hash TEXT NOT NULL CHECK (content_hash LIKE 'sha256:%'),
  content_key TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (document_id, version_number)
);

CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'retired')),
  current_version INTEGER NOT NULL CHECK (current_version > 0),
  created_at TEXT NOT NULL
);

CREATE TABLE workflow_definitions (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  definition_json TEXT NOT NULL CHECK (json_valid(definition_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (id, version)
);

CREATE TABLE workflow_instances (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  document_id TEXT NOT NULL REFERENCES documents(id),
  document_version_id TEXT NOT NULL REFERENCES document_versions(id),
  workflow_definition_id TEXT NOT NULL,
  workflow_definition_version INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('draft', 'review', 'approval', 'approved', 'rejected')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workflow_definition_id, workflow_definition_version)
    REFERENCES workflow_definitions(id, version)
);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  workflow_instance_id TEXT NOT NULL REFERENCES workflow_instances(id),
  document_version_id TEXT NOT NULL REFERENCES document_versions(id),
  actor_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('commented', 'accepted', 'changes_requested')),
  comment TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  document_id TEXT NOT NULL REFERENCES documents(id),
  document_version_id TEXT NOT NULL REFERENCES document_versions(id),
  content_hash TEXT NOT NULL CHECK (content_hash LIKE 'sha256:%'),
  actor_id TEXT NOT NULL,
  workflow_definition_id TEXT NOT NULL,
  workflow_definition_version INTEGER NOT NULL,
  approved_at TEXT NOT NULL,
  FOREIGN KEY (workflow_definition_id, workflow_definition_version)
    REFERENCES workflow_definitions(id, version)
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  actor_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
);

CREATE INDEX document_versions_tenant_document_idx ON document_versions (tenant_id, document_id);
CREATE INDEX approvals_exact_version_idx ON approvals (tenant_id, document_version_id, content_hash);
CREATE INDEX audit_events_tenant_time_idx ON audit_events (tenant_id, occurred_at, id);

CREATE TRIGGER approvals_exact_version_insert
BEFORE INSERT ON approvals
WHEN NOT EXISTS (
  SELECT 1
  FROM document_versions
  WHERE id = NEW.document_version_id
    AND tenant_id = NEW.tenant_id
    AND document_id = NEW.document_id
    AND content_hash = NEW.content_hash
)
BEGIN
  SELECT RAISE(ABORT, 'approval must match the exact document version and content hash');
END;

CREATE TRIGGER audit_events_no_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit events are append-only');
END;

CREATE TRIGGER audit_events_no_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit events are append-only');
END;
