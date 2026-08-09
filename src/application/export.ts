import type {
  Approval,
  AuditEvent,
  Document,
  DocumentVersion,
  RoleAssignment,
  Tenant,
  Template,
  WorkflowDefinition,
  WorkflowInstance,
  Workspace,
} from "../domain/models";

export const exportFormat = "ldw.document-control.export" as const;
export const exportVersion = 1 as const;

export interface PortableExportV1 {
  format: typeof exportFormat;
  version: typeof exportVersion;
  exportedAt: string;
  tenant: Tenant;
  workspaces: Workspace[];
  roleAssignments: RoleAssignment[];
  documents: Document[];
  documentVersions: DocumentVersion[];
  templates: Template[];
  workflowDefinitions: WorkflowDefinition[];
  workflowInstances: WorkflowInstance[];
  approvals: Approval[];
  auditEvents: AuditEvent[];
}

export function serializeExport(data: PortableExportV1): string {
  return JSON.stringify(data, null, 2);
}

export function parseExport(serialized: string): PortableExportV1 {
  const candidate: unknown = JSON.parse(serialized);

  if (
    !isRecord(candidate) ||
    candidate.format !== exportFormat ||
    candidate.version !== exportVersion
  ) {
    throw new Error("Unsupported document-control export format or version.");
  }

  return candidate as unknown as PortableExportV1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
