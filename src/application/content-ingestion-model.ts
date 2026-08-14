import type { ContentObject } from "./ports";

export const CONTENT_INGESTION_MAX_BYTES = 10 * 1024 * 1024;
export const CONTENT_INGESTION_MAX_FILENAME_LENGTH = 255;
export const CONTENT_INGESTION_MAX_DECLARED_MEDIA_TYPE_LENGTH = 127;
export const CONTENT_INGESTION_MAX_IN_FLIGHT_PER_WORKSPACE = 32;

export const contentIngestionStates = [
  "intake_initiated",
  "staged",
  "validation_pending",
  "accepted",
  "rejected",
  "processing_failed",
] as const;

export type ContentIngestionState = (typeof contentIngestionStates)[number];

export type ContentIngestionFailureCode =
  | "unsupported_content"
  | "malformed_content"
  | "storage_write_failed"
  | "stored_content_missing"
  | "stored_content_integrity_failed"
  | "validation_failed";

export interface ContentIngestionRecord {
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

export interface ContentValidationInput {
  bytes: ArrayBuffer;
  displayFilename: string;
  declaredMediaType: string | null;
}

export type ContentValidationResult =
  | { outcome: "accepted"; acceptedMediaType: string }
  | {
      outcome: "rejected";
      reason: Extract<
        ContentIngestionFailureCode,
        "unsupported_content" | "malformed_content"
      >;
    };

export interface ContentValidator {
  validate(input: ContentValidationInput): Promise<ContentValidationResult>;
}

export interface ContentIngestionIdentifierGenerator {
  nextId(): string;
}

export type ContentIngestionAuditEventType =
  | "content.intake.initiated"
  | "content.intake.received"
  | "content.intake.staged"
  | "content.validation.rejected"
  | "content.accepted"
  | "content.processing_failed";

export interface ContentIngestionAuditEvent {
  id: string;
  type: ContentIngestionAuditEventType;
  tenantId: string;
  workspaceId: string;
  actorSubjectId: string;
  ingestionId: string;
  occurredAt: string;
  details: Readonly<Record<string, string | number>>;
}

export interface ContentIngestionRepository {
  countInFlight(tenantId: string, workspaceId: string): Promise<number>;
  find(
    tenantId: string,
    workspaceId: string,
    ingestionId: string,
  ): Promise<ContentIngestionRecord | null>;
  initiate(
    record: ContentIngestionRecord,
    event: ContentIngestionAuditEvent,
  ): Promise<void>;
  recordReceived(
    record: ContentIngestionRecord,
    contentHash: string,
    byteLength: number,
    event: ContentIngestionAuditEvent,
  ): Promise<void>;
  markStaged(
    record: ContentIngestionRecord,
    stagedAt: string,
    event: ContentIngestionAuditEvent,
  ): Promise<void>;
  markValidationPending(record: ContentIngestionRecord): Promise<void>;
  markAccepted(
    record: ContentIngestionRecord,
    acceptedMediaType: string,
    acceptedAt: string,
    event: ContentIngestionAuditEvent,
  ): Promise<void>;
  markRejected(
    record: ContentIngestionRecord,
    failureCode: "unsupported_content" | "malformed_content",
    rejectedAt: string,
    event: ContentIngestionAuditEvent,
  ): Promise<void>;
  markProcessingFailed(
    record: ContentIngestionRecord,
    failureCode:
      | "storage_write_failed"
      | "stored_content_missing"
      | "stored_content_integrity_failed"
      | "validation_failed",
    failedAt: string,
    event: ContentIngestionAuditEvent,
  ): Promise<void>;
}

export interface InitiateContentIngestionInput {
  tenantId: string;
  workspaceId: string;
  actorSubjectId: string;
  displayFilename: string;
  declaredMediaType?: string | null;
  occurredAt: string;
}

export interface ReceiveContentInput {
  tenantId: string;
  workspaceId: string;
  actorSubjectId: string;
  ingestionId: string;
  bytes: ArrayBuffer;
  occurredAt: string;
}

export interface ContentIngestionSelector {
  tenantId: string;
  workspaceId: string;
  actorSubjectId: string;
  ingestionId: string;
  occurredAt: string;
}

export class ContentIngestionInputError extends Error {}
export class ContentIngestionNotAvailableError extends Error {}
export class ContentIngestionRetryMismatchError extends Error {}
export class ContentIngestionRecoveryRequiredError extends Error {}

export function requireFound(
  record: ContentIngestionRecord | null,
): ContentIngestionRecord {
  if (!record)
    throw new ContentIngestionNotAvailableError("Content is not available.");
  return record;
}

export function isTerminal(state: ContentIngestionState): boolean {
  return (
    state === "accepted" ||
    state === "rejected" ||
    state === "processing_failed"
  );
}

export type AcceptedContent = ContentObject;
