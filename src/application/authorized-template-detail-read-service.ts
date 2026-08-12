import type { AuthorizationPolicy } from "./authorization";
import type {
  TemplateDetailEvidence,
  TemplateDetailReadService,
} from "./template-detail-read-service";

export interface TemplateDetailReadContext {
  subjectId: string;
  tenantId: string;
  workspaceId: string;
  templateId: string;
}

export class AuthorizedTemplateDetailReadService {
  public constructor(
    private readonly read: TemplateDetailReadService,
    private readonly authorization: AuthorizationPolicy,
  ) {}

  public async getTemplateDetail(
    context: TemplateDetailReadContext,
  ): Promise<TemplateDetailEvidence> {
    await this.authorization.assertAllowed({
      subjectId: context.subjectId,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      permission: "template.read",
    });
    return this.read.getTemplateDetail(
      context.tenantId,
      context.workspaceId,
      context.templateId,
    );
  }
}
