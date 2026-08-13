import type {
  ContentIngestionAuditEvent,
  ContentIngestionFailureCode,
  ContentIngestionIdentifierGenerator,
  ContentIngestionRecord,
  ContentIngestionRepository,
  ContentValidationResult,
  ContentValidator,
} from "../../src/application/content-ingestion";
import type { ContentObject, ContentStore } from "../../src/application/ports";
import { sha256 } from "../../src/domain/hash";

export class SequenceIds implements ContentIngestionIdentifierGenerator {
  private value = 0;
  public nextId(): string { this.value += 1; return `generated-${this.value}`; }
}

export class MemoryStore implements ContentStore {
  public readonly objects = new Map<string, ContentObject>();
  public createCalls = 0;
  public failCreate = false;
  public tamperRead = false;
  public async get(key: string, expectedHash: string): Promise<ContentObject | null> {
    const found = this.objects.get(key);
    if (!found) return null;
    if (this.tamperRead || found.contentHash !== expectedHash) throw new Error("integrity");
    return { ...found, bytes: found.bytes.slice(0) };
  }
  public async create(key: string, object: ContentObject): Promise<void> {
    this.createCalls += 1;
    if (this.failCreate) throw new Error("storage");
    if (this.objects.has(key)) throw new Error("immutable");
    if (await sha256(new Uint8Array(object.bytes)) !== object.contentHash) throw new Error("hash");
    this.objects.set(key, { ...object, bytes: object.bytes.slice(0) });
  }
}

export class StubValidator implements ContentValidator {
  public result: ContentValidationResult = { outcome: "accepted", acceptedMediaType: "application/pdf" };
  public fail = false;
  public async validate(): Promise<ContentValidationResult> {
    if (this.fail) throw new Error("validator");
    return this.result;
  }
}

export class MemoryIngestionRepository implements ContentIngestionRepository {
  public readonly records = new Map<string, ContentIngestionRecord>();
  public readonly events: ContentIngestionAuditEvent[] = [];
  public failStagedOnce = false;
  public inFlightOverride: number | null = null;
  public async countInFlight(tenantId: string, workspaceId: string): Promise<number> {
    if (this.inFlightOverride !== null) return this.inFlightOverride;
    return [...this.records.values()].filter((r) => r.tenantId === tenantId && r.workspaceId === workspaceId && ["intake_initiated", "staged", "validation_pending"].includes(r.state)).length;
  }
  public async find(tenantId: string, workspaceId: string, id: string): Promise<ContentIngestionRecord | null> {
    const r = this.records.get(id);
    return r && r.tenantId === tenantId && r.workspaceId === workspaceId ? { ...r } : null;
  }
  public async initiate(record: ContentIngestionRecord, event: ContentIngestionAuditEvent): Promise<void> { this.records.set(record.id, { ...record }); this.events.push(event); }
  public async recordReceived(record: ContentIngestionRecord, hash: string, length: number, event: ContentIngestionAuditEvent): Promise<void> { this.patch(record, { contentHash: hash, byteLength: length }); this.events.push(event); }
  public async markStaged(record: ContentIngestionRecord, at: string, event: ContentIngestionAuditEvent): Promise<void> { if (this.failStagedOnce) { this.failStagedOnce = false; throw new Error("db"); } this.patch(record, { state: "staged", stagedAt: at }); this.events.push(event); }
  public async markValidationPending(record: ContentIngestionRecord): Promise<void> { this.patch(record, { state: "validation_pending" }); }
  public async markAccepted(record: ContentIngestionRecord, media: string, at: string, event: ContentIngestionAuditEvent): Promise<void> { this.patch(record, { state: "accepted", acceptedMediaType: media, acceptedAt: at }); this.events.push(event); }
  public async markRejected(record: ContentIngestionRecord, code: "unsupported_content" | "malformed_content", at: string, event: ContentIngestionAuditEvent): Promise<void> { this.patch(record, { state: "rejected", failureCode: code, rejectedAt: at }); this.events.push(event); }
  public async markProcessingFailed(record: ContentIngestionRecord, code: Exclude<ContentIngestionFailureCode, "unsupported_content" | "malformed_content">, at: string, event: ContentIngestionAuditEvent): Promise<void> { this.patch(record, { state: "processing_failed", failureCode: code, failedAt: at }); this.events.push(event); }
  private patch(record: ContentIngestionRecord, patch: Partial<ContentIngestionRecord>): void {
    const current = this.records.get(record.id);
    if (!current) throw new Error("missing");
    this.records.set(record.id, { ...current, ...patch });
  }
}

export function pdfBytes(text = "synthetic"): ArrayBuffer {
  return new TextEncoder().encode(`%PDF-1.7\n${text}\n%%EOF`).buffer;
}
