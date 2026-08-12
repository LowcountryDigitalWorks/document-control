-- Template revision creation remains immutable and linear.
-- New revision content may initially reuse an exact historical content identity, but the
-- version record itself is still immutable once inserted.

CREATE TRIGGER template_versions_linear_insert
BEFORE INSERT ON template_versions
WHEN NEW.version_number <> COALESCE(
  (
    SELECT MAX(version_number) + 1
    FROM template_versions
    WHERE tenant_id = NEW.tenant_id
      AND template_id = NEW.template_id
  ),
  1
)
BEGIN
  SELECT RAISE(ABORT, 'Template versions must be created in sequence.');
END;

CREATE TRIGGER template_versions_single_open_revision
BEFORE INSERT ON template_versions
WHEN NEW.lifecycle_state IN ('draft', 'review')
  AND EXISTS (
    SELECT 1
    FROM template_versions
    WHERE tenant_id = NEW.tenant_id
      AND template_id = NEW.template_id
      AND lifecycle_state IN ('draft', 'review')
  )
BEGIN
  SELECT RAISE(ABORT, 'A template can have only one open Draft or Review revision.');
END;

CREATE TRIGGER templates_current_version_latest_only
BEFORE UPDATE OF current_version ON templates
WHEN
  (OLD.current_version IS NOT NULL AND NEW.current_version IS NULL)
  OR (
    NEW.current_version IS NOT NULL
    AND NEW.current_version <> (
      SELECT MAX(version_number)
      FROM template_versions
      WHERE tenant_id = NEW.tenant_id
        AND template_id = NEW.id
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'Template current revision must reference the latest version.');
END;
