import { describe, expect, it } from "vitest";
import { sha256 } from "../../src/domain/hash";
import {
  buildDocumentVersionContentKey,
  buildTemplateVersionContentKey,
} from "../../src/infrastructure/content-key";
import { R2ContentStore } from "../../src/infrastructure/r2-content-store";

interface StoredObject {
  bytes: ArrayBuffer;
  contentType: string;
  contentHash: string;
}

class FakeR2Bucket {
  private readonly objects = new Map<string, StoredObject>();

  public async put(
    key: string,
    value: ArrayBuffer,
    options?: {
      onlyIf?: { etagDoesNotMatch?: string };
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<R2Object | null> {
    if (
      options?.onlyIf?.etagDoesNotMatch === "*" &&
      this.objects.has(key)
    ) {
      return null;
    }

    this.objects.set(key, {
      bytes: value.slice(0),
      contentType:
        options?.httpMetadata?.contentType ?? "application/octet-stream",
      contentHash: options?.customMetadata?.contentHash ?? "",
    });
    return {} as R2Object;
  }

  public async get(key: string): Promise<R2ObjectBody | null> {
    const object = this.objects.get(key);
    if (!object) return null;

    return {
      arrayBuffer: async () => object.bytes.slice(0),
      httpMetadata: { contentType: object.contentType },
      customMetadata: { contentHash: object.contentHash },
    } as unknown as R2ObjectBody;
  }

  public tamper(key: string, bytes: ArrayBuffer): void {
    const object = this.objects.get(key);
    if (!object) throw new Error("Missing fake object.");
    this.objects.set(key, { ...object, bytes: bytes.slice(0) });
  }
}

describe("content storage invariants", () => {
  it("creates immutable R2 objects and verifies bytes on read", async () => {
    const bucket = new FakeR2Bucket();
    const store = new R2ContentStore(bucket as unknown as R2Bucket);
    const bytes = new TextEncoder().encode("controlled document bytes").buffer;
    const contentHash = await sha256(new Uint8Array(bytes));
    const key = buildDocumentVersionContentKey({
      tenantId: "tenant-demo",
      workspaceId: "workspace-demo",
      documentId: "document-demo",
      versionId: "version-1",
    });

    await store.create(key, {
      bytes,
      contentType: "text/plain",
      contentHash,
    });

    await expect(
      store.create(key, { bytes, contentType: "text/plain", contentHash }),
    ).rejects.toThrow(/already exists/);

    await expect(store.get(key, contentHash)).resolves.toMatchObject({
      contentType: "text/plain",
      contentHash,
    });

    bucket.tamper(
      key,
      new TextEncoder().encode("tampered document bytes").buffer,
    );
    await expect(store.get(key, contentHash)).rejects.toThrow(/hash mismatch/);
  });

  it("rejects bytes that do not match the declared hash", async () => {
    const bucket = new FakeR2Bucket();
    const store = new R2ContentStore(bucket as unknown as R2Bucket);
    const bytes = new TextEncoder().encode("content").buffer;

    await expect(
      store.create("safe/key", {
        bytes,
        contentType: "text/plain",
        contentHash: `sha256:${"f".repeat(64)}`,
      }),
    ).rejects.toThrow(/do not match/);
  });

  it("centralizes tenant/workspace/version key construction", () => {
    expect(
      buildTemplateVersionContentKey({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        templateId: "template-demo",
        versionId: "version-1",
      }),
    ).toBe(
      "tenants/tenant-demo/workspaces/workspace-demo/templates/template-demo/versions/version-1/content",
    );

    expect(() =>
      buildDocumentVersionContentKey({
        tenantId: "../escape",
        workspaceId: "workspace-demo",
        documentId: "document-demo",
        versionId: "version-1",
      }),
    ).toThrow(/Unsafe content-key segment/);
  });
});
