export interface TenantContext {
  subjectId: string;
  tenantId: string;
  workspaceId?: string;
}

export interface TenantContextResolver {
  resolve(
    subjectId: string,
    tenantId: string,
    workspaceId?: string,
  ): Promise<TenantContext>;
}

export class TenantContextDeniedError extends Error {
  public constructor() {
    super("The requested application context is not available.");
    this.name = "TenantContextDeniedError";
  }
}
