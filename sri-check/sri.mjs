// Shared, runtime-agnostic core: Subresource Integrity (SRI) hashing and the
// pure classification logic both the CLI (check.mjs, which fetches for real)
// and the browser page (index.html, both the report viewer and the
// standalone hash generator) import. No network call and no I/O happens in
// this file -- that is what lets one implementation serve three different
// callers without three copies to keep in sync (the "168 became 169" lesson
// in CLAUDE.md: a restated rule goes stale; an imported one cannot).
//
// Why a hash generator and a page checker are the same product rather than
// two: the checker's own "missing-integrity" finding is the thing a
// developer has to fix, and fixing it means computing the exact
// integrity="sha384-..." value to paste into the tag. Sending them to a
// different free tool for that half would be the product failing its own
// user one step after telling them what's wrong.
//
// Uses only Web Crypto (`crypto.subtle`), which is a global in both a
// browser tab and Node 19+ -- no dependency, no Node-only `node:crypto`
// import, so this exact file runs unmodified in either runtime.

/** The three digest algorithms the SRI spec permits, strongest last (the one
 * a browser actually enforces when a tag lists more than one). */
export const ALGORITHMS = Object.freeze(['sha256', 'sha384', 'sha512']);

const SUBTLE_NAME = Object.freeze({ sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' });

/** Standard (not URL-safe) base64 of raw bytes, matching the SRI spec's own
 * encoding -- works whether `bytes` came from Node's fetch (a Buffer, which
 * is also a Uint8Array) or a browser's (a plain Uint8Array). Chunked so a
 * multi-megabyte bundle does not blow `String.fromCharCode`'s argument-count
 * limit in engines without `Buffer`. */
export function toBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  // eslint-disable-next-line no-undef -- browser global, absent (and unused) in Node
  return btoa(binary);
}

/** sha256/sha384/sha512 digest of `bytes`, base64-encoded. Throws a plain
 * Error (never a runtime-specific one) when Web Crypto is unavailable, which
 * only happens on an insecure (non-HTTPS, non-localhost) origin -- `index.html`
 * turns that into a one-line explanation rather than a stack trace. */
export async function digestBase64(algo, bytes) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      'Web Crypto (crypto.subtle) is not available in this runtime -- in a browser this ' +
        'usually means the page was opened over plain http:// rather than https:// or ' +
        'localhost, which is a requirement of the Web Crypto API itself, not this tool.',
    );
  }
  const name = SUBTLE_NAME[algo];
  if (!name) throw new Error(`Unsupported algorithm: ${algo} (expected one of ${ALGORITHMS.join(', ')})`);
  const digest = await subtle.digest(name, bytes);
  return toBase64(new Uint8Array(digest));
}

/** The exact string an `integrity="..."` attribute wants for one hash. */
export function integrityValue(algo, base64) {
  return `${algo}-${base64}`;
}

/**
 * Parse an `integrity` attribute's value into its component hashes.
 *
 * The attribute is a space-separated list (the browser tries each in turn
 * and enforces only the strongest algorithm present -- see
 * `strongestAlgorithm` below), and each token may itself carry
 * space-free base64 padding. Unrecognised algorithm prefixes are dropped
 * rather than erroring: a future SRI algorithm this tool does not yet know
 * should not read as "no integrity attribute at all".
 */
export function parseIntegrity(value) {
  if (typeof value !== 'string' || !value.trim()) return [];
  const tokens = value.trim().split(/\s+/);
  const parsed = [];
  for (const token of tokens) {
    const dash = token.indexOf('-');
    if (dash === -1) continue;
    const algo = token.slice(0, dash).toLowerCase();
    const digest = token.slice(dash + 1);
    if (!ALGORITHMS.includes(algo) || !digest) continue;
    parsed.push({ algo, digest, raw: token });
  }
  return parsed;
}

/** Which of several parsed hashes a browser actually verifies: the strongest
 * algorithm present (sha512 > sha384 > sha256), per the SRI spec's own
 * "strongest metadata" rule -- a page that lists a correct sha256 next to a
 * stale sha384 is still broken, because the stale one is the one enforced. */
