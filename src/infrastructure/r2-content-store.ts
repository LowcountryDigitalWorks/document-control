import type { ContentObject, ContentStore } from "../application/ports";
import { sha256 } from "../domain/hash";

export class R2ContentStore implements ContentStore {
  public constructor(private readonly bucket: R2Bucket) {}

  public async get(
    key: string,
    expectedHash: string,
  ): Promise<ContentObject | null> {
    const object = await this.bucket.get(key);
    if (!object) return null;

    const bytes = await object.arrayBuffer();
    const computedHash = await sha256(new Uint8Array(bytes));

    if (computedHash !== expectedHash) {
      throw new Error(`Stored content hash mismatch for ${key}.`);
    }

    const recordedHash = object.customMetadata?.contentHash;
    if (recordedHash && recordedHash !== expectedHash) {
      throw new Error(`Stored content metadata mismatch for ${key}.`);
    }

    return {
      bytes,
      contentType:
        object.httpMetadata?.contentType ?? "application/octet-stream",
      contentHash: computedHash,
    };
  }

  public async create(key: string, object: ContentObject): Promise<void> {
    const computedHash = await sha256(new Uint8Array(object.bytes));
    if (computedHash !== object.contentHash) {
      throw new Error("Content bytes do not match the declared SHA-256 hash.");
    }

    const stored = await this.bucket.put(key, object.bytes, {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: object.contentType },
      customMetadata: { contentHash: computedHash },
    });

    if (stored === null) {
      throw new Error(`Content object already exists at immutable key ${key}.`);
    }
  }
}
