const safeSegment = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export interface DocumentVersionKeyParts {
  tenantId: string;
  workspaceId: string;
  documentId: string;
  versionId: string;
}

export interface TemplateVersionKeyParts {
  tenantId: string;
  workspaceId: string;
  templateId: string;
  versionId: string;
}

export interface ContentIngestionKeyParts {
  tenantId: string;
  workspaceId: string;
  ingestionId: string;
}

export function buildDocumentVersionContentKey(
  parts: DocumentVersionKeyParts,
): string {
  return [
    "tenants",
    segment(parts.tenantId),
    "workspaces",
    segment(parts.workspaceId),
    "documents",
    segment(parts.documentId),
    "versions",
    segment(parts.versionId),
    "content",
  ].join("/");
}

export function buildTemplateVersionContentKey(
  parts: TemplateVersionKeyParts,
): string {
  return [
    "tenants",
    segment(parts.tenantId),
    "workspaces",
    segment(parts.workspaceId),
    "templates",
    segment(parts.templateId),
    "versions",
    segment(parts.versionId),
    "content",
  ].join("/");
}

export function buildContentIngestionContentKey(
  parts: ContentIngestionKeyParts,
): string {
  return [
    "tenants",
    segment(parts.tenantId),
    "workspaces",
    segment(parts.workspaceId),
    "content-ingestions",
    segment(parts.ingestionId),
    "staged-content",
  ].join("/");
}

function segment(value: string): string {
  if (!safeSegment.test(value)) {
    throw new Error(`Unsafe content-key segment: ${value}`);
  }
  return value;
}
