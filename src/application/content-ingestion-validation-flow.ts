import {
  requireFound,
  type ContentIngestionIdentifierGenerator,
  type ContentIngestionRecord,
  type ContentIngestionRepository,
  type ContentValidationResult,
  type ContentValidator,
} from "./content-ingestion-model";
import { ingestionEvent } from "./content-ingestion-events";
import { failIngestion } from "./content-ingestion-storage";
import { normalizeAcceptedMediaType } from "./content-ingestion-validation";

export async function validateStagedCandidate(
  repository: ContentIngestionRepository,
  validator: ContentValidator,
  identifiers: ContentIngestionIdentifierGenerator,
  record: ContentIngestionRecord,
  actorSubjectId: string,
  occurredAt: string,
  bytes: ArrayBuffer,
): Promise<ContentIngestionRecord> {
  let current = record;
  if (current.state === "staged") {
    await repository.markValidationPending(current);
    current = { ...current, state: "validation_pending" };
  }
  if (current.state !== "validation_pending") {
    throw new Error("Content intake is not ready for validation.");
  }

  let result: ContentValidationResult;
  try {
    result = await validator.validate({
      bytes,
      displayFilename: current.displayFilename,
      declaredMediaType: current.declaredMediaType,
    });
  } catch {
    await failIngestion(
      repository,
      identifiers,
      current,
      actorSubjectId,
      occurredAt,
      "validation_failed",
    );
    return reload(repository, current);
  }

  if (result.outcome === "rejected") {
    await repository.markRejected(
      current,
      result.reason,
      occurredAt,
      ingestionEvent(
        identifiers,
        current,
        actorSubjectId,
        occurredAt,
        "content.validation.rejected",
        { reason: result.reason },
      ),
    );
    return reload(repository, current);
  }

  let acceptedMediaType: string;
  try {
    acceptedMediaType = normalizeAcceptedMediaType(result.acceptedMediaType);
  } catch {
    await failIngestion(
      repository,
      identifiers,
      current,
      actorSubjectId,
      occurredAt,
      "validation_failed",
    );
    return reload(repository, current);
  }

  await repository.markAccepted(
    current,
    acceptedMediaType,
    occurredAt,
    ingestionEvent(
      identifiers,
      current,
      actorSubjectId,
      occurredAt,
      "content.accepted",
      {
        acceptedMediaType,
        byteLength: current.byteLength ?? 0,
        contentHash: current.contentHash ?? "",
      },
    ),
  );
  return reload(repository, current);
}

async function reload(
  repository: ContentIngestionRepository,
  record: ContentIngestionRecord,
): Promise<ContentIngestionRecord> {
  return repository
    .find(record.tenantId, record.workspaceId, record.id)
    .then(requireFound);
}
