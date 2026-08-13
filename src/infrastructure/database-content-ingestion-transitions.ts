import type {
  ContentIngestionAuditEvent,
  ContentIngestionFailureCode,
  ContentIngestionRecord,
} from "../application/content-ingestion";
import type { DatabaseProvider, DatabaseResult } from "../application/ports";

export async function insertContentIngestion(
  database: DatabaseProvider,
  record: ContentIngestionRecord,
  event: ContentIngestionAuditEvent,
): Promise<void> {
  const result = await database.execute(
    `INSERT INTO content_ingestions
      (id, tenant_id, workspace_id, initiating_subject_id, display_filename,
       declared_media_type, state, storage_provider, storage_key, created_at,
       last_event_id, last_actor_subject_id, last_event_at)
     VALUES (?, ?, ?, ?, ?, ?, 'intake_initiated', ?, ?, ?, ?, ?, ?)`,
    [
      record.id, record.tenantId, record.workspaceId, record.initiatingSubjectId,
      record.displayFilename, record.declaredMediaType, record.storageProvider,
      record.storageKey, record.createdAt, event.id, event.actorSubjectId, event.occurredAt,
    ],
  );
  assertChanged(result);
}

export async function updateContentIngestionWithEvent(
  database: DatabaseProvider,
  record: ContentIngestionRecord,
  assignments: string,
  parameters: readonly unknown[],
  guard: string,
  event: ContentIngestionAuditEvent,
): Promise<void> {
  const result = await database.execute(
    `UPDATE content_ingestions SET ${assignments},
       last_event_id = ?, last_actor_subject_id = ?, last_event_at = ?
     WHERE id = ? AND tenant_id = ? AND workspace_id = ? AND ${guard}`,
    [
      ...parameters, event.id, event.actorSubjectId, event.occurredAt,
      record.id, record.tenantId, record.workspaceId,
    ],
  );
  assertChanged(result);
}

export async function updateContentIngestionState(
  database: DatabaseProvider,
  record: ContentIngestionRecord,
  assignments: string,
  parameters: readonly unknown[],
): Promise<void> {
  const result = await database.execute(
    `UPDATE content_ingestions SET ${assignments}
     WHERE id = ? AND tenant_id = ? AND workspace_id = ?`,
    [...parameters, record.id, record.tenantId, record.workspaceId],
  );
  assertChanged(result);
}

export type ProcessingFailureCode = Exclude<
  ContentIngestionFailureCode,
  "unsupported_content" | "malformed_content"
>;

function assertChanged(result: DatabaseResult | undefined): void {
  if (!result || result.changes !== 1) {
    throw new Error("Content ingestion state transition did not apply.");
  }
}
