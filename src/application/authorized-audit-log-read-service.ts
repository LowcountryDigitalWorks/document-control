import type { AuthorizationPolicy } from "./authorization";
import type {
  AuditLogFilters,
  AuditLogItem,
  AuditLogReadService,
} from "./audit-log-read-service";

export interface AuditLogReadContext {
  subjectId: string;
  tenantId: string;
  workspaceId: string;
}

export class AuthorizedAuditLogReadService {
  public constructor(
    private readonly read: AuditLogReadService,
    private readonly authorization: AuthorizationPolicy,
  ) {}

  public async listAuditEvents(
    context: AuditLogReadContext,
    filters: AuditLogFilters = {},
  ): Promise<readonly AuditLogItem[]> {
    await this.authorization.assertAllowed({
      subjectId: context.subjectId,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      permission: "audit.read",
    });
    return this.read.listAuditEvents(
      context.tenantId,
      context.workspaceId,
      filters,
    );
  }
}
