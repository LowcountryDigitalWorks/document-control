PRAGMA foreign_keys = ON;

CREATE TABLE identity_subjects (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT,
  provider TEXT NOT NULL CHECK (provider IN ('local', 'oidc', 'saml', 'entra', 'external')),
  provider_subject TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (provider, provider_subject)
);

CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE tenant_memberships (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  subject_id TEXT NOT NULL REFERENCES identity_subjects(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'invited')),
  created_at TEXT NOT NULL,
  UNIQUE (tenant_id, subject_id),
  UNIQUE (id, tenant_id)
);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (tenant_id, name),
  UNIQUE (id, tenant_id)
);

CREATE TABLE role_definitions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  role_key TEXT NOT NULL,
  name TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('platform', 'tenant', 'workspace')),
  permissions_json TEXT NOT NULL CHECK (json_valid(permissions_json)),
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX role_definitions_global_key_unique
  ON role_definitions (role_key)
  WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX role_definitions_tenant_key_unique
  ON role_definitions (tenant_id, role_key)
  WHERE tenant_id IS NOT NULL;

CREATE TABLE role_bindings (
  id TEXT PRIMARY KEY,
  role_definition_id TEXT NOT NULL REFERENCES role_definitions(id),
  subject_id TEXT NOT NULL REFERENCES identity_subjects(id),
  tenant_id TEXT REFERENCES tenants(id),
  workspace_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id, tenant_id) REFERENCES workspaces(id, tenant_id),
  UNIQUE (role_definition_id, subject_id, tenant_id, workspace_id)
);

INSERT INTO role_definitions
  (id, tenant_id, role_key, name, scope, permissions_json, is_system, created_at)
VALUES
  ('role-platform-admin', NULL, 'platform_admin', 'Platform Administrator', 'platform', '[]', 1, '2026-08-10T00:00:00.000Z'),
  ('role-tenant-admin', NULL, 'tenant_admin', 'Tenant Administrator', 'tenant', '[]', 1, '2026-08-10T00:00:00.000Z'),
  ('role-workspace-admin', NULL, 'workspace_admin', 'Workspace Administrator', 'workspace', '[]', 1, '2026-08-10T00:00:00.000Z'),
  ('role-workflow-admin', NULL, 'workflow_admin', 'Workflow Administrator', 'workspace', '[]', 1, '2026-08-10T00:00:00.000Z'),
  ('role-template-manager', NULL, 'template_manager', 'Template Manager', 'workspace', '[]', 1, '2026-08-10T00:00:00.000Z'),
  ('role-document-owner', NULL, 'document_owner', 'Document Owner', 'workspace', '[]', 1, '2026-08-10T00:00:00.000Z'),
  ('role-author', NULL, 'author', 'Author', 'workspace', '[]', 1, '2026-08-10T00:00:00.000Z'),
  ('role-reviewer', NULL, 'reviewer', 'Reviewer', 'workspace', '[]', 1, '2026-08-10T00:00:00.000Z'),
  ('role-approver', NULL, 'approver', 'Approver', 'workspace', '[]', 1, '2026-08-10T00:00:00.000Z'),
  ('role-auditor', NULL, 'auditor', 'Auditor', 'workspace', '[]', 1, '2026-08-10T00:00:00.000Z'),
  ('role-viewer', NULL, 'viewer', 'Viewer', 'workspace', '[]', 1, '2026-08-10T00:00:00.000Z');

CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  current_version INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id, tenant_id) REFERENCES workspaces(id, tenant_id),
  UNIQUE (id, tenant_id),
  FOREIGN KEY (id, current_version, tenant_id)
    REFERENCES template_versions(template_id, version_number, tenant_id)
);

CREATE TABLE template_versions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  template_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  lifecycle_state TEXT NOT NULL CHECK (lifecycle_state IN ('draft', 'review', 'approved', 'published', 'superseded', 'retired')),
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 71 AND content_hash GLOB 'sha256:[0-9a-f]*'),
  content_provider TEXT NOT NULL,
  content_key TEXT NOT NULL,
  created_by_subject_id TEXT NOT NULL REFERENCES identity_subjects(id),
  provenance TEXT NOT NULL,
  created_at TEXT NOT NULL,
  published_at TEXT,
  superseded_at TEXT,
  FOREIGN KEY (template_id, tenant_id) REFERENCES templates(id, tenant_id),
  UNIQUE (template_id, version_number),
  UNIQUE (template_id, version_number, tenant_id),
  UNIQUE (id, tenant_id)
);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'in_review', 'approved', 'superseded', 'retired')),
  current_version_id TEXT,
  source_template_id TEXT,
  source_template_version INTEGER,
  source_template_hash TEXT,
  template_provenance TEXT NOT NULL CHECK (template_provenance IN ('approved_template', 'exception_no_approved_template', 'none')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id, tenant_id) REFERENCES workspaces(id, tenant_id),
  FOREIGN KEY (source_template_id, source_template_version, tenant_id)
    REFERENCES template_versions(template_id, version_number, tenant_id),
  FOREIGN KEY (current_version_id, id, tenant_id)
    REFERENCES document_versions(id, document_id, tenant_id),
  CHECK (
    (template_provenance = 'approved_template' AND source_template_id IS NOT NULL AND source_template_version IS NOT NULL AND source_template_hash IS NOT NULL)
    OR
    (template_provenance IN ('exception_no_approved_template', 'none') AND source_template_id IS NULL AND source_template_version IS NULL AND source_template_hash IS NULL)
  ),
  UNIQUE (id, tenant_id)
);

