import type { AuthorizationPolicy } from "./authorization";
import type { PortableExportV1 } from "./export";
import type { PortableExportReadService } from "./portable-export-read-service";

export interface PortableExportContext {
  subjectId: string;
  tenantId: string;
  exportedAt: string;
}

export class AuthorizedPortableExportService {
  public constructor(
    private readonly read: PortableExportReadService,
    private readonly authorization: AuthorizationPolicy,
  ) {}

  public async createTenantExport(
    context: PortableExportContext,
  ): Promise<PortableExportV1> {
    await this.authorization.assertAllowed({
      subjectId: context.subjectId,
      tenantId: context.tenantId,
      permission: "export.create",
    });
    return this.read.createTenantExport(context.tenantId, context.exportedAt);
  }
}
