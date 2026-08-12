-- Preserve a bounded, immutable operational explanation for each exact document version.
-- Existing rows predate this capability and receive an explicit historical sentinel.
ALTER TABLE document_versions
  ADD COLUMN change_summary TEXT NOT NULL
  DEFAULT 'Historical version recorded before change-summary tracking.';

CREATE TRIGGER document_versions_change_summary_insert
BEFORE INSERT ON document_versions
WHEN NEW.change_summary = 'Historical version recorded before change-summary tracking.'
  OR length(trim(NEW.change_summary)) < 3
  OR length(trim(NEW.change_summary)) > 500
BEGIN
  SELECT RAISE(ABORT, 'document version change summary is required and must be 3-500 characters');
END;

CREATE TRIGGER document_versions_change_summary_immutable
BEFORE UPDATE OF change_summary ON document_versions
WHEN NEW.change_summary IS NOT OLD.change_summary
BEGIN
  SELECT RAISE(ABORT, 'document version change summary is immutable');
END;
