/**
 * Bound raw request body size before JSON.parse / formData allocation.
 *
 * Field-level soft-caps / hard-rejects (MAX_CONTACT_*, parseCheckoutSessionId,
 * etc.) only run *after* `request.json()` / `request.formData()` has already
 * decoded the full body into memory. Rate limits blunt request count, not
 * per-request payload size — a public caller can still force multi-MB parse
 * work under the window.
 *
 * Prefer Content-Length pre-check (cheap reject) for a fast path, but never
 * rely on it alone: a chunked-transfer request (no Content-Length, or one
 * that understates the real size) must still be bounded while it's being
 * read. `request.arrayBuffer()` fully drains the body into memory before
 * any length check can run, so a single unauthenticated request with no
 * Content-Length and a multi-GB streamed body would otherwise force
 * unbounded allocation ahead of the cap — the read loop below streams via
 * `request.body.getReader()` and cancels as soon as the running total
 * exceeds maxBytes, so memory use is bounded to ~maxBytes regardless of how
 * much the client tries to send. Soft-cap is wrong (would change parsed
 * fields); fail closed with 400. Stripe webhook stays on unbounded
 * `request.text()` — Stripe signs the raw payload and can exceed this
 * ceiling.
 *
 * Form-urlencoded / multipart POSTs share the same ceiling via
 * readFormBodyWithByteLimit (public-formdata-body-byte-length-cap) — a
 * Content-Length-only gate is not enough when the header is missing or
 * understated.
 */

export const MAX_PUBLIC_JSON_BODY_BYTES = 32_768; // 32 KiB

/** Alias — FormData + JSON public POSTs share one whole-body ceiling. */
export const MAX_PUBLIC_REQUEST_BODY_BYTES = MAX_PUBLIC_JSON_BODY_BYTES;

export type ReadJsonBodyResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "too_large" | "invalid_json" };

export type ReadFormBodyResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; reason: "too_large" | "invalid_form" };

export type ReadTextBodyResult =
  | { ok: true; value: string }
  | { ok: false; reason: "too_large" };

/**
 * True when Content-Length is present and exceeds maxBytes.
 * Missing / non-numeric headers return false — callers must still bound the
 * consumed bytes (arrayBuffer / formData path).
 */
export function contentLengthExceedsLimit(
  request: Request,
  maxBytes: number = MAX_PUBLIC_JSON_BODY_BYTES,
): boolean {
  if (!Number.isFinite(maxBytes) || maxBytes < 0) {
    throw new Error("maxBytes must be a non-negative finite number");
  }
  const raw = request.headers.get("content-length");
  if (raw === null) return false;
  const n = Number(raw);
  return Number.isFinite(n) && n > maxBytes;
}

async function readBoundedArrayBuffer(
  request: Request,
  maxBytes: number,
): Promise<
  | { ok: true; buf: ArrayBuffer }
  | { ok: false; reason: "too_large" | "read_error" }
> {
  if (contentLengthExceedsLimit(request, maxBytes)) {
    return { ok: false, reason: "too_large" };
  }

  if (!request.body) {
    return { ok: true, buf: new ArrayBuffer(0) };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("too_large").catch(() => {});
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "read_error" };
  }

  const buf = new ArrayBuffer(total);
  const out = new Uint8Array(buf);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, buf };
}

/**
 * Read + parse JSON with a hard byte ceiling. Empty body → invalid_json
 * (callers that allow empty bodies — e.g. preview-open — treat that as
 * missing, not 400). Over-long → too_large.
 */
export async function readJsonBodyWithByteLimit<T = unknown>(
  request: Request,
  maxBytes: number = MAX_PUBLIC_JSON_BODY_BYTES,
): Promise<ReadJsonBodyResult<T>> {
  if (!Number.isFinite(maxBytes) || maxBytes < 0) {
    throw new Error("maxBytes must be a non-negative finite number");
  }

  const bounded = await readBoundedArrayBuffer(request, maxBytes);
  if (!bounded.ok) {
    return {
      ok: false,
      reason: bounded.reason === "too_large" ? "too_large" : "invalid_json",
    };
  }
  if (bounded.buf.byteLength === 0) {
    return { ok: false, reason: "invalid_json" };
  }

  try {
    const text = new TextDecoder("utf-8").decode(bounded.buf);
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}

/**
 * Read raw text with a hard byte ceiling, without parsing it — for a route
 * that needs the exact raw body for HMAC/signature verification (Resend's
 * svix-style webhook) before it can be JSON.parse'd. Shares the same
 * streaming-bounded-read as readJsonBodyWithByteLimit (Content-Length
 * pre-check, then cancel the stream once the running total exceeds
 * maxBytes) so a chunked-transfer request with no/understated Content-Length
 * still can't force unbounded allocation ahead of signature verification.
 * Unlike the Stripe webhook (documented exception above — Stripe signs a
 * payload that can legitimately exceed this ceiling), Resend delivery-event
 * payloads are small fixed-shape JSON, so the default 32 KiB ceiling never
 * rejects legitimate traffic (see resend-webhook-body-byte-limit).
 */
export async function readTextBodyWithByteLimit(
  request: Request,
  maxBytes: number = MAX_PUBLIC_JSON_BODY_BYTES,
): Promise<ReadTextBodyResult> {
  if (!Number.isFinite(maxBytes) || maxBytes < 0) {
    throw new Error("maxBytes must be a non-negative finite number");
  }

  const bounded = await readBoundedArrayBuffer(request, maxBytes);
  if (!bounded.ok) {
    return { ok: false, reason: "too_large" };
  }

  return { ok: true, value: new TextDecoder("utf-8").decode(bounded.buf) };
}

/**
 * Read + parse form-urlencoded / multipart with the same hard byte ceiling
 * as JSON. Content-Length alone is not enough (missing / understated header
 * still lets request.formData() allocate). Rebuilds a Request from the
 * bounded arrayBuffer so the platform FormData parser can run safely.
 *
 * Empty body → ok with `{}` (contact treats missing fields as empty strings).
 * Over-long → too_large. Parse failure → invalid_form.
 */
export async function readFormBodyWithByteLimit(
  request: Request,
  maxBytes: number = MAX_PUBLIC_REQUEST_BODY_BYTES,
): Promise<ReadFormBodyResult> {
  if (!Number.isFinite(maxBytes) || maxBytes < 0) {
    throw new Error("maxBytes must be a non-negative finite number");
  }

  const bounded = await readBoundedArrayBuffer(request, maxBytes);
  if (!bounded.ok) {
    return {
      ok: false,
      reason: bounded.reason === "too_large" ? "too_large" : "invalid_form",
    };
  }

  try {
    const headers = new Headers(request.headers);
    // Drop Content-Length — the rebuilt body length is authoritative.
    headers.delete("content-length");
    const rebuilt = new Request(request.url, {
      method: request.method,
      headers,
      body: bounded.buf.byteLength > 0 ? bounded.buf : undefined,
    });
    const form = await rebuilt.formData();
    const out: Record<string, unknown> = {};
    form.forEach((value, key) => {
      out[key] = typeof value === "string" ? value : value.name;
    });
    return { ok: true, value: out };
  } catch {
    return { ok: false, reason: "invalid_form" };
  }
}
