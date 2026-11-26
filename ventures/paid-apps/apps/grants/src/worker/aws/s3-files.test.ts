import { describe, expect, it } from "vitest";
import { FileKeyError, isAllowedFileKey, S3FilesBucket, type StarterBucket } from "./s3-files";

/** In-memory stand-in for the starter's R2Shim (same method shapes). */
function memoryBucket() {
  const objects = new Map<string, { bytes: Uint8Array; contentType?: string }>();
  const bucket: StarterBucket = {
    async put(key, value, opts) {
      const bytes =
        typeof value === "string"
          ? new TextEncoder().encode(value)
          : new Uint8Array(value as ArrayBuffer);
      objects.set(key, { bytes, contentType: opts?.httpMetadata?.contentType });
      return { key };
    },
    async get(key) {
      const o = objects.get(key);
      if (!o) return null;
      return {
        key,
        size: o.bytes.byteLength,
        httpMetadata: { contentType: o.contentType },
        arrayBuffer: async () => o.bytes.slice().buffer,
      };
    },
    async head(key) {
      const o = objects.get(key);
      return o ? { key, size: o.bytes.byteLength } : null;
    },
    async delete(key) {
      objects.delete(key);
    },
    async list({ prefix = "" } = {}) {
      return {
        objects: [...objects.keys()]
          .filter((k) => k.startsWith(prefix))
          .map((key) => ({ key, size: 1 })),
        truncated: false,
      };
    },
  };
  return { bucket, objects };
}

describe("S3FilesBucket", () => {
  it("accepts only orgs/{orgId}/, catalog/ and ops/ keys", () => {
    expect(isAllowedFileKey("orgs/org_a/documents/doc_1")).toBe(true);
    expect(isAllowedFileKey("catalog/grants_gov/1.json")).toBe(true);
    expect(isAllowedFileKey("ops/health-sentinel")).toBe(true);
    for (const bad of [
      "orgs/",
      "orgs//x",
      "orgs/org_a",
      "orgs/org_a/../org_b/x",
      "/orgs/a/x",
      "tmp/x",
      "",
      "catalog/",
    ]) {
      expect(isAllowedFileKey(bad), bad).toBe(false);
    }
  });

  it("round-trips bytes with a readable body and content type", async () => {
    const { bucket } = memoryBucket();
    const files = new S3FilesBucket(bucket);
    await files.put("orgs/org_a/documents/d1", new TextEncoder().encode("hello"), {
      httpMetadata: { contentType: "text/plain" },
    });
    const obj = await files.get("orgs/org_a/documents/d1");
    expect(await new Response(obj?.body).text()).toBe("hello");
    expect(await obj?.text()).toBe("hello");
    expect(obj?.httpMetadata.contentType).toBe("text/plain");
    expect(await files.head("orgs/org_a/documents/missing")).toBeNull();
  });

  it("refuses to read, write, list or delete outside the layout (cross-tenant listing included)", async () => {
    const { bucket, objects } = memoryBucket();
    const files = new S3FilesBucket(bucket);
    await files.put("orgs/org_b/secret", "b");
    await expect(files.put("shared/leak", "x")).rejects.toBeInstanceOf(FileKeyError);
    await expect(files.get("../orgs/org_b/secret")).rejects.toBeInstanceOf(FileKeyError);
    await expect(files.list({ prefix: "orgs/" })).rejects.toBeInstanceOf(FileKeyError);
    await expect(files.list({ prefix: "" })).rejects.toBeInstanceOf(FileKeyError);
    await expect(files.delete(["orgs/org_b/secret", "nope"])).rejects.toBeInstanceOf(FileKeyError);
    expect(objects.has("orgs/org_b/secret")).toBe(true); // nothing deleted when one key is bad
    const listed = await files.list({ prefix: "orgs/org_a/" });
    expect(listed.objects).toEqual([]);
    await files.delete(["orgs/org_b/secret"]);
    expect(objects.size).toBe(0);
  });
});
