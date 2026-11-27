// File storage: R2 when the `FILES` bucket is bound, D1 when it is not.
//
// Job Shop Quote keeps RFQ drawings, CAD files, shop logos and the exact PDF of every sent quote. They
// belong in R2, but the production Cloudflare token could not use R2 on 2026-11-27 (PayApps' deploy:
// "Authentication error [code: 10000]"), and without somewhere to keep files the app cannot take an
// RFQ or send a quote. So when the binding is missing, files go to the `file_blobs` table instead, cut
// into chunks under D1's 2 MB value limit (an RFQ file is at most 15 MB, so at most 16 chunks).
//
// Reads try R2 first and then D1, and deletes clear both, so a deploy that gains the bucket later keeps
// serving every file written before it; new files then go to R2. Only the subset of R2Bucket the
// services use is implemented: put, get (arrayBuffer, body, size, httpMetadata) and delete.

/** Bytes per D1 row. D1 allows 2,000,000 bytes per value; 1 MiB leaves room and keeps each insert small. */
export const D1_CHUNK_BYTES = 1024 * 1024;

export type FileStoreKind = "r2" | "d1";

type PutValue = ArrayBuffer | ArrayBufferView | string | ReadableStream | Blob | null;

interface StoredFile {
  size: number;
  httpMetadata: { contentType?: string };
  arrayBuffer(): Promise<ArrayBuffer>;
  readonly body: ReadableStream;
}

async function toBytes(value: PutValue): Promise<Uint8Array> {
  if (value === null) return new Uint8Array(0);
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return new Uint8Array(await new Response(value).arrayBuffer());
}

/** Split bytes into D1-sized chunks; an empty file is one empty chunk, so it still exists. */
export function chunk(bytes: Uint8Array, size = D1_CHUNK_BYTES): Uint8Array[] {
  if (bytes.byteLength === 0) return [new Uint8Array(0)];
  const out: Uint8Array[] = [];
  for (let at = 0; at < bytes.byteLength; at += size) out.push(bytes.subarray(at, at + size));
  return out;
}

function storedFile(bytes: Uint8Array, contentType: string | null): StoredFile {
  const copy = () => bytes.slice().buffer as ArrayBuffer;
  return {
    size: bytes.byteLength,
    httpMetadata: contentType ? { contentType } : {},
    arrayBuffer: async () => copy(),
    get body() {
      return new Response(copy()).body as ReadableStream;
    },
  };
}

/** The D1 half: `file_blobs` rows keyed by (key, chunk). */
export class D1FileBucket {
  constructor(private readonly db: D1Database) {}

  async put(
    key: string,
    value: PutValue,
    options?: { httpMetadata?: { contentType?: string } | Headers },
  ): Promise<void> {
    const bytes = await toBytes(value);
    const meta = options?.httpMetadata;
    const contentType =
      meta instanceof Headers ? meta.get("content-type") : (meta?.contentType ?? null);
    const parts = chunk(bytes);
    const now = Math.floor(Date.now() / 1000);
    // One batch is one transaction: a reader never sees half a file, and a replaced file loses its
    // old tail chunks.
    await this.db.batch([
      this.db.prepare("DELETE FROM file_blobs WHERE key = ?").bind(key),
      ...parts.map((p, i) =>
        this.db
          .prepare(
            "INSERT INTO file_blobs (key, chunk, bytes, content_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .bind(key, i, p, contentType, bytes.byteLength, now),
      ),
    ]);
  }

  async get(key: string): Promise<StoredFile | null> {
    const { results } = await this.db
      .prepare(
        "SELECT chunk, bytes, content_type, size FROM file_blobs WHERE key = ? ORDER BY chunk",
      )
      .bind(key)
      .all<{
        chunk: number;
        bytes: ArrayBuffer | number[];
        content_type: string | null;
        size: number;
      }>();
    const first = results[0];
    if (!first) return null;
    const size = first.size;
    const out = new Uint8Array(size);
    let at = 0;
    for (const r of results) {
      const part =
        r.bytes instanceof ArrayBuffer ? new Uint8Array(r.bytes) : Uint8Array.from(r.bytes);
      out.set(part, at);
      at += part.byteLength;
    }
    // A short read means chunks went missing: refuse rather than hand back a truncated drawing or PDF.
    if (at !== size) throw new Error(`file_blobs ${key}: ${at} of ${size} bytes`);
    return storedFile(out, first.content_type);
  }

  async delete(keys: string | string[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys];
    if (!list.length) return;
    await this.db.batch(
      list.map((k) => this.db.prepare("DELETE FROM file_blobs WHERE key = ?").bind(k)),
    );
  }
}

/** R2 first, D1 for what R2 does not hold (files written before the bucket was bound). */
class R2WithD1Fallback {
  constructor(
    private readonly r2: R2Bucket,
    private readonly d1: D1FileBucket,
  ) {}

  put(...args: Parameters<R2Bucket["put"]>) {
    return this.r2.put(...args);
  }

  async get(key: string) {
    return (await this.r2.get(key)) ?? (await this.d1.get(key));
  }

  async delete(keys: string | string[]) {
    await this.r2.delete(keys);
    await this.d1.delete(keys);
  }
}

/** Which store new files go to, for /api/health. */
export function fileStoreKind(env: { FILES?: R2Bucket }): FileStoreKind {
  return env.FILES ? "r2" : "d1";
}

const wrapped = new WeakMap<object, unknown>();

/**
 * The env every service sees: `FILES` is R2 with a D1 fallback when the bucket is bound, and D1 alone
 * when it is not. The original binding stays at `FILES_R2` (undefined without R2).
 */
export function withFileStore<E extends { DB: D1Database; FILES: R2Bucket }>(env: E): E {
  const cached = wrapped.get(env);
  if (cached) return cached as E;
  const r2 = (env as { FILES?: R2Bucket }).FILES;
  if ("FILES_R2" in env) return env; // already wrapped
  const d1 = new D1FileBucket(env.DB);
  const files = (r2 ? new R2WithD1Fallback(r2, d1) : d1) as unknown as R2Bucket;
  const out = { ...env, FILES: files, FILES_R2: r2 } as E;
  wrapped.set(env, out);
  return out;
}
