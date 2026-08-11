CREATE TABLE workspace_workflow_assignments (
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  workflow_definition_id TEXT NOT NULL,
  workflow_definition_version INTEGER NOT NULL CHECK (workflow_definition_version > 0),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_by_subject_id TEXT NOT NULL REFERENCES identity_subjects(id),
  created_at TEXT NOT NULL,
  updated_by_subject_id TEXT NOT NULL REFERENCES identity_subjects(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (
    tenant_id,
    workspace_id,
    workflow_definition_id,
    workflow_definition_version
  ),
  FOREIGN KEY (workspace_id, tenant_id)
    REFERENCES workspaces(id, tenant_id),
  FOREIGN KEY (
    workflow_definition_id,
    workflow_definition_version,
    tenant_id
  ) REFERENCES workflow_definitions(id, version, tenant_id)
);

CREATE UNIQUE INDEX workspace_workflow_default_idx
ON workspace_workflow_assignments (tenant_id, workspace_id)
WHERE is_default = 1;

CREATE INDEX workspace_workflow_definition_idx
ON workspace_workflow_assignments (
  tenant_id,
  workflow_definition_id,
  workflow_definition_version
);

CREATE TRIGGER workspace_workflow_assignment_identity_immutable
BEFORE UPDATE ON workspace_workflow_assignments
WHEN OLD.tenant_id IS NOT NEW.tenant_id
  OR OLD.workspace_id IS NOT NEW.workspace_id
  OR OLD.workflow_definition_id IS NOT NEW.workflow_definition_id
  OR OLD.workflow_definition_version IS NOT NEW.workflow_definition_version
  OR OLD.created_by_subject_id IS NOT NEW.created_by_subject_id
  OR OLD.created_at IS NOT NEW.created_at
BEGIN
  SELECT RAISE(ABORT, 'workspace workflow assignment identity is immutable');
END;
