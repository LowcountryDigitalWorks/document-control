-- Controlled document retirement is non-destructive operational disposition.
-- It preserves document/version/workflow/review/approval/audit history while preventing
-- new workflow activity after retirement.

UPDATE role_definitions
SET permissions_json = json_insert(permissions_json, '$[#]', 'document.retire')
WHERE is_system = 1
  AND role_key IN ('tenant_admin', 'workspace_admin', 'document_owner')
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(role_definitions.permissions_json)
    WHERE value = 'document.retire'
  );

CREATE TRIGGER documents_retirement_requires_approved
BEFORE UPDATE OF status ON documents
WHEN NEW.status = 'retired'
  AND (
    OLD.status <> 'approved'
    OR OLD.current_version_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM document_versions version
      JOIN approvals approval
        ON approval.tenant_id = version.tenant_id
       AND approval.document_id = version.document_id
       AND approval.document_version_id = version.id
       AND approval.content_hash = version.content_hash
      WHERE version.tenant_id = OLD.tenant_id
        AND version.document_id = OLD.id
        AND version.id = OLD.current_version_id
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'Documents can only be retired with exact current-version approval evidence.');
END;

CREATE TRIGGER documents_retirement_terminal
BEFORE UPDATE OF status ON documents
WHEN OLD.status = 'retired' AND NEW.status <> 'retired'
BEGIN
  SELECT RAISE(ABORT, 'Document retirement is terminal.');
END;

CREATE TRIGGER retired_documents_block_new_versions
BEFORE INSERT ON document_versions
WHEN EXISTS (
  SELECT 1
  FROM documents document
  WHERE document.id = NEW.document_id
    AND document.tenant_id = NEW.tenant_id
    AND document.status = 'retired'
)
BEGIN
  SELECT RAISE(ABORT, 'Retired documents cannot receive new versions.');
END;

CREATE TRIGGER retired_documents_block_new_workflows
BEFORE INSERT ON workflow_instances
WHEN EXISTS (
  SELECT 1
  FROM documents document
  WHERE document.id = NEW.document_id
    AND document.tenant_id = NEW.tenant_id
    AND document.status = 'retired'
)
BEGIN
  SELECT RAISE(ABORT, 'Retired documents cannot start new workflows.');
END;

CREATE TRIGGER retired_documents_block_workflow_updates
BEFORE UPDATE ON workflow_instances
WHEN EXISTS (
  SELECT 1
  FROM documents document
  WHERE document.id = OLD.document_id
    AND document.tenant_id = OLD.tenant_id
    AND document.status = 'retired'
)
BEGIN
  SELECT RAISE(ABORT, 'Retired document workflows are historical and cannot change.');
END;

CREATE TRIGGER retired_documents_block_reviews
BEFORE INSERT ON reviews
WHEN EXISTS (
  SELECT 1
  FROM workflow_instances workflow
  JOIN documents document
    ON document.id = workflow.document_id
   AND document.tenant_id = workflow.tenant_id
  WHERE workflow.id = NEW.workflow_instance_id
    AND workflow.tenant_id = NEW.tenant_id
    AND document.status = 'retired'
)
BEGIN
  SELECT RAISE(ABORT, 'Retired documents cannot receive new reviews.');
END;

CREATE TRIGGER retired_documents_block_approvals
BEFORE INSERT ON approvals
WHEN EXISTS (
  SELECT 1
  FROM documents document
  WHERE document.id = NEW.document_id
    AND document.tenant_id = NEW.tenant_id
    AND document.status = 'retired'
)
BEGIN
  SELECT RAISE(ABORT, 'Retired documents cannot receive new approvals.');
END;
