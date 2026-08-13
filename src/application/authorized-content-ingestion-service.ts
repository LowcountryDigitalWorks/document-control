import type { AuthorizationPolicy } from "./authorization";
import type {
  ContentIngestionRecord,
  ContentIngestionSelector,
  InitiateContentIngestionInput,
  ReceiveContentInput,
} from "./content-ingestion";
import { ContentIngestionService } from "./content-ingestion";
import type { ContentObject } from "./ports";

export class AuthorizedContentIngestionService {
  public constructor(
    private readonly ingestion: ContentIngestionService,
    private readonly authorization: AuthorizationPolicy,
  ) {}

  public async initiate(input: InitiateContentIngestionInput): Promise<ContentIngestionRecord> {
    await this.authorization.assertAllowed({
      subjectId: input.actorSubjectId,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      permission: "document.version.create",
    });
    return this.ingestion.initiate(input);
  }

  public async receiveAndValidate(input: ReceiveContentInput): Promise<ContentIngestionRecord> {
    await this.authorization.assertAllowed({
      subjectId: input.actorSubjectId,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      permission: "document.version.create",
    });
    return this.ingestion.receiveAndValidate(input);
  }

  public async recover(input: ContentIngestionSelector): Promise<ContentIngestionRecord> {
    await this.authorization.assertAllowed({
      subjectId: input.actorSubjectId,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      permission: "document.version.create",
    });
    return this.ingestion.recover(input);
  }

  public async getAcceptedContent(
    input: Omit<ContentIngestionSelector, "occurredAt">,
  ): Promise<ContentObject> {
    await this.authorization.assertAllowed({
      subjectId: input.actorSubjectId,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      permission: "document.read",
    });
    return this.ingestion.getAcceptedContent(input);
  }
}
