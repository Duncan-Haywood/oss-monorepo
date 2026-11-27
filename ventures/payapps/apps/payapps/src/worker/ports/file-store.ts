// File storage: R2 when the `FILES` bucket is bound, D1 when it is not (2026-11-27).
//
// PayApps keeps pay-application backup, change-order backup, notices, insurance certificates, RFI,
// submittal, daily-report, close-out, T&M and company-document files. They belong in R2, but the
// production Cloudflare token could not use R2 on 2026-11-27 ("Authentication error [code: 10000]"),
// so every upload answered 503 and the plan lists sold storage as "not switched on yet". When the
// binding is missing, files now go to the `file_blobs` table instead, cut into chunks under D1's 2 MB
// value limit (a file is at most 15 MB, so at most 15 chunks).
//
// D1 is small (500 MB a database on Cloudflare's free plan, shared with every job's records), so the D1
// store is capped twice: each company at D1_ORG_LIMIT_BYTES (`storageLimitBytes`, which the upload
// services use instead of the plan's figure) and the whole deployment at D1_TOTAL_LIMIT_BYTES (checked
// on every put), so files can never fill the database the rest of the app writes to.
//
// Reads try R2 first and then D1, lists walk both, and deletes clear both, so a deploy that gains the
// bucket later keeps serving every file written before it; new files then go to R2. Only the subset of
// R2Bucket the services use is implemented: put, get (arrayBuffer, body, size, httpMetadata), delete
// and list (prefix, cursor, limit).

import { D1_ORG_LIMIT_BYTES } from "@shared/plans";
import { AppError } from "../lib/errors";

/** Bytes per D1 row. D1 allows 2,000,000 bytes per value; 1 MiB leaves room and keeps each insert small. */
export const D1_CHUNK_BYTES = 1024 * 1024;
/** Each company's file storage while files live in D1 (shared/plans.ts, so the plan lists say it). */
export { D1_ORG_LIMIT_BYTES };
/** Every company's files together while they live in D1, leaving the rest of a 500 MB database free. */
export const D1_TOTAL_LIMIT_BYTES = 300 * 1024 * 1024;

export type FileStoreKind = "r2" | "d1";

type PutValue = ArrayBuffer | ArrayBufferView | string | ReadableStream | Blob | null;

interface StoredFile {
  key: string;
  size: number;
  httpMetadata: { contentType?: string };
  customMetadata: Record<string, string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  readonly body: ReadableStream;
}

interface ListResult {
  objects: { key: string; size: number }[];
  truncated: boolean;
  cursor?: string;
}

interface ListOptions {
  prefix?: string;
  cursor?: string;
  limit?: number;
}

export const d1StorageFull = () =>
  new AppError(
    507,
    "files_storage_full",
    "File storage on this site is full for now. Delete files you no longer need, or try again later.",
  );

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

function storedFile(
  key: string,
  bytes: Uint8Array,
  contentType: string | null,
  custom: string | null,
): StoredFile {
  const copy = () => bytes.slice().buffer as ArrayBuffer;
  let customMetadata: Record<string, string> = {};
  try {
    customMetadata = custom ? (JSON.parse(custom) as Record<string, string>) : {};
  } catch {
    customMetadata = {};
  }
  return {
    key,
    size: bytes.byteLength,
    httpMetadata: contentType ? { contentType } : {},
    customMetadata,
    arrayBuffer: async () => copy(),
    get body() {
      return new Response(copy()).body as ReadableStream;
    },
  };
}

/** The D1 half: `file_blobs` rows keyed by (key, chunk). */
export class D1FileBucket {
  constructor(
    private readonly db: D1Database,
    private readonly totalLimitBytes = D1_TOTAL_LIMIT_BYTES,
  ) {}

  /** Bytes held, counted once per file (chunk 0 carries the file's size). */
  async totalBytes(): Promise<number> {
    const row = await this.db
      .prepare("SELECT coalesce(sum(size), 0) AS n FROM file_blobs WHERE chunk = 0")
      .first<{ n: number }>();
    return Number(row?.n ?? 0);
  }