CREATE TABLE document_versions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  document_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 71 AND content_hash GLOB 'sha256:[0-9a-f]*'),
  content_provider TEXT NOT NULL,
  content_key TEXT NOT NULL,
  created_by_subject_id TEXT NOT NULL REFERENCES identity_subjects(id),
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id, tenant_id) REFERENCES documents(id, tenant_id),
  UNIQUE (document_id, version_number),
  UNIQUE (id, tenant_id),
  UNIQUE (id, document_id, tenant_id)
);

CREATE TABLE workflow_definitions (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  definition_json TEXT NOT NULL CHECK (json_valid(definition_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (id, version),
  UNIQUE (id, version, tenant_id)
);

CREATE TABLE workflow_instances (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  document_id TEXT NOT NULL,
  document_version_id TEXT NOT NULL,
  workflow_definition_id TEXT NOT NULL,
  workflow_definition_version INTEGER NOT NULL,
  state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (document_id, tenant_id) REFERENCES documents(id, tenant_id),
  FOREIGN KEY (document_version_id, document_id, tenant_id)
    REFERENCES document_versions(id, document_id, tenant_id),
  FOREIGN KEY (workflow_definition_id, workflow_definition_version, tenant_id)
    REFERENCES workflow_definitions(id, version, tenant_id),
  UNIQUE (id, tenant_id)
);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  workflow_instance_id TEXT NOT NULL,
  document_version_id TEXT NOT NULL,
  actor_subject_id TEXT NOT NULL REFERENCES identity_subjects(id),
  decision TEXT NOT NULL CHECK (decision IN ('commented', 'accepted', 'changes_requested')),
  comment TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workflow_instance_id, tenant_id) REFERENCES workflow_instances(id, tenant_id),
  FOREIGN KEY (document_version_id, tenant_id) REFERENCES document_versions(id, tenant_id)
);

CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  document_id TEXT NOT NULL,
  document_version_id TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 71 AND content_hash GLOB 'sha256:[0-9a-f]*'),
  actor_subject_id TEXT NOT NULL REFERENCES identity_subjects(id),
  workflow_instance_id TEXT NOT NULL,
  workflow_definition_id TEXT NOT NULL,
  workflow_definition_version INTEGER NOT NULL,
  approved_at TEXT NOT NULL,
  FOREIGN KEY (document_id, tenant_id) REFERENCES documents(id, tenant_id),
  FOREIGN KEY (document_version_id, document_id, tenant_id)
    REFERENCES document_versions(id, document_id, tenant_id),
  FOREIGN KEY (workflow_instance_id, tenant_id)
    REFERENCES workflow_instances(id, tenant_id),
  FOREIGN KEY (workflow_definition_id, workflow_definition_version, tenant_id)
    REFERENCES workflow_definitions(id, version, tenant_id)
);

CREATE TABLE tenant_configurations (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
  permitted_data_profile TEXT NOT NULL CHECK (permitted_data_profile IN ('ordinary_business', 'regulated_approved', 'demo_synthetic')),
  branding_json TEXT NOT NULL CHECK (json_valid(branding_json)),
  terminology_json TEXT NOT NULL CHECK (json_valid(terminology_json)),
  updated_at TEXT NOT NULL
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  workspace_id TEXT NOT NULL,
  actor_subject_id TEXT NOT NULL REFERENCES identity_subjects(id),
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  FOREIGN KEY (workspace_id, tenant_id) REFERENCES workspaces(id, tenant_id)
);

CREATE INDEX document_versions_tenant_document_idx ON document_versions (tenant_id, document_id);
CREATE INDEX approvals_exact_version_idx ON approvals (tenant_id, document_version_id, content_hash);
CREATE INDEX audit_events_tenant_time_idx ON audit_events (tenant_id, occurred_at, id);
CREATE INDEX role_bindings_subject_idx ON role_bindings (subject_id, tenant_id, workspace_id);

