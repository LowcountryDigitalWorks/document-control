CREATE TABLE workflow_definition_lifecycle (
  tenant_id TEXT NOT NULL,
  workflow_definition_id TEXT NOT NULL,
  workflow_definition_version INTEGER NOT NULL CHECK (workflow_definition_version > 0),
  lifecycle_state TEXT NOT NULL CHECK (lifecycle_state IN ('active', 'deprecated', 'retired')),
  changed_by_subject_id TEXT REFERENCES identity_subjects(id),
  changed_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, workflow_definition_id, workflow_definition_version),
  FOREIGN KEY (
    workflow_definition_id,
    workflow_definition_version,
    tenant_id
  ) REFERENCES workflow_definitions(id, version, tenant_id)
);

INSERT INTO workflow_definition_lifecycle (
  tenant_id,
  workflow_definition_id,
  workflow_definition_version,
  lifecycle_state,
  changed_by_subject_id,
  changed_at
)
SELECT tenant_id, id, version, 'active', NULL, created_at
FROM workflow_definitions;

CREATE TRIGGER workflow_definition_lifecycle_after_definition_insert
AFTER INSERT ON workflow_definitions
BEGIN
  INSERT INTO workflow_definition_lifecycle (
    tenant_id,
    workflow_definition_id,
    workflow_definition_version,
    lifecycle_state,
    changed_by_subject_id,
    changed_at
  ) VALUES (
    NEW.tenant_id,
    NEW.id,
    NEW.version,
    'active',
    NULL,
    NEW.created_at
  );
END;

CREATE TRIGGER workflow_definition_lifecycle_identity_immutable
BEFORE UPDATE ON workflow_definition_lifecycle
WHEN OLD.tenant_id IS NOT NEW.tenant_id
  OR OLD.workflow_definition_id IS NOT NEW.workflow_definition_id
  OR OLD.workflow_definition_version IS NOT NEW.workflow_definition_version
BEGIN
  SELECT RAISE(ABORT, 'workflow lifecycle identity is immutable');
END;

CREATE TRIGGER workflow_definition_lifecycle_no_delete
BEFORE DELETE ON workflow_definition_lifecycle
BEGIN
  SELECT RAISE(ABORT, 'workflow lifecycle history cannot be deleted');
END;

CREATE TRIGGER workflow_definition_lifecycle_transition_guard
BEFORE UPDATE ON workflow_definition_lifecycle
WHEN NOT (
  (OLD.lifecycle_state = 'active' AND NEW.lifecycle_state = 'deprecated')
  OR (OLD.lifecycle_state = 'deprecated' AND NEW.lifecycle_state = 'active')
  OR (OLD.lifecycle_state = 'deprecated' AND NEW.lifecycle_state = 'retired')
)
BEGIN
  SELECT RAISE(ABORT, 'invalid workflow lifecycle transition');
END;

CREATE TRIGGER workflow_definition_lifecycle_retirement_assignment_guard
BEFORE UPDATE OF lifecycle_state ON workflow_definition_lifecycle
WHEN NEW.lifecycle_state = 'retired'
  AND EXISTS (
    SELECT 1
    FROM workspace_workflow_assignments AS assignment
    WHERE assignment.tenant_id = NEW.tenant_id
      AND assignment.workflow_definition_id = NEW.workflow_definition_id
      AND assignment.workflow_definition_version = NEW.workflow_definition_version
  )
BEGIN
  SELECT RAISE(ABORT, 'workflow version must be removed from all workspaces before retirement');
END;

CREATE TRIGGER workspace_workflow_assignment_active_insert
BEFORE INSERT ON workspace_workflow_assignments
WHEN NOT EXISTS (
  SELECT 1
  FROM workflow_definition_lifecycle AS lifecycle
  WHERE lifecycle.tenant_id = NEW.tenant_id
    AND lifecycle.workflow_definition_id = NEW.workflow_definition_id
    AND lifecycle.workflow_definition_version = NEW.workflow_definition_version
    AND lifecycle.lifecycle_state = 'active'
)
BEGIN
  SELECT RAISE(ABORT, 'only active workflow versions can be newly assigned to a workspace');
END;

CREATE TRIGGER workspace_workflow_default_active_update
BEFORE UPDATE OF is_default ON workspace_workflow_assignments
WHEN OLD.is_default = 0
  AND NEW.is_default = 1
  AND NOT EXISTS (
    SELECT 1
    FROM workflow_definition_lifecycle AS lifecycle
    WHERE lifecycle.tenant_id = NEW.tenant_id
      AND lifecycle.workflow_definition_id = NEW.workflow_definition_id
      AND lifecycle.workflow_definition_version = NEW.workflow_definition_version
      AND lifecycle.lifecycle_state = 'active'
  )
BEGIN
  SELECT RAISE(ABORT, 'only active workflow versions can become a workspace default');
END;
