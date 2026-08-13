import type { ContentObject, ContentStore } from "./ports";
import {
  ContentIngestionNotAvailableError,
  type ContentIngestionFailureCode,
  type ContentIngestionIdentifierGenerator,
  type ContentIngestionRecord,
  type ContentIngestionRepository,
} from "./content-ingestion-model";
import { ingestionEvent } from "./content-ingestion-events";

type ProcessingFailure = Exclude<
  ContentIngestionFailureCode,
  "unsupported_content" | "malformed_content"
>;

export async function failIngestion(
  repository: ContentIngestionRepository,
  identifiers: ContentIngestionIdentifierGenerator,
  record: ContentIngestionRecord,
  actorSubjectId: string,
  occurredAt: string,
  failureCode: ProcessingFailure,
): Promise<void> {
  await repository.markProcessingFailed(
    record,
    failureCode,
    occurredAt,
    ingestionEvent(
      identifiers,
      record,
      actorSubjectId,
      occurredAt,
      "content.processing_failed",
      { reason: failureCode },
    ),
  );
}

export async function loadExistingCandidate(
  repository: ContentIngestionRepository,
  store: ContentStore,
  identifiers: ContentIngestionIdentifierGenerator,
  record: ContentIngestionRecord,
  actorSubjectId: string,
  occurredAt: string,
): Promise<ContentObject | null | undefined> {
  try {
    const existing = await store.get(
      record.storageKey,
      record.contentHash ?? "",
    );
    if (existing && existing.bytes.byteLength !== record.byteLength) {
      await failIngestion(
        repository,
        identifiers,
        record,
        actorSubjectId,
        occurredAt,
        "stored_content_integrity_failed",
      );
      return undefined;
    }
    return existing;
  } catch {
    await failIngestion(
      repository,
      identifiers,
      record,
      actorSubjectId,
      occurredAt,
      "stored_content_integrity_failed",
    );
    return undefined;
  }
}

export async function loadCandidateForRecovery(
  repository: ContentIngestionRepository,
  store: ContentStore,
  identifiers: ContentIngestionIdentifierGenerator,
  record: ContentIngestionRecord,
  actorSubjectId: string,
  occurredAt: string,
): Promise<ContentObject | null> {
  const stored = await loadExistingCandidate(
    repository,
    store,
    identifiers,
    record,
    actorSubjectId,
    occurredAt,
  );
  if (stored === undefined) return null;
  if (stored === null) {
    await failIngestion(
      repository,
      identifiers,
      record,
      actorSubjectId,
      occurredAt,
      "stored_content_missing",
    );
    return null;
  }
  return stored;
}

export async function readAcceptedCandidate(
  store: ContentStore,
  record: ContentIngestionRecord,
): Promise<ContentObject> {
  if (
    record.state !== "accepted" ||
    !record.contentHash ||
    !record.acceptedMediaType
  ) {
    throw unavailable();
  }
  let stored: ContentObject | null;
  try {
    stored = await store.get(record.storageKey, record.contentHash);
  } catch {
    throw unavailable();
  }
  if (!stored || stored.bytes.byteLength !== record.byteLength) {
    throw unavailable();
  }
  return {
    bytes: stored.bytes,
    contentType: record.acceptedMediaType,
    contentHash: record.contentHash,
  };
}

function unavailable(): ContentIngestionNotAvailableError {
  return new ContentIngestionNotAvailableError("Content is not available.");
}
