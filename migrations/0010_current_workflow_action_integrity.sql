-- Queue-native review and approval actions must target the document's exact current version.
-- Application services enforce the same invariant; these triggers prevent stale-version evidence
-- from being inserted through direct SQL or a future alternate adapter.

CREATE TRIGGER reviews_require_current_document_version
BEFORE INSERT ON reviews
WHEN NOT EXISTS (
  SELECT 1
  FROM workflow_instances workflow
  JOIN documents document
    ON document.id = workflow.document_id
   AND document.tenant_id = workflow.tenant_id
  WHERE workflow.id = NEW.workflow_instance_id
    AND workflow.tenant_id = NEW.tenant_id
    AND workflow.document_version_id = NEW.document_version_id
    AND document.current_version_id = workflow.document_version_id
)
BEGIN
  SELECT RAISE(ABORT, 'Review evidence must target the document current workflow version.');
END;

CREATE TRIGGER approvals_require_current_document_version
BEFORE INSERT ON approvals
WHEN NOT EXISTS (
  SELECT 1
  FROM workflow_instances workflow
  JOIN documents document
    ON document.id = workflow.document_id
   AND document.tenant_id = workflow.tenant_id
  WHERE workflow.id = NEW.workflow_instance_id
    AND workflow.tenant_id = NEW.tenant_id
    AND workflow.document_id = NEW.document_id
    AND workflow.document_version_id = NEW.document_version_id
    AND document.current_version_id = NEW.document_version_id
)
BEGIN
  SELECT RAISE(ABORT, 'Approval evidence must target the document current workflow version.');
END;