export function strongestAlgorithm(parsedHashes) {
  for (const algo of [...ALGORITHMS].reverse()) {
    if (parsedHashes.some((h) => h.algo === algo)) return algo;
  }
  return null;
}

function attr(tagSource, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const m = tagSource.match(re);
  if (!m) return null;
  return m[1] ?? m[2] ?? '';
}

/** Does the tag carry this attribute at all (any value, or none, e.g. bare
 * `crossorigin`)? A simple word-boundary test, not a real HTML parse -- the
 * same tradeoff `attr()` above makes, and safe here because it is only ever
 * run on the tag substring already isolated by the caller's own tag regex,
 * never on the whole page (where it could false-match inside an unrelated
 * attribute's value). */
function hasAttr(tagSource, name) {
  return new RegExp(`[\\s"']${name}(?:\\s*=|[\\s>]|$)`, 'i').test(` ${tagSource}`);
}

/**
 * Every `<script src>` and `<link rel="stylesheet" href>` tag in `html`
 * whose resource lives on a different origin than `pageUrl` -- the
 * population Subresource Integrity actually protects. A same-origin script
 * is served by whoever already controls the page; there is no third party
 * whose compromise this attribute would catch, so same-origin tags are
 * deliberately excluded rather than padding the report with findings that
 * do not describe the risk this tool exists to name.
 *
 * Regex-based on purpose: a zero-dependency CLI (matching every sibling
 * checker in this portfolio's "ci" category) cannot carry a full HTML parser,
 * and tag-level regexes are the same tradeoff every sibling scanner in this
 * family already makes.
 */
export function extractCrossOriginAssets(html, pageUrl) {
  const pageOrigin = new URL(pageUrl).origin;
  const assets = [];

  const push = (kind, rawUrl, tag) => {
    let absolute;
    try {
      absolute = new URL(rawUrl, pageUrl).href;
    } catch {
      return; // an unparseable src/href (e.g. a data: URI) is not this tool's business
    }
    let parsed;
    try {
      parsed = new URL(absolute);
    } catch {
      return;
    }
    // A data:/blob: URI is inline content with no third-party host behind it
    // at all (its "origin" is the opaque string "null", which would
    // otherwise always compare as cross-origin) -- out of scope for a tool
    // about a CDN silently changing what it serves.
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
    if (parsed.origin === pageOrigin) return;
    const integrity = attr(tag, 'integrity');
    assets.push({
      kind,
      url: absolute,
      integrity: integrity && integrity.trim() ? integrity.trim() : null,
      crossoriginAttr: hasAttr(tag, 'crossorigin'),
    });
  };

  for (const m of html.matchAll(/<script\b[^>]*>/gi)) {
    const src = attr(m[0], 'src');
    if (src) push('script', src, m[0]);
  }
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (attr(m[0], 'rel') || '').toLowerCase().split(/\s+/);
    if (!rel.includes('stylesheet')) continue;
    const href = attr(m[0], 'href');
    if (href) push('link', href, m[0]);
  }
  return assets;
}

/**
 * Classify a set of already-fetched assets into findings.
 *
 * `fetchResults` maps an asset's absolute URL to `{ ok, hashes, error }`,
 * where `hashes` is `{ sha256, sha384, sha512 }` computed from the bytes
 * actually served just now -- the shape `probe.mjs`'s `fetchAndDigest`
 * produces and the shape a pasted CLI JSON report carries. An asset with no
 * `integrity` attribute needs no fetch to classify (the finding is the
 * missing attribute itself), so `fetchResults` may simply omit it.
 */
