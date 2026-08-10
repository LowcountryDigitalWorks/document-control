import type { AuthorizationPolicy } from "./authorization";
import type {
  PresentationSettingsSnapshot,
  PresentationSettingsUpdateResult,
  PresentationSettingsService,
  UpdatePresentationSettingsCommand,
} from "./presentation-settings-service";

export interface PresentationSettingsAuthorizationContext {
  subjectId: string;
  tenantId: string;
  workspaceId: string;
}

export class AuthorizedPresentationSettingsService {
  public constructor(
    private readonly settings: PresentationSettingsService,
    private readonly authorization: AuthorizationPolicy,
  ) {}

  public async getSettings(
    context: PresentationSettingsAuthorizationContext,
  ): Promise<PresentationSettingsSnapshot> {
    await this.assertAdministrationAllowed(context);
    return this.settings.getSettings(context.tenantId, context.workspaceId);
  }

  public async updateSettings(
    context: PresentationSettingsAuthorizationContext,
    command: Omit<
      UpdatePresentationSettingsCommand,
      "tenantId" | "workspaceId" | "actorSubjectId"
    >,
  ): Promise<PresentationSettingsUpdateResult> {
    await this.assertAdministrationAllowed(context);
    return this.settings.updateSettings({
      ...command,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorSubjectId: context.subjectId,
    });
  }

  private async assertAdministrationAllowed(
    context: PresentationSettingsAuthorizationContext,
  ): Promise<void> {
    await this.authorization.assertAllowed({
      subjectId: context.subjectId,
      tenantId: context.tenantId,
      permission: "tenant.manage",
    });
    await this.authorization.assertAllowed({
      subjectId: context.subjectId,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      permission: "workspace.manage",
    });
  }
}
