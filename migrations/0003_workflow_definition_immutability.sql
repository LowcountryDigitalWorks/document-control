CREATE TRIGGER workflow_definitions_no_update
BEFORE UPDATE ON workflow_definitions
BEGIN
  SELECT RAISE(ABORT, 'workflow definition versions are immutable; create a new version instead');
END;

CREATE TRIGGER workflow_definitions_no_delete
BEFORE DELETE ON workflow_definitions
BEGIN
  SELECT RAISE(ABORT, 'workflow definition versions are immutable; retire use without deleting history');
END;
