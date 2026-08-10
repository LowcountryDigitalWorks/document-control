import {
  documentStatuses,
  templateLifecycleStates,
  type CurrentApprovalFilter,
  type DocumentStatusFilter,
  type TemplateLifecycleFilter,
  type WorkspaceDocumentFilters,
  type WorkspaceTemplateFilters,
} from "./workspace-read-service";

const maximumSearchLength = 100;
const currentApprovalFilters = ["approved", "required"] as const;

export class WorkspaceFilterValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "WorkspaceFilterValidationError";
  }
}

export function parseDocumentFilters(
  searchParameters: URLSearchParams,
): WorkspaceDocumentFilters {
  const query = parseQuery(searchParameters.get("q"));
  const status = parseEnum(
    searchParameters.get("status"),
    documentStatuses,
    "document status",
  ) as DocumentStatusFilter | undefined;
  const currentApproval = parseEnum(
    searchParameters.get("approval"),
    currentApprovalFilters,
    "current approval filter",
  ) as CurrentApprovalFilter | undefined;

  return compact({ query, status, currentApproval });
}

export function parseTemplateFilters(
  searchParameters: URLSearchParams,
): WorkspaceTemplateFilters {
  const query = parseQuery(searchParameters.get("q"));
  const lifecycle = parseEnum(
    searchParameters.get("lifecycle"),
    templateLifecycleStates,
    "template lifecycle",
  ) as TemplateLifecycleFilter | undefined;

  return compact({ query, lifecycle });
}

function parseQuery(value: string | null): string | undefined {
  if (value === null) {
    return undefined;
  }
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length > maximumSearchLength) {
    throw new WorkspaceFilterValidationError(
      `Search text must be ${maximumSearchLength} characters or fewer.`,
    );
  }
  return normalized;
}

function parseEnum<T extends string>(
  value: string | null,
  allowed: readonly T[],
  label: string,
): T | undefined {
  if (value === null || value === "") {
    return undefined;
  }
  if (!allowed.includes(value as T)) {
    throw new WorkspaceFilterValidationError(`Unknown ${label}.`);
  }
  return value as T;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
