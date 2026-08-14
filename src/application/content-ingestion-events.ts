import {
  type ContentIngestionAuditEvent,
  type ContentIngestionAuditEventType,
  type ContentIngestionIdentifierGenerator,
  type ContentIngestionRecord,
} from "./content-ingestion-model";
import { normalizeGeneratedIdentifier } from "./content-ingestion-validation";

export function ingestionEvent(
  identifiers: ContentIngestionIdentifierGenerator,
  record: Pick<ContentIngestionRecord, "id" | "tenantId" | "workspaceId">,
  actorSubjectId: string,
  occurredAt: string,
  type: ContentIngestionAuditEventType,
  details: Readonly<Record<string, string | number>> = {},
): ContentIngestionAuditEvent {
  return {
    id: normalizeGeneratedIdentifier(identifiers.nextId()),
    type,
    tenantId: record.tenantId,
    workspaceId: record.workspaceId,
    actorSubjectId,
    ingestionId: record.id,
    occurredAt,
    details,
  };
}
