/**
 * Bound raw request body size before JSON.parse / formData allocation.
 *
 * Field-level soft-caps / hard-rejects (MAX_CONTACT_*, parseCheckoutSessionId,
 * etc.) only run *after* `request.json()` has already decoded the full body
 * into memory. Rate limits blunt request count, not per-request payload size —
 * a public caller can still force multi-MB JSON.parse work under the window.
 *
 * Prefer Content-Length pre-check (cheap reject) + arrayBuffer byteLength
 * (covers missing / understated Content-Length). Soft-cap is wrong (would
 * change parsed fields); fail closed with 400. Stripe webhook stays on
 * unbounded `request.text()` — Stripe signs the raw payload and can exceed
 * this ceiling.
 */

export const MAX_PUBLIC_JSON_BODY_BYTES = 32_768; // 32 KiB

export type ReadJsonBodyResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "too_large" | "invalid_json" };

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
  if (contentLengthExceedsLimit(request, maxBytes)) {
    return { ok: false, reason: "too_large" };
  }

  let buf: ArrayBuffer;
  try {
    buf = await request.arrayBuffer();
  } catch {
    return { ok: false, reason: "invalid_json" };
  }

  if (buf.byteLength > maxBytes) {
    return { ok: false, reason: "too_large" };
  }
  if (buf.byteLength === 0) {
    return { ok: false, reason: "invalid_json" };
  }

  try {
    const text = new TextDecoder("utf-8").decode(buf);
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}
