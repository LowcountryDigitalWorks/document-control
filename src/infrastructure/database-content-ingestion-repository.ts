import type {
  ContentIngestionAuditEvent,
  ContentIngestionRecord,
  ContentIngestionRepository,
} from "../application/content-ingestion";
import type { DatabaseProvider } from "../application/ports";
import {
  contentIngestionSelect,
  mapContentIngestionRecord,
  type ContentIngestionRow,
} from "./database-content-ingestion-row";
import {
  insertContentIngestion,
  type ProcessingFailureCode,
  updateContentIngestionState,
  updateContentIngestionWithEvent,
} from "./database-content-ingestion-transitions";

interface CountRow { count: number }

export class DatabaseContentIngestionRepository implements ContentIngestionRepository {
  public constructor(private readonly database: DatabaseProvider) {}

  public async countInFlight(tenantId: string, workspaceId: string): Promise<number> {
    const [row] = await this.database.query<CountRow>(
      `SELECT COUNT(*) AS count FROM content_ingestions
       WHERE tenant_id = ? AND workspace_id = ?
         AND state IN ('intake_initiated', 'staged', 'validation_pending')`,
      [tenantId, workspaceId],
    );
    return row?.count ?? 0;
  }

  public async find(tenantId: string, workspaceId: string, ingestionId: string): Promise<ContentIngestionRecord | null> {
    const [row] = await this.database.query<ContentIngestionRow>(
      `${contentIngestionSelect} WHERE tenant_id = ? AND workspace_id = ? AND id = ?`,
      [tenantId, workspaceId, ingestionId],
    );
    return row ? mapContentIngestionRecord(row) : null;
  }

  public initiate(record: ContentIngestionRecord, event: ContentIngestionAuditEvent): Promise<void> {
    return insertContentIngestion(this.database, record, event);
  }

  public recordReceived(record: ContentIngestionRecord, contentHash: string, byteLength: number, event: ContentIngestionAuditEvent): Promise<void> {
    return updateContentIngestionWithEvent(this.database, record, "content_hash = ?, byte_length = ?", [contentHash, byteLength], "state = 'intake_initiated' AND content_hash IS NULL AND byte_length IS NULL", event);
  }

  public markStaged(record: ContentIngestionRecord, stagedAt: string, event: ContentIngestionAuditEvent): Promise<void> {
    return updateContentIngestionWithEvent(this.database, record, "state = 'staged', staged_at = ?", [stagedAt], "1 = 1", event);
  }

  public markValidationPending(record: ContentIngestionRecord): Promise<void> {
    return updateContentIngestionState(this.database, record, "state = 'validation_pending'", []);
  }

  public markAccepted(record: ContentIngestionRecord, acceptedMediaType: string, acceptedAt: string, event: ContentIngestionAuditEvent): Promise<void> {
    return updateContentIngestionWithEvent(this.database, record, "state = 'accepted', accepted_media_type = ?, accepted_at = ?", [acceptedMediaType, acceptedAt], "1 = 1", event);
  }

  public markRejected(record: ContentIngestionRecord, failureCode: "unsupported_content" | "malformed_content", rejectedAt: string, event: ContentIngestionAuditEvent): Promise<void> {
    return updateContentIngestionWithEvent(this.database, record, "state = 'rejected', failure_code = ?, rejected_at = ?", [failureCode, rejectedAt], "1 = 1", event);
  }

  public markProcessingFailed(record: ContentIngestionRecord, failureCode: ProcessingFailureCode, failedAt: string, event: ContentIngestionAuditEvent): Promise<void> {
    return updateContentIngestionWithEvent(this.database, record, "state = 'processing_failed', failure_code = ?, failed_at = ?", [failureCode, failedAt], "1 = 1", event);
  }
}
