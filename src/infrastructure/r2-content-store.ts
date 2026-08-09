import type { ContentObject, ContentStore } from "../application/ports";

export class R2ContentStore implements ContentStore {
  public constructor(private readonly bucket: R2Bucket) {}

  public async get(key: string): Promise<ContentObject | null> {
    const object = await this.bucket.get(key);
    if (!object) return null;

    return {
      bytes: await object.arrayBuffer(),
      contentType:
        object.httpMetadata?.contentType ?? "application/octet-stream",
      contentHash: object.customMetadata?.contentHash ?? "",
    };
  }

  public async put(key: string, object: ContentObject): Promise<void> {
    await this.bucket.put(key, object.bytes, {
      httpMetadata: { contentType: object.contentType },
      customMetadata: { contentHash: object.contentHash },
    });
  }
}
