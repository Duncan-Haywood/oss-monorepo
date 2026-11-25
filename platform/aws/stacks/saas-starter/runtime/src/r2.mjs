// A Cloudflare R2-shaped binding (get/put/head/delete/list) over one S3 bucket and key prefix.
// `s3` is an S3Client from @aws-sdk/client-s3 (or a test double with the same `send`).
import { GetObjectCommand, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

export class R2Shim {
  constructor(s3, bucket, prefix = "") { this.s3 = s3; this.bucket = bucket; this.prefix = prefix; }
  #k(key) { return this.prefix + key; }
  async put(key, value, opts = {}) {
    const body = value instanceof ArrayBuffer ? Buffer.from(value) : value;
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket, Key: this.#k(key), Body: body,
      ContentType: opts.httpMetadata?.contentType, Metadata: opts.customMetadata,
    }));
    return { key };
  }
  async get(key) {
    try {
      const r = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.#k(key) }));
      const bytes = await r.Body.transformToByteArray();
      return {
        key, size: bytes.length, httpMetadata: { contentType: r.ContentType }, customMetadata: r.Metadata || {},
        async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length); },
        async text() { return Buffer.from(bytes).toString("utf8"); },
        async json() { return JSON.parse(Buffer.from(bytes).toString("utf8")); },
      };
    } catch (e) { if (e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404) return null; throw e; }
  }
  async head(key) {
    try { const r = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.#k(key) })); return { key, size: r.ContentLength, customMetadata: r.Metadata || {} }; }
    catch (e) { if (e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404) return null; throw e; }
  }
  async delete(key) { await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.#k(key) })); }
  async list({ prefix = "", limit = 1000, cursor } = {}) {
    const r = await this.s3.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: this.#k(prefix), MaxKeys: limit, ContinuationToken: cursor }));
    return {
      objects: (r.Contents || []).map((o) => ({ key: o.Key.slice(this.prefix.length), size: o.Size })),
      truncated: !!r.IsTruncated, cursor: r.NextContinuationToken,
    };
  }
}
