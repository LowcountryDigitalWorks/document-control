-- Content Ingestion Architecture I audit evidence.
-- Triggered in the same D1/SQLite statement as authoritative lifecycle changes.

CREATE TRIGGER content_ingestions_audit_initiated
AFTER INSERT ON content_ingestions
BEGIN
  INSERT INTO audit_events
    (id, tenant_id, workspace_id, actor_subject_id, event_type, entity_type, entity_id, occurred_at, payload_json)
  VALUES
    (NEW.last_event_id, NEW.tenant_id, NEW.workspace_id, NEW.last_actor_subject_id,
     'content.intake.initiated', 'content_ingestion', NEW.id, NEW.last_event_at, '{}');
END;

CREATE TRIGGER content_ingestions_audit_received
AFTER UPDATE OF content_hash, byte_length ON content_ingestions
WHEN OLD.content_hash IS NULL AND NEW.content_hash IS NOT NULL
BEGIN
  INSERT INTO audit_events
    (id, tenant_id, workspace_id, actor_subject_id, event_type, entity_type, entity_id, occurred_at, payload_json)
  VALUES
    (NEW.last_event_id, NEW.tenant_id, NEW.workspace_id, NEW.last_actor_subject_id,
     'content.intake.received', 'content_ingestion', NEW.id, NEW.last_event_at,
     json_object('byteLength', NEW.byte_length, 'contentHash', NEW.content_hash));
END;

CREATE TRIGGER content_ingestions_audit_state
AFTER UPDATE OF state ON content_ingestions
WHEN NEW.state <> 'validation_pending'
BEGIN
  INSERT INTO audit_events
    (id, tenant_id, workspace_id, actor_subject_id, event_type, entity_type, entity_id, occurred_at, payload_json)
  VALUES
    (NEW.last_event_id, NEW.tenant_id, NEW.workspace_id, NEW.last_actor_subject_id,
     CASE NEW.state
       WHEN 'staged' THEN 'content.intake.staged'
       WHEN 'accepted' THEN 'content.accepted'
       WHEN 'rejected' THEN 'content.validation.rejected'
       ELSE 'content.processing_failed'
     END,
     'content_ingestion', NEW.id, NEW.last_event_at,
     CASE NEW.state
       WHEN 'staged' THEN json_object('byteLength', NEW.byte_length, 'contentHash', NEW.content_hash)
       WHEN 'accepted' THEN json_object('acceptedMediaType', NEW.accepted_media_type, 'byteLength', NEW.byte_length, 'contentHash', NEW.content_hash)
       ELSE json_object('reason', NEW.failure_code)
     END);
END;
