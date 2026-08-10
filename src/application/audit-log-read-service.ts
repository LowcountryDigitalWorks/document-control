import type { DatabaseProvider } from "./ports";

export interface AuditLogFilters {
  query?: string;
}

export interface AuditLogItem {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorSubjectId: string;
  actorName: string;
  occurredAt: string;
  payloadSummary: readonly string[];
}

interface AuditLogRow {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorSubjectId: string;
  actorName: string;
  occurredAt: string;
  payloadJson: string;
}

const maximumAuditResults = 100;

export class AuditLogReadService {
  public constructor(private readonly database: DatabaseProvider) {}

  public async listAuditEvents(
    tenantId: string,
    workspaceId: string,
    filters: AuditLogFilters = {},
  ): Promise<readonly AuditLogItem[]> {
    const conditions = ["audit.tenant_id = ?", "audit.workspace_id = ?"];
    const parameters: unknown[] = [tenantId, workspaceId];

    if (filters.query) {
      const pattern = `%${escapeLikePattern(filters.query)}%`;
      conditions.push(`(
        audit.event_type COLLATE NOCASE LIKE ? ESCAPE '\\'
        OR audit.entity_type COLLATE NOCASE LIKE ? ESCAPE '\\'
        OR audit.entity_id COLLATE NOCASE LIKE ? ESCAPE '\\'
        OR actor.display_name COLLATE NOCASE LIKE ? ESCAPE '\\'
      )`);
      parameters.push(pattern, pattern, pattern, pattern);
    }

    const rows = await this.database.query<AuditLogRow>(
      `SELECT
         audit.id,
         audit.event_type AS eventType,
         audit.entity_type AS entityType,
         audit.entity_id AS entityId,
         audit.actor_subject_id AS actorSubjectId,
         actor.display_name AS actorName,
         audit.occurred_at AS occurredAt,
         audit.payload_json AS payloadJson
       FROM audit_events audit
       JOIN identity_subjects actor ON actor.id = audit.actor_subject_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY audit.occurred_at DESC, audit.id DESC
       LIMIT ${maximumAuditResults}`,
      parameters,
    );

    return rows.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      entityType: row.entityType,
      entityId: row.entityId,
      actorSubjectId: row.actorSubjectId,
      actorName: row.actorName,
      occurredAt: row.occurredAt,
      payloadSummary: summarizePayload(row.payloadJson),
    }));
  }
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function summarizePayload(serialized: string): readonly string[] {
  const parsed: unknown = JSON.parse(serialized);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Audit event payload must be a JSON object.");
  }

  return Object.entries(parsed)
    .filter(([, value]) =>
      ["string", "number", "boolean"].includes(typeof value),
    )
    .slice(0, 4)
    .map(([key, value]) => `${humanize(key)}: ${String(value)}`);
}

function humanize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
}