  async put(
    key: string,
    value: PutValue,
    options?: {
      httpMetadata?: { contentType?: string } | Headers;
      customMetadata?: Record<string, string>;
    },
  ): Promise<void> {
    const bytes = await toBytes(value);
    // A replaced file frees its old size, so it is left out of the total.
    const row = await this.db
      .prepare("SELECT coalesce(sum(size), 0) AS n FROM file_blobs WHERE chunk = 0 AND key <> ?")
      .bind(key)
      .first<{ n: number }>();
    if (Number(row?.n ?? 0) + bytes.byteLength > this.totalLimitBytes) throw d1StorageFull();
    const meta = options?.httpMetadata;
    const contentType =
      meta instanceof Headers ? meta.get("content-type") : (meta?.contentType ?? null);
    const custom = options?.customMetadata ? JSON.stringify(options.customMetadata) : null;
    const parts = chunk(bytes);
    const now = Math.floor(Date.now() / 1000);
    // One batch is one transaction: a reader never sees half a file, and a replaced file loses its
    // old tail chunks.
    await this.db.batch([
      this.db.prepare("DELETE FROM file_blobs WHERE key = ?").bind(key),
      ...parts.map((p, i) =>
        this.db
          .prepare(
            "INSERT INTO file_blobs (key, chunk, bytes, content_type, custom_metadata, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .bind(key, i, p, contentType, custom, bytes.byteLength, now),
      ),
    ]);
  }

  async get(key: string): Promise<StoredFile | null> {
    const { results } = await this.db
      .prepare(
        "SELECT chunk, bytes, content_type, custom_metadata, size FROM file_blobs WHERE key = ? ORDER BY chunk",
      )
      .bind(key)
      .all<{
        chunk: number;
        bytes: ArrayBuffer | number[];
        content_type: string | null;
        custom_metadata: string | null;
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
      if (at + part.byteLength > size)
        throw new Error(`file_blobs ${key}: more than ${size} bytes`);
      out.set(part, at);
      at += part.byteLength;
    }
    // A short read means chunks went missing: refuse rather than hand back a truncated backup PDF.
    if (at !== size) throw new Error(`file_blobs ${key}: ${at} of ${size} bytes`);
    return storedFile(key, out, first.content_type, first.custom_metadata);
  }

  async delete(keys: string | string[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys];
    if (!list.length) return;
    await this.db.batch(
      list.map((k) => this.db.prepare("DELETE FROM file_blobs WHERE key = ?").bind(k)),
    );
  }

  /** Keys under a prefix in key order; the cursor is the last key returned. */
  async list(options: ListOptions = {}): Promise<ListResult> {
    const prefix = options.prefix ?? "";
    const limit = Math.max(1, Math.min(options.limit ?? 1000, 1000));
    // substr instead of LIKE, so a key's own % or _ is never a wildcard.
    const { results } = await this.db
      .prepare(
        "SELECT key, size FROM file_blobs WHERE chunk = 0 AND substr(key, 1, ?) = ? AND key > ? ORDER BY key LIMIT ?",
      )
      .bind(prefix.length, prefix, options.cursor ?? "", limit + 1)
      .all<{ key: string; size: number }>();
    const page = results.slice(0, limit);
    const truncated = results.length > limit;
    return {
      objects: page.map((r) => ({ key: r.key, size: r.size })),
      truncated,
      ...(truncated ? { cursor: page[page.length - 1]?.key } : {}),
    };
  }
}

const R2_CURSOR = "r2:";
const D1_CURSOR = "d1:";

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

  /** R2's pages, then D1's; the cursor says which store it belongs to. */
  async list(options: ListOptions = {}): Promise<ListResult> {
    const { prefix, limit } = options;
    const cursor = options.cursor ?? R2_CURSOR;
    if (cursor.startsWith(R2_CURSOR)) {
      const r2Cursor = cursor.slice(R2_CURSOR.length) || undefined;
      const page = await this.r2.list({ prefix, limit, cursor: r2Cursor });
      const objects = page.objects.map((o) => ({ key: o.key, size: o.size }));
      if (page.truncated) return { objects, truncated: true, cursor: R2_CURSOR + page.cursor };
      return { objects, truncated: true, cursor: D1_CURSOR };
    }
    const d1Cursor = cursor.slice(D1_CURSOR.length) || undefined;
    const page = await this.d1.list({ prefix, limit, cursor: d1Cursor });
    return page.truncated ? { ...page, cursor: D1_CURSOR + page.cursor } : page;
  }
}

/** Where new files go, for /api/health and the plan lists. */
export function fileStoreKind(env: { FILES_R2?: R2Bucket }): FileStoreKind {
  return env.FILES_R2 ? "r2" : "d1";
}

/** A company's file storage: the plan's figure on R2, D1_ORG_LIMIT_BYTES (or less) on D1. */
export function storageLimitBytes(
  env: { FILES_R2?: R2Bucket },
  plan: { attachmentStorageBytes: number },
): number {
  return fileStoreKind(env) === "r2"
    ? plan.attachmentStorageBytes
    : Math.min(plan.attachmentStorageBytes, D1_ORG_LIMIT_BYTES);
}

/**
 * The env every service sees: `FILES` is R2 with a D1 fallback when the bucket is bound, and D1 alone
 * when it is not. The original binding stays at `FILES_R2` (undefined without R2).
 */
export function withFileStore<E extends { DB: D1Database; FILES?: R2Bucket; FILES_R2?: R2Bucket }>(
  env: E,
): E {
  if ("FILES_R2" in env) return env; // already wrapped
  const r2 = env.FILES;
  const d1 = new D1FileBucket(env.DB);
  const files = (r2 ? new R2WithD1Fallback(r2, d1) : d1) as unknown as R2Bucket;
  return { ...env, FILES: files, FILES_R2: r2 };
}
