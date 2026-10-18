// Real-network layer: given an S3 bucket name, sends two plain, unsigned GET
// requests -- one asking the bucket to list its own contents
// (`?max-keys=10`), one asking to read its ACL (`?acl`) -- and returns
// exactly what came back: status, response headers, and a byte-capped body.
// Nothing here classifies a result; that is analyze.mjs's job. Deliberately
// the same module imported unmodified by the CLI (Node 22's built-in
// `fetch`) and by the browser page (`index.html` imports it directly), the
// same shape `ventures/dotenv-exposure-check/probe.mjs` and
// `ventures/git-exposure-check/probe.mjs` document.
//
// Both requests are unsigned (no AWS credentials involved anywhere in this
// tool) -- exactly the request an anonymous visitor, or `curl`, already
// makes. S3's anonymous-access model is what this tool reads: a bucket
// either answers an unsigned GET or it returns AccessDenied, and that
// decision is made entirely by the bucket's own ACL and bucket-policy
// configuration, not by anything this tool sends.
//
// This module never fetches an actual object's content -- only the bucket's
// own listing and ACL documents, both of which S3 returns as XML describing
// the bucket itself, never a stored file's bytes. See analyze.mjs for what
// is and is not extracted from those two documents.
//
// This module only ever talks to the one bucket name the caller supplies, at
// the fixed S3 REST endpoints below. It never attempts a PUT, POST, or
// DELETE.

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT =
  's3-bucket-exposure-check/1 (+https://duncan-haywood.github.io/monorepo-projects/s3-bucket-exposure-check/)';
// A bucket listing or ACL document is normally a few KB of XML. This cap is
// generous enough to still classify a real response while bounding what this
// tool ever holds in memory.
const MAX_BODY_BYTES = 2_000_000;

// A bucket name must be DNS-compatible for virtual-hosted-style addressing
// (lowercase letters, digits, dots, hyphens, 3-63 chars) -- reject anything
// else before it is ever used to build a URL, rather than let a malformed
// name produce a confusing fetch error.
const BUCKET_NAME_RE = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

export function isValidBucketName(name) {
  return typeof name === 'string' && BUCKET_NAME_RE.test(name);
}

/** Builds the virtual-hosted-style REST URL for a bucket, optionally pinned
 * to a specific region's endpoint once one has been discovered. */
export function bucketUrl(bucket, { region, query = '' } = {}) {
  const host = region ? `${bucket}.s3.${region}.amazonaws.com` : `${bucket}.s3.amazonaws.com`;
  return `https://${host}/${query}`;
}

async function timedFetch(url, timeoutMs, fetchImpl) {
  const doFetch = fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new Error('no fetch implementation available in this environment');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await doFetch(url, {
      method: 'GET',
      headers: { 'user-agent': USER_AGENT, accept: 'application/xml,text/xml,*/*' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(res, maxBytes) {
  if (!res.body?.getReader) {
    const text = await res.text();
    return text.length > maxBytes ? text.slice(0, maxBytes) : text;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    chunks.push(value);
    if (total >= maxBytes) {
      try { await reader.cancel(); } catch { /* best effort */ }
      break;
    }
  }
  const combined = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const room = combined.length - offset;
    if (room <= 0) break;
    combined.set(room < chunk.length ? chunk.subarray(0, room) : chunk, offset);
    offset += Math.min(chunk.length, room);
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(combined);
}

/** One unsigned GET to a bucket's REST endpoint at the given query string
 * (`''` for a listing, `'?acl'` for the ACL document). Never throws on an
 * ordinary HTTP or network failure -- those come back as `ok: false` with
 * `error` set, the same discrimination every sibling checker's probe makes,
 * so a caller can tell "confirmed AccessDenied" (a clean status) apart from
 * "could not confirm either way" (a network error). */
export async function fetchBucketPath(bucket, query, { region, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl } = {}) {
  const url = bucketUrl(bucket, { region, query });
  let res;
  try {
    res = await timedFetch(url, timeoutMs, fetchImpl);
  } catch (err) {
    return { url, region: region ?? null, ok: false, status: null, text: null, error: err.message ?? String(err), regionHint: null };
  }
  const regionHint = res.headers?.get?.('x-amz-bucket-region') ?? null;
  let text = null;
  try {
    text = await readCapped(res, MAX_BODY_BYTES);
  } catch (err) {
    return { url, region: region ?? null, ok: false, status: res.status, text: null, error: err.message ?? String(err), regionHint };
  }
  return { url, region: region ?? null, ok: res.ok, status: res.status, text, error: res.ok ? null : `HTTP ${res.status}`, regionHint };
}

/** Fetches one bucket path, retrying once against the bucket's own region
 * endpoint if the first (global, us-east-1-style) request comes back with a
 * region mismatch -- S3 reports the correct region in the
 * `x-amz-bucket-region` header on both success and most error responses.
 * This is the same global-endpoint-then-regional-retry approach the
 * well-known open-source `S3Scanner` CLI uses, because unsigned requests to
 * a bucket outside `us-east-1` are frequently redirected. */
export async function fetchBucketPathWithRegionRetry(bucket, query, opts = {}) {
  const first = await fetchBucketPath(bucket, query, opts);
  const needsRetry = first.status === 301 || first.status === 400 || (first.regionHint && !opts.region);
  if (!needsRetry || !first.regionHint || first.regionHint === opts.region) return first;
  return fetchBucketPath(bucket, query, { ...opts, region: first.regionHint });
}

/** Full run for one bucket name: fetch the listing and the ACL document.
 * The listing runs first so its discovered region (if any) is reused for
 * the ACL request -- both live in the same region, so there is no reason to
 * pay for two independent region-discovery round trips. */
export async function checkBucket(bucket, { timeoutMs, fetchImpl } = {}) {
  if (!bucket) throw new Error('a bucket name is required');
  if (!isValidBucketName(bucket)) {
    throw new Error(`"${bucket}" is not a syntactically valid S3 bucket name`);
  }
  const listing = await fetchBucketPathWithRegionRetry(bucket, '?max-keys=10', { timeoutMs, fetchImpl });
  const region = listing.region ?? listing.regionHint ?? undefined;
  const acl = await fetchBucketPathWithRegionRetry(bucket, '?acl', { region, timeoutMs, fetchImpl });
  return { bucket, listing, acl };
}
