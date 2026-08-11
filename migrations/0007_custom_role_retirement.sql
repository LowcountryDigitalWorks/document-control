ALTER TABLE role_definitions ADD COLUMN retired_at TEXT;

CREATE TRIGGER role_definition_retirement_requires_custom_workspace
BEFORE UPDATE OF retired_at ON role_definitions
WHEN NEW.retired_at IS NOT NULL
  AND (
    NEW.is_system <> 0
    OR NEW.scope <> 'workspace'
    OR NEW.tenant_id IS NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'only tenant-owned custom workspace roles can be retired');
END;

CREATE TRIGGER role_definition_retirement_requires_no_bindings
BEFORE UPDATE OF retired_at ON role_definitions
WHEN OLD.retired_at IS NULL
  AND NEW.retired_at IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM role_bindings
    WHERE role_definition_id = NEW.id
  )
BEGIN
  SELECT RAISE(ABORT, 'custom role must have no assignments before retirement');
END;

CREATE TRIGGER role_definition_retirement_terminal
BEFORE UPDATE OF retired_at ON role_definitions
WHEN OLD.retired_at IS NOT NULL
  AND (NEW.retired_at IS NULL OR NEW.retired_at <> OLD.retired_at)
BEGIN
  SELECT RAISE(ABORT, 'custom role retirement is terminal');
END;

CREATE TRIGGER role_bindings_retired_role_insert
BEFORE INSERT ON role_bindings
WHEN EXISTS (
  SELECT 1
  FROM role_definitions
  WHERE id = NEW.role_definition_id
    AND retired_at IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'retired custom roles cannot receive new assignments');
END;
