import type {
  ContentIngestionFailureCode,
  ContentIngestionRecord,
  ContentIngestionState,
} from "../application/content-ingestion";

export interface ContentIngestionRow {
  id: string;
  tenantId: string;
  workspaceId: string;
  initiatingSubjectId: string;
  displayFilename: string;
  declaredMediaType: string | null;
  acceptedMediaType: string | null;
  state: ContentIngestionState;
  storageProvider: string;
  storageKey: string;
  byteLength: number | null;
  contentHash: string | null;
  failureCode: ContentIngestionFailureCode | null;
  createdAt: string;
  stagedAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  failedAt: string | null;
}

export const contentIngestionSelect = `SELECT
  id, tenant_id AS tenantId, workspace_id AS workspaceId,
  initiating_subject_id AS initiatingSubjectId, display_filename AS displayFilename,
  declared_media_type AS declaredMediaType, accepted_media_type AS acceptedMediaType, state,
  storage_provider AS storageProvider, storage_key AS storageKey, byte_length AS byteLength,
  content_hash AS contentHash, failure_code AS failureCode, created_at AS createdAt,
  staged_at AS stagedAt, accepted_at AS acceptedAt, rejected_at AS rejectedAt, failed_at AS failedAt
FROM content_ingestions`;

export function mapContentIngestionRecord(
  row: ContentIngestionRow,
): ContentIngestionRecord {
  return { ...row };
}
