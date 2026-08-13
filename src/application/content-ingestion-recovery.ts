import type { ContentObject, ContentStore } from "./ports";
import {
  isTerminal,
  type ContentIngestionIdentifierGenerator,
  type ContentIngestionRecord,
  type ContentIngestionRepository,
  type ContentIngestionSelector,
  type ContentValidator,
} from "./content-ingestion-model";
import { ingestionEvent } from "./content-ingestion-events";
import {
  loadCandidateForRecovery,
  readAcceptedCandidate,
} from "./content-ingestion-storage";
import { validateStagedCandidate } from "./content-ingestion-validation-flow";

export async function recoverCandidate(
  repository: ContentIngestionRepository,
  store: ContentStore,
  validator: ContentValidator,
  identifiers: ContentIngestionIdentifierGenerator,
  record: ContentIngestionRecord,
  input: ContentIngestionSelector,
): Promise<ContentIngestionRecord> {
  if (isTerminal(record.state)) return record;
  if (!record.contentHash || record.byteLength === null) return record;

  const contentHash = record.contentHash;
  const byteLength = record.byteLength;
  const stored = await loadCandidateForRecovery(
    repository,
    store,
    identifiers,
    record,
    input.actorSubjectId,
    input.occurredAt,
  );
  if (!stored) return reload(repository, record);

  let candidate = record;
  if (candidate.state === "intake_initiated") {
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
    candidate = {
      ...candidate,
      state: "staged",
      stagedAt: input.occurredAt,
    };
  }

  return validateStagedCandidate(
    repository,
    validator,
    identifiers,
    candidate,
    input.actorSubjectId,
    input.occurredAt,
    stored.bytes,
  );
}

export async function readAcceptedContent(
  store: ContentStore,
  record: ContentIngestionRecord,
): Promise<ContentObject> {
  return readAcceptedCandidate(store, record);
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
  if (!current) throw new Error("Content intake disappeared during recovery.");
  return current;
}
