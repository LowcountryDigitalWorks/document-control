import type { AuditLogFilters } from "./audit-log-read-service";

const maximumAuditSearchLength = 100;

export class AuditLogFilterValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AuditLogFilterValidationError";
  }
}

export function parseAuditLogFilters(
  searchParameters: URLSearchParams,
): AuditLogFilters {
  const value = searchParameters.get("q");
  if (value === null) {
    return {};
  }
  const query = value.trim();
  if (!query) {
    return {};
  }
  if (query.length > maximumAuditSearchLength) {
    throw new AuditLogFilterValidationError(
      `Audit search text must be ${maximumAuditSearchLength} characters or fewer.`,
    );
  }
  return { query };
}
