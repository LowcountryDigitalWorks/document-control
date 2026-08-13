import type { ContentIngestionIdentifierGenerator } from "../application/content-ingestion";

export class CryptoContentIngestionIdentifierGenerator implements ContentIngestionIdentifierGenerator {
  public nextId(): string {
    return crypto.randomUUID();
  }
}
