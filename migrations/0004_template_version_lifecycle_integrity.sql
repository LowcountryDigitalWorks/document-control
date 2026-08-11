CREATE TRIGGER template_versions_identity_no_update
BEFORE UPDATE OF
  id,
  tenant_id,
  template_id,
  version_number,
  content_hash,
  content_provider,
  content_key,
  created_by_subject_id,
  provenance,
  created_at
ON template_versions
WHEN
  NEW.id IS NOT OLD.id
  OR NEW.tenant_id IS NOT OLD.tenant_id
  OR NEW.template_id IS NOT OLD.template_id
  OR NEW.version_number IS NOT OLD.version_number
  OR NEW.content_hash IS NOT OLD.content_hash
  OR NEW.content_provider IS NOT OLD.content_provider
  OR NEW.content_key IS NOT OLD.content_key
  OR NEW.created_by_subject_id IS NOT OLD.created_by_subject_id
  OR NEW.provenance IS NOT OLD.provenance
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'template version content identity and provenance are immutable');
END;

CREATE TRIGGER template_versions_no_delete
BEFORE DELETE ON template_versions
BEGIN
  SELECT RAISE(ABORT, 'template versions are immutable historical records and cannot be deleted');
END;

CREATE TRIGGER template_versions_lifecycle_transition_guard
BEFORE UPDATE OF lifecycle_state ON template_versions
WHEN NEW.lifecycle_state <> OLD.lifecycle_state
  AND NOT (
    (OLD.lifecycle_state = 'draft' AND NEW.lifecycle_state IN ('review', 'retired'))
    OR (OLD.lifecycle_state = 'review' AND NEW.lifecycle_state IN ('draft', 'approved', 'retired'))
    OR (OLD.lifecycle_state = 'approved' AND NEW.lifecycle_state IN ('published', 'retired'))
    OR (OLD.lifecycle_state = 'published' AND NEW.lifecycle_state IN ('superseded', 'retired'))
    OR (OLD.lifecycle_state = 'superseded' AND NEW.lifecycle_state = 'retired')
  )
BEGIN
  SELECT RAISE(ABORT, 'invalid template lifecycle transition');
END;

CREATE TRIGGER template_versions_lifecycle_timestamp_guard
BEFORE UPDATE OF lifecycle_state, published_at, superseded_at ON template_versions
WHEN
  (NEW.lifecycle_state = 'published' AND NEW.published_at IS NULL)
  OR (NEW.lifecycle_state = 'superseded' AND NEW.superseded_at IS NULL)
  OR (
    NEW.published_at IS NOT OLD.published_at
    AND NOT (
      OLD.published_at IS NULL
      AND OLD.lifecycle_state = 'approved'
      AND NEW.lifecycle_state = 'published'
      AND NEW.published_at IS NOT NULL
    )
  )
  OR (
    NEW.superseded_at IS NOT OLD.superseded_at
    AND NOT (
      OLD.superseded_at IS NULL
      AND OLD.lifecycle_state = 'published'
      AND NEW.lifecycle_state = 'superseded'
      AND NEW.superseded_at IS NOT NULL
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'template lifecycle timestamps must match the allowed transition');
END;