export function buildReport(pageUrl, assets, fetchResults = new Map()) {
  const findings = [];
  const reported = [];

  for (const asset of assets) {
    const entry = { kind: asset.kind, url: asset.url, integrity: asset.integrity, ok: true, status: 'ok' };

    if (!asset.integrity) {
      entry.ok = false;
      entry.status = 'missing-integrity';
      findings.push({
        id: 'missing-integrity',
        severity: 'danger',
        url: asset.url,
        title: `${asset.kind === 'script' ? 'Script' : 'Stylesheet'} loaded with no integrity attribute`,
        detail:
          `This ${asset.kind} tag loads ${asset.url}, a different origin than the page, with no ` +
          '`integrity` attribute. If that origin is ever compromised or silently changes the file, ' +
          "the browser has no way to detect it and will run or apply whatever it is served.",
      });
      reported.push(entry);
      continue;
    }

    const parsed = parseIntegrity(asset.integrity);
    if (parsed.length === 0) {
      entry.ok = false;
      entry.status = 'malformed-integrity';
      findings.push({
        id: 'malformed-integrity',
        severity: 'danger',
        url: asset.url,
        title: 'integrity attribute present but unparseable',
        detail:
          `The integrity attribute "${asset.integrity}" on ${asset.url} contains no token this tool ` +
          'recognises as sha256-/sha384-/sha512- plus a base64 digest, so a browser would also treat ' +
          'it as having no valid integrity metadata.',
      });
      reported.push(entry);
      continue;
    }

    if (!asset.crossoriginAttr) {
      entry.ok = false;
      entry.status = 'integrity-without-crossorigin';
      findings.push({
        id: 'integrity-without-crossorigin',
        severity: 'danger',
        url: asset.url,
        title: 'integrity attribute with no crossorigin attribute',
        detail:
          `${asset.url} carries an integrity attribute but no crossorigin attribute. Per the Fetch ` +
          'spec, a cross-origin script/link request has to opt into CORS mode for the browser to be ' +
          'able to check integrity at all -- without `crossorigin="anonymous"` (or "use-credentials"), ' +
          'most browsers silently skip the integrity check entirely rather than enforcing it, which is ' +
          'worse than no integrity attribute: the page looks protected and is not.',
      });
    }

    const fetched = fetchResults.get(asset.url);
    if (!fetched) {
      entry.status = 'not-verified';
      reported.push(entry);
      continue; // no fetch attempted for this asset -- report the tag findings above only
    }
    if (!fetched.ok) {
      entry.ok = false;
      entry.status = 'fetch-failed';
      findings.push({
        id: 'asset-fetch-failed',
        severity: 'notice',
        url: asset.url,
        title: 'Could not re-fetch this asset to verify the hash',
        detail: `Fetching ${asset.url} failed (${fetched.error ?? 'unknown error'}), so this tool ` +
          'cannot say whether the declared integrity hash still matches what is served. Not itself a ' +
          "finding about the page -- the asset's own host may be temporarily unreachable.",
      });
      reported.push(entry);
      continue;
    }

    const strong = strongestAlgorithm(parsed);
    const matches = parsed
      .filter((h) => h.algo === strong)
      .some((h) => fetched.hashes?.[strong] === h.digest);
    if (!matches) {
      entry.ok = false;
      entry.status = 'hash-mismatch';
      findings.push({
        id: 'integrity-hash-mismatch',
        severity: 'danger',
        url: asset.url,
        title: `Declared ${strong} hash does not match what this URL serves right now`,
        detail:
          `The page's integrity attribute declares ${strong}-${parsed.find((h) => h.algo === strong)?.digest}, ` +
          `but fetching ${asset.url} just now and hashing the response produced a different ${strong} ` +
          'digest. Either the file changed since this tag was written (a browser would now REFUSE to ' +
          'load it at all, breaking the page) or the hash was wrong from the start. Re-generate the ' +
          'hash from the current file before shipping.',
      });
    } else {
      entry.status = 'verified';
    }
    reported.push(entry);
  }

  const dangerCount = findings.filter((f) => f.severity === 'danger').length;
  const noticeCount = findings.filter((f) => f.severity === 'notice').length;
  return {
    page: pageUrl,
    assets: reported,
    findings,
    dangerCount,
    noticeCount,
    thirdPartyCount: assets.length,
    ok: dangerCount === 0,
  };
}
