import type { AuditLogItem } from "./audit-log-read-service";

const csvHeaders = [
  "occurred_at",
  "event_type",
  "entity_type",
  "entity_id",
  "actor",
  "evidence_summary",
] as const;

export function serializeAuditLogCsv(items: readonly AuditLogItem[]): string {
  const rows = items.map((item) =>
    [
      item.occurredAt,
      item.eventType,
      item.entityType,
      item.entityId,
      item.actorName,
      item.payloadSummary.join(" | "),
    ]
      .map(encodeCsvCell)
      .join(","),
  );

  return `\uFEFF${[csvHeaders.map(encodeCsvCell).join(","), ...rows].join("\r\n")}\r\n`;
}

function encodeCsvCell(value: string): string {
  const safeValue = neutralizeSpreadsheetFormula(value);
  return `"${safeValue.replaceAll('"', '""')}"`;
}

function neutralizeSpreadsheetFormula(value: string): string {
  return /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
}
