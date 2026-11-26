// The `FILES` binding on AWS: grants' R2 calls over the product's private S3 bucket (docs/AWS.md).
//
// The starter gives the app `env.BUCKET`, an R2-shaped shim over S3 (runtime/src/r2.mjs: get, put,
// head, delete(key), list). This adapter fills in the parts of R2 grants uses that the shim does
// not (`body` streams, multi-key delete) and enforces the key layout on every call:
//   orgs/{orgId}/...   tenant files (documents, audio, exports, submission packages)
//   catalog/...        the public opportunity catalog (no tenant data)
//   ops/...            the health sentinel
// Anything else is refused before it reaches S3, so a bug cannot write tenant data to a shared key.

/** The subset of the starter's R2Shim this adapter calls. */
export interface StarterBucket {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    opts?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> },
  ): Promise<{ key: string }>;
  get(key: string): Promise<{
    key: string;
    size: number;
    httpMetadata?: { contentType?: string };
    customMetadata?: Record<string, string>;
    arrayBuffer(): Promise<ArrayBuffer>;
  } | null>;
  head(
    key: string,
  ): Promise<{ key: string; size: number; customMetadata?: Record<string, string> } | null>;
  delete(key: string): Promise<void>;
  list(opts?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    objects: { key: string; size: number }[];
    truncated: boolean;
    cursor?: string;
  }>;
}

const ORG_KEY = /^orgs\/[A-Za-z0-9_-]+\/./;
const SHARED_PREFIXES = ["catalog/", "ops/"];

export class FileKeyError extends Error {
  constructor(key: string) {
    super(
      `refused object key outside orgs/{orgId}/, catalog/ or ops/: ${JSON.stringify(key.slice(0, 80))}`,
    );
    this.name = "FileKeyError";
  }
}

/** True for a key grants may store: orgs/{orgId}/<path>, catalog/<path>, ops/<path>. */
export function isAllowedFileKey(key: string): boolean {
  if (key.includes("..") || key.includes("//") || key.startsWith("/")) return false;
  if (ORG_KEY.test(key)) return true;
  return SHARED_PREFIXES.some((p) => key.startsWith(p) && key.length > p.length);
}

/** A list prefix must stay inside one org (orgs/{orgId}/...) or a shared prefix. */
export function isAllowedListPrefix(prefix: string): boolean {
  if (prefix.includes("..")) return false;
  return (
    /^orgs\/[A-Za-z0-9_-]+\//.test(prefix) || SHARED_PREFIXES.some((p) => prefix.startsWith(p))
  );
}

function check(key: string): string {
  if (!isAllowedFileKey(key)) throw new FileKeyError(key);
  return key;
}

type PutValue = ArrayBuffer | ArrayBufferView | string | ReadableStream | Blob | null;

async function toBytes(value: PutValue): Promise<ArrayBuffer | Uint8Array | string> {
  if (value === null) return "";
  if (typeof value === "string" || value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return new Uint8Array(await new Response(value).arrayBuffer());
}

function objectBody(bytes: ArrayBuffer) {
  return {
    get body(): ReadableStream {
      return new Response(bytes).body as ReadableStream;
    },
    bodyUsed: false,
    arrayBuffer: async () => bytes,
    bytes: async () => new Uint8Array(bytes),
    text: async () => new TextDecoder().decode(bytes),
    json: async <T>() => JSON.parse(new TextDecoder().decode(bytes)) as T,
    blob: async () => new Blob([bytes]),
  };
}

export class S3FilesBucket {
  constructor(private readonly bucket: StarterBucket) {}

  async put(
    key: string,
    value: PutValue,
    opts: {
      httpMetadata?: { contentType?: string } | Headers;
      customMetadata?: Record<string, string>;
    } = {},
  ) {
    const contentType =
      opts.httpMetadata instanceof Headers
        ? (opts.httpMetadata.get("content-type") ?? undefined)
        : opts.httpMetadata?.contentType;
    const bytes = await toBytes(value);
    await this.bucket.put(check(key), bytes, {
      httpMetadata: contentType ? { contentType } : undefined,
      customMetadata: opts.customMetadata,
    });
    const size =
      typeof bytes === "string" ? new TextEncoder().encode(bytes).byteLength : bytes.byteLength;
    return { key, size, httpMetadata: { contentType }, customMetadata: opts.customMetadata ?? {} };
  }

  async get(key: string) {
    const obj = await this.bucket.get(check(key));
    if (!obj) return null;
    const bytes = await obj.arrayBuffer();
    return {
      key,
      size: obj.size,
      httpMetadata: obj.httpMetadata ?? {},
      customMetadata: obj.customMetadata ?? {},
      writeHttpMetadata(headers: Headers) {
        if (obj.httpMetadata?.contentType)
          headers.set("content-type", obj.httpMetadata.contentType);
      },
      ...objectBody(bytes),
    };
  }

  async head(key: string) {
    const obj = await this.bucket.head(check(key));
    return obj ? { key, size: obj.size, customMetadata: obj.customMetadata ?? {} } : null;
  }

  async delete(keys: string | string[]): Promise<void> {
    const all = (Array.isArray(keys) ? keys : [keys]).map(check);
    for (const k of all) await this.bucket.delete(k);
  }

  async list(opts: { prefix?: string; limit?: number; cursor?: string } = {}) {
    const prefix = opts.prefix ?? "";
    if (!isAllowedListPrefix(prefix)) throw new FileKeyError(prefix);
    const r = await this.bucket.list({ prefix, limit: opts.limit, cursor: opts.cursor });
    return {
      objects: r.objects.map((o) => ({ key: o.key, size: o.size })),
      truncated: r.truncated,
      ...(r.truncated && r.cursor ? { cursor: r.cursor } : {}),
      delimitedPrefixes: [] as string[],
    };
  }
}

/** The adapter typed as the R2 binding the rest of the app expects. */
export function createS3Files(bucket: StarterBucket): R2Bucket {
  return new S3FilesBucket(bucket) as unknown as R2Bucket;
}
