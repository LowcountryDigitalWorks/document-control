import type { AuthorizationPolicy } from "./authorization";
import type {
  ReviewApprovalQueueReadService,
  WorkQueueItem,
} from "./review-approval-queue-read-service";

export interface WorkQueueReadContext {
  subjectId: string;
  tenantId: string;
  workspaceId: string;
}

export class AuthorizedReviewApprovalQueueReadService {
  public constructor(
    private readonly read: ReviewApprovalQueueReadService,
    private readonly authorization: AuthorizationPolicy,
  ) {}

  public async listReviewQueue(
    context: WorkQueueReadContext,
  ): Promise<readonly WorkQueueItem[]> {
    await this.assertDocumentRead(context);
    await this.authorization.assertAllowed({
      subjectId: context.subjectId,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      permission: "document.review",
    });
    return this.read.listQueue(context.tenantId, context.workspaceId, "review");
  }

  public async listApprovalQueue(
    context: WorkQueueReadContext,
  ): Promise<readonly WorkQueueItem[]> {
    await this.assertDocumentRead(context);
    await this.authorization.assertAllowed({
      subjectId: context.subjectId,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      permission: "document.approve",
    });
    return this.read.listQueue(
      context.tenantId,
      context.workspaceId,
      "approval",
    );
  }

  private async assertDocumentRead(
    context: WorkQueueReadContext,
  ): Promise<void> {
    await this.authorization.assertAllowed({
      subjectId: context.subjectId,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      permission: "document.read",
    });
  }
}
