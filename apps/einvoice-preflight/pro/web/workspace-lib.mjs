// @ts-check
// Pure helpers for the accountant workspace page (pro/web/app.js). FSL-1.1-MIT (see ../../LICENSE, part 2).
// Runs in the browser as an ES module and in Node for tests: no DOM, no Node built-ins.

/** The API's limits (server.mjs): 50 documents a batch, 1 MiB a file, 30 MiB a request body. */
export const MAX_BATCH = 50;
export const MAX_FILE = 1_048_576;
/** Base64 grows bytes by 4/3; keep each request well under the 30 MiB body cap. */
export const MAX_BATCH_BASE64 = 20 * 1024 * 1024;

const NON_BLOCKING = new Set(["note", "warning", "information"]);
/** Same rule as report.mjs `isBlocking`. @param {{ severity?: string }} f */
export const isBlocking = (f) => !NON_BLOCKING.has(f.severity ?? "");

/** @param {Uint8Array} bytes */
export function toBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** @param {number} n */
export const base64Length = (n) => 4 * Math.ceil(n / 3);

/**
 * Split picked files into batches the API accepts. Files over the size cap are refused here, with
 * the reason, instead of failing the whole request.
 * @template {{ name: string, size: number }} F
 * @param {F[]} files
 * @returns {{ batches: F[][], refused: Array<{ file: F, reason: "too_large" | "empty" }> }}
 */
export function planBatches(files) {
  /** @type {F[][]} */
  const batches = [];
  /** @type {Array<{ file: F, reason: "too_large" | "empty" }>} */
  const refused = [];
  /** @type {F[]} */
  let current = [];
  let size = 0;
  for (const f of files) {
    if (f.size === 0) {
      refused.push({ file: f, reason: "empty" });
      continue;
    }
    if (f.size > MAX_FILE) {
      refused.push({ file: f, reason: "too_large" });
      continue;
    }
    const b = base64Length(f.size);
    if (current.length && (current.length >= MAX_BATCH || size + b > MAX_BATCH_BASE64)) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(f);
    size += b;
  }
  if (current.length) batches.push(current);
  return { batches, refused };
}

/** "rechnung.xml" -> "rechnung.fixed.xml"; a name with no extension gets ".fixed.xml". @param {string} name */
export function fixedName(name) {
  const base = name.split(/[\\/]/).pop() || "invoice.xml";
  const m = /^(.*?)(\.[A-Za-z0-9]{1,5})$/.exec(base);
  return m && m[1] ? `${m[1]}.fixed${m[2]}` : `${base}.fixed.xml`;
}

/** @param {string} name */
export const diffName = (name) => `${fixedName(name).replace(/\.fixed\.[^.]+$/, "")}.diff`;

/**
 * The rows the page shows for one checked invoice: blocking findings first, then warnings, each
 * with its plain-language explanation if there is one.
 * @param {any} result one element of the batch response's `results`
 */
export function summarizeResult(result) {
  const findings = Array.isArray(result?.findings) ? result.findings : [];
  const rows = findings
    .map((/** @type {any} */ f) => ({
      rule: String(f.rule ?? ""),
      blocking: isBlocking(f),
      severity: f.severity ? String(f.severity) : "error",
      message: String(f.message ?? ""),
      title: f.explanation?.title ? String(f.explanation.title) : "",
      action: f.explanation?.action ? String(f.explanation.action) : f.fix ? String(f.fix) : "",
      source: f.explanation?.source ? String(f.explanation.source) : "checker",
      notice: f.explanation?.notice ? String(f.explanation.notice) : "",
    }))
    .sort((/** @type {any} */ a, /** @type {any} */ b) => Number(b.blocking) - Number(a.blocking));
  const fixes = result?.fixes ?? null;
  const applied = Array.isArray(fixes?.applied) ? fixes.applied : [];
  return {
    file: String(result?.file ?? ""),
    status: result?.status === "pass" ? "pass" : "fail",
    blocking: rows.filter((/** @type {any} */ r) => r.blocking).length,
    warnings: rows.filter((/** @type {any} */ r) => !r.blocking).length,
    rows,
    fixes: applied.map((/** @type {any} */ a) => ({ id: String(a.id), resolves: Array.isArray(a.resolves) ? a.resolves.map(String) : [] })),
    skipped: Array.isArray(fixes?.skipped) ? fixes.skipped.map((/** @type {any} */ s) => ({ id: String(s.id), reason: String(s.reason ?? "") })) : [],
    fixedContent: applied.length && typeof fixes.content === "string" ? fixes.content : null,
    diff: applied.length && typeof fixes.diff === "string" ? fixes.diff : null,
    fixedStatus: applied.length ? (fixes.revalidation?.status === "pass" ? "pass" : "fail") : null,
  };
}

/** Euro cents as "€19" / "19 €" by language. @param {number} cents @param {string} lang */
export function formatEuro(cents, lang) {
  const v = cents / 100;
  const s = Number.isInteger(v) ? String(v) : v.toFixed(2);
  return lang === "en" ? `€${s}` : `${s.replace(".", ",")} €`;
}

/** @param {number} used @param {number} limit */
export const usageShare = (used, limit) => (limit > 0 ? Math.min(1, Math.max(0, used / limit)) : 0);

/**
 * The keys panel's rows: newest first, each marked when it is the key this browser signed in with
 * (the server lists only a key's first 12 characters, `prefix`, never the key). Revoking the current
 * key signs this browser out, so the page asks before it does.
 * @param {any[]} keys items of GET /v1/keys @param {string | null} currentKey
 */
export function keyRows(keys, currentKey) {
  const list = Array.isArray(keys) ? keys : [];
  return list
    .filter((k) => k && typeof k.id === "string" && !k.revokedAt)
    .map((k) => {
      const prefix = String(k.prefix ?? "");
      return {
        id: k.id,
        name: String(k.name ?? ""),
        prefix,
        createdAt: k.createdAt ? String(k.createdAt) : null,
        lastUsedAt: k.lastUsedAt ? String(k.lastUsedAt) : null,
        current: Boolean(currentKey && prefix.length >= 8 && currentKey.startsWith(prefix)),
      };
    })
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
}

/** "2 of 3 keys" data: whether another key may be created on this plan. @param {number} active @param {number | undefined} limit */
export const canCreateKey = (active, limit) => typeof limit === "number" && limit > 0 && active < limit;
