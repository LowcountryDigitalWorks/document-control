export const permissions = [
  "tenant.manage",
  "workspace.manage",
  "role.manage",
  "template.read",
  "template.use",
  "template.manage",
  "document.read",
  "document.create",
  "document.version.create",
  "document.retire",
  "document.review",
  "document.approve",
  "workflow.execute",
  "workflow.manage",
  "audit.read",
  "export.create",
] as const;

export type Permission = (typeof permissions)[number];

export interface AuthorizationRequest {
  subjectId: string;
  tenantId: string;
  permission: Permission;
  workspaceId?: string;
  documentId?: string;
  workflowInstanceId?: string;
}

export interface AuthorizationPolicy {
  assertAllowed(request: AuthorizationRequest): Promise<void>;
}

export class AuthorizationDeniedError extends Error {
  public constructor() {
    super("The subject is not authorized for this action.");
    this.name = "AuthorizationDeniedError";
  }
}
