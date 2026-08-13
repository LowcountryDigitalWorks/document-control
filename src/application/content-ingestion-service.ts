import { buildContentIngestionContentKey } from "../infrastructure/content-key";
import type { ContentObject, ContentStore } from "./ports";
import {
  CONTENT_INGESTION_MAX_IN_FLIGHT_PER_WORKSPACE,
  ContentIngestionInputError,
  isTerminal,
  requireFound,
  type ContentIngestionIdentifierGenerator,
  type ContentIngestionRecord,
  type ContentIngestionRepository,
  type ContentIngestionSelector,
  type ContentValidator,
  type InitiateContentIngestionInput,
  type ReceiveContentInput,
} from "./content-ingestion-model";
import { ingestionEvent } from "./content-ingestion-events";
import {
  readAcceptedContent,
  recoverCandidate,
} from "./content-ingestion-recovery";
import { receiveAndValidateCandidate } from "./content-ingestion-receive";
import {
  normalizeDeclaredMediaType,
  normalizeDisplayFilename,
  normalizeGeneratedIdentifier,
} from "./content-ingestion-validation";

export class ContentIngestionService {
  public constructor(
    private readonly repository: ContentIngestionRepository,
    private readonly contentStore: ContentStore,
    private readonly validator: ContentValidator,
    private readonly identifiers: ContentIngestionIdentifierGenerator,
    private readonly storageProvider: string,
  ) {
    normalizeGeneratedIdentifier(storageProvider);
  }

  public async initiate(
    input: InitiateContentIngestionInput,
  ): Promise<ContentIngestionRecord> {
    const displayFilename = normalizeDisplayFilename(input.displayFilename);
    const declaredMediaType = normalizeDeclaredMediaType(input.declaredMediaType);
    if (
      (await this.repository.countInFlight(input.tenantId, input.workspaceId)) >=
      CONTENT_INGESTION_MAX_IN_FLIGHT_PER_WORKSPACE
    ) {
      throw new ContentIngestionInputError(
        "The workspace has reached the bounded in-flight intake limit.",
      );
    }

    const id = normalizeGeneratedIdentifier(this.identifiers.nextId());
    const record: ContentIngestionRecord = {
      id,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      initiatingSubjectId: input.actorSubjectId,
      displayFilename,
      declaredMediaType,
      acceptedMediaType: null,
      state: "intake_initiated",
      storageProvider: this.storageProvider,
      storageKey: buildContentIngestionContentKey({
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        ingestionId: id,
      }),
      byteLength: null,
      contentHash: null,
      failureCode: null,
      createdAt: input.occurredAt,
      stagedAt: null,
      acceptedAt: null,
      rejectedAt: null,
      failedAt: null,
    };
    await this.repository.initiate(
      record,
      ingestionEvent(
        this.identifiers,
        record,
        input.actorSubjectId,
        input.occurredAt,
        "content.intake.initiated",
      ),
    );
    return record;
  }

  public async receiveAndValidate(
    input: ReceiveContentInput,
  ): Promise<ContentIngestionRecord> {
    const record = await this.requireRecord(input);
    if (isTerminal(record.state)) return record;
    if (record.state !== "intake_initiated") return this.recover(input);
    return receiveAndValidateCandidate(
      this.repository,
      this.contentStore,
      this.validator,
      this.identifiers,
      record,
      input,
    );
  }

  public async recover(
    input: ContentIngestionSelector,
  ): Promise<ContentIngestionRecord> {
    return recoverCandidate(
      this.repository,
      this.contentStore,
      this.validator,
      this.identifiers,
      await this.requireRecord(input),
      input,
    );
  }

  public async getAcceptedContent(
    input: Omit<ContentIngestionSelector, "occurredAt">,
  ): Promise<ContentObject> {
    return readAcceptedContent(
      this.contentStore,
      await this.requireRecord(input),
    );
  }

  private async requireRecord(input: {
    tenantId: string;
    workspaceId: string;
    ingestionId: string;
  }): Promise<ContentIngestionRecord> {
    return this.repository
      .find(input.tenantId, input.workspaceId, input.ingestionId)
      .then(requireFound);
  }
}
