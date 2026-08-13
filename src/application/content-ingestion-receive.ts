import { sha256 } from "../domain/hash";
import type { ContentStore } from "./ports";
import {
  CONTENT_INGESTION_MAX_BYTES,
  ContentIngestionInputError,
  ContentIngestionRecoveryRequiredError,
  ContentIngestionRetryMismatchError,
  type ContentIngestionIdentifierGenerator,
  type ContentIngestionRecord,
  type ContentIngestionRepository,
  type ContentValidator,
  type ReceiveContentInput,
} from "./content-ingestion-model";
import { ingestionEvent } from "./content-ingestion-events";
import { loadExistingCandidate } from "./content-ingestion-storage";
import { validateStagedCandidate } from "./content-ingestion-validation-flow";

export async function receiveAndValidateCandidate(
  repository: ContentIngestionRepository,
  store: ContentStore,
  validator: ContentValidator,
  identifiers: ContentIngestionIdentifierGenerator,
  record: ContentIngestionRecord,
  input: ReceiveContentInput,
): Promise<ContentIngestionRecord> {
  const byteLength = input.bytes.byteLength;
  if (byteLength < 1 || byteLength > CONTENT_INGESTION_MAX_BYTES) {
    throw new ContentIngestionInputError(
      `Content must contain 1-${CONTENT_INGESTION_MAX_BYTES} bytes.`,
    );
  }

  const contentHash = await sha256(new Uint8Array(input.bytes));
  let candidate = record;
  if (candidate.contentHash || candidate.byteLength !== null) {
    if (
      candidate.contentHash !== contentHash ||
      candidate.byteLength !== byteLength
    ) {
      throw new ContentIngestionRetryMismatchError();
    }
  } else {
    await repository.recordReceived(
      candidate,
      contentHash,
      byteLength,
      ingestionEvent(
        identifiers,
        candidate,
        input.actorSubjectId,
        input.occurredAt,
        "content.intake.received",
        { byteLength, contentHash },
      ),
    );
    candidate = { ...candidate, contentHash, byteLength };
  }

  const existing = await loadExistingCandidate(
    repository,
    store,
    identifiers,
    candidate,
    input.actorSubjectId,
    input.occurredAt,
  );
  if (existing === undefined) return reload(repository, candidate);

  if (!existing) {
    try {
      await store.create(candidate.storageKey, {
        bytes: input.bytes,
        contentType: "application/octet-stream",
        contentHash,
      });
    } catch {
      throw new ContentIngestionRecoveryRequiredError();
    }
  }

  try {
    await repository.markStaged(
      candidate,
      input.occurredAt,
      ingestionEvent(
        identifiers,
        candidate,
        input.actorSubjectId,
        input.occurredAt,
        "content.intake.staged",
        { byteLength, contentHash },
      ),
    );
  } catch {
    throw new ContentIngestionRecoveryRequiredError();
  }

  return validateStagedCandidate(
    repository,
    validator,
    identifiers,
    { ...candidate, state: "staged", stagedAt: input.occurredAt },
    input.actorSubjectId,
    input.occurredAt,
    input.bytes,
  );
}

async function reload(
  repository: ContentIngestionRepository,
  record: ContentIngestionRecord,
): Promise<ContentIngestionRecord> {
  const current = await repository.find(
    record.tenantId,
    record.workspaceId,
    record.id,
  );
  if (!current)
    throw new Error("Content intake disappeared during processing.");
  return current;
}