CREATE TRIGGER role_bindings_scope_insert
BEFORE INSERT ON role_bindings
WHEN NOT EXISTS (
  SELECT 1
  FROM role_definitions AS role
  WHERE role.id = NEW.role_definition_id
    AND (
      (role.scope = 'platform' AND NEW.tenant_id IS NULL AND NEW.workspace_id IS NULL)
      OR
      (role.scope = 'tenant'
        AND NEW.tenant_id IS NOT NULL
        AND NEW.workspace_id IS NULL
        AND (role.tenant_id IS NULL OR role.tenant_id = NEW.tenant_id)
        AND EXISTS (
          SELECT 1 FROM tenant_memberships
          WHERE tenant_id = NEW.tenant_id AND subject_id = NEW.subject_id AND status = 'active'
        ))
      OR
      (role.scope = 'workspace'
        AND NEW.tenant_id IS NOT NULL
        AND NEW.workspace_id IS NOT NULL
        AND (role.tenant_id IS NULL OR role.tenant_id = NEW.tenant_id)
        AND EXISTS (
          SELECT 1 FROM workspaces
          WHERE id = NEW.workspace_id AND tenant_id = NEW.tenant_id
        )
        AND EXISTS (
          SELECT 1 FROM tenant_memberships
          WHERE tenant_id = NEW.tenant_id AND subject_id = NEW.subject_id AND status = 'active'
        ))
    )
)
BEGIN
  SELECT RAISE(ABORT, 'role binding scope, tenant, workspace, or membership is invalid');
END;

CREATE TRIGGER role_bindings_scope_update
BEFORE UPDATE ON role_bindings
BEGIN
  SELECT RAISE(ABORT, 'role bindings are replaced, not mutated');
END;

CREATE TRIGGER document_template_provenance_insert
BEFORE INSERT ON documents
WHEN NEW.template_provenance = 'approved_template'
  AND NOT EXISTS (
    SELECT 1
    FROM template_versions
    WHERE template_id = NEW.source_template_id
      AND version_number = NEW.source_template_version
      AND tenant_id = NEW.tenant_id
      AND content_hash = NEW.source_template_hash
      AND lifecycle_state IN ('approved', 'published')
  )
BEGIN
  SELECT RAISE(ABORT, 'document template provenance must match an approved template version and hash');
END;

CREATE TRIGGER workflow_instance_state_insert
BEFORE INSERT ON workflow_instances
WHEN NOT EXISTS (
  SELECT 1
  FROM workflow_definitions AS definition,
       json_each(definition.definition_json, '$.states') AS state
  WHERE definition.id = NEW.workflow_definition_id
    AND definition.version = NEW.workflow_definition_version
    AND definition.tenant_id = NEW.tenant_id
    AND state.value = NEW.state
)
BEGIN
  SELECT RAISE(ABORT, 'workflow state is not defined by the bound workflow definition');
END;

CREATE TRIGGER workflow_instance_state_update
BEFORE UPDATE OF state ON workflow_instances
WHEN NOT EXISTS (
  SELECT 1
  FROM workflow_definitions AS definition,
       json_each(definition.definition_json, '$.states') AS state
  WHERE definition.id = NEW.workflow_definition_id
    AND definition.version = NEW.workflow_definition_version
    AND definition.tenant_id = NEW.tenant_id
    AND state.value = NEW.state
)
BEGIN
  SELECT RAISE(ABORT, 'workflow state is not defined by the bound workflow definition');
END;

CREATE TRIGGER approvals_exact_version_insert
BEFORE INSERT ON approvals
WHEN NOT EXISTS (
  SELECT 1
  FROM document_versions AS version
  JOIN workflow_instances AS instance
    ON instance.id = NEW.workflow_instance_id
   AND instance.tenant_id = NEW.tenant_id
  WHERE version.id = NEW.document_version_id
    AND version.tenant_id = NEW.tenant_id
    AND version.document_id = NEW.document_id
    AND version.content_hash = NEW.content_hash
    AND instance.document_id = NEW.document_id
    AND instance.document_version_id = NEW.document_version_id
    AND instance.workflow_definition_id = NEW.workflow_definition_id
    AND instance.workflow_definition_version = NEW.workflow_definition_version
)
BEGIN
  SELECT RAISE(ABORT, 'approval must match the exact document version, content hash, and workflow instance');
END;

CREATE TRIGGER document_versions_content_immutable
BEFORE UPDATE OF document_id, tenant_id, version_number, content_hash, content_provider, content_key ON document_versions
BEGIN
  SELECT RAISE(ABORT, 'document version content identity is immutable');
END;

CREATE TRIGGER template_versions_content_immutable
BEFORE UPDATE OF template_id, tenant_id, version_number, content_hash, content_provider, content_key, created_by_subject_id, provenance, created_at ON template_versions
BEGIN
  SELECT RAISE(ABORT, 'template version content identity and provenance are immutable');
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
