// @ts-check
// Pure helpers for the accountant workspace page (pro/web/app.js). Proprietary (see ../../LICENSE, part 2).
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

/** Euro cents as "€19" / "€ 19,50" (Dutch) / "19 €" by language. @param {number} cents @param {string} lang */
export function formatEuro(cents, lang) {
  const v = cents / 100;
  const s = Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (lang === "en") return `€${s}`;
  return lang === "nl" ? `€ ${s.replace(".", ",")}` : `${s.replace(".", ",")} €`;
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

// ---------- PDF to e-invoice (the convert screen; server: POST /v1/convert, /v1/convert/build) ----------

/** A plain PDF for the converter may be larger than an XML invoice (server.mjs MAX_PDF). */
export const MAX_PDF = 5 * 1_048_576;

/**
 * The draft's single values the convert screen shows, in order, grouped. `kind` picks the input:
 * a date, a 2-letter country, or text. `endpoint` is an e-invoice address (BT-34 / BT-49),
 * typed as an e-mail or a Peppol ID `scheme:id`.
 */
export const CONVERT_GROUPS = /** @type {const} */ ([
  ["invoice", [
    ["number", "text"], ["issue_date", "date"], ["due_date", "date"], ["delivery_date", "date"],
    ["buyer_reference", "text"], ["order_reference", "text"], ["currency", "text"],
  ]],
  ["seller", [
    ["seller.name", "text"], ["seller.street", "text"], ["seller.postal_code", "text"], ["seller.city", "text"],
    ["seller.country", "country"], ["seller.vat_id", "text"], ["seller.tax_number", "text"],
    ["seller.contact.name", "text"], ["seller.contact.email", "text"], ["seller.contact.phone", "text"],
    ["seller.endpoint", "endpoint"],
  ]],
  ["buyer", [
    ["buyer.name", "text"], ["buyer.street", "text"], ["buyer.postal_code", "text"], ["buyer.city", "text"],
    ["buyer.country", "country"], ["buyer.vat_id", "text"], ["buyer.endpoint", "endpoint"],
  ]],
  ["payment", [["payment.iban", "text"], ["payment.bic", "text"], ["terms", "text"]]],
]);

/** The editable columns of a line, in order. */
export const LINE_COLUMNS = /** @type {const} */ (["description", "quantity", "unit", "unit_price", "tax_percent"]);

/** @param {any} obj @param {string} path */
export function getPath(obj, path) {
  let o = obj;
  for (const k of path.split(".")) {
    if (o === null || typeof o !== "object") return undefined;
    o = o[k];
  }
  return o;
}

/**
 * A copy of `obj` with `path` set; `undefined` or "" removes the key. Never writes through
 * `__proto__`, `constructor` or `prototype`.
 * @param {any} obj @param {string} path @param {unknown} value
 */
export function setPath(obj, path, value) {
  const keys = path.split(".");
  if (keys.some((k) => k === "__proto__" || k === "constructor" || k === "prototype" || !k)) throw new Error(`bad path: ${path}`);
  const root = structuredClone(obj ?? {});
  let o = root;
  for (const k of keys.slice(0, -1)) {
    if (o[k] === null || typeof o[k] !== "object") o[k] = {};
    o = o[k];
  }
  const last = /** @type {string} */ (keys.at(-1));
  if (value === undefined || value === "") delete o[last];
  else o[last] = value;
  return root;
}

/** An e-invoice address as shown: "EM: ap@them.example" reads back as the e-mail. @param {unknown} ep */
export function endpointText(ep) {
  if (!ep || typeof ep !== "object") return "";
  const e = /** @type {{ scheme?: string, id?: string }} */ (ep);
  if (!e.id) return "";
  return e.scheme === "EM" ? e.id : `${e.scheme ?? ""}:${e.id}`;
}

/**
 * Typed text to an e-invoice address: an e-mail (scheme EM) or a Peppol participant ID as
 * `scheme:id` with a 4-digit ICD scheme (`0204:991-01234-56`, `9930:DE136695976`). Anything else
 * is refused (null) rather than guessed. Empty text is `undefined`: no address.
 * @param {string} raw @returns {{ scheme: string, id: string } | null | undefined}
 */
export function parseEndpoint(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return undefined;
  if (/^[^\s@:]+@[^\s@]+\.[^\s@]+$/.test(s)) return { scheme: "EM", id: s };
  const m = /^(\d{4}):(\S{1,100})$/.exec(s);
  if (m) return { scheme: m[1], id: m[2] };
  return null;
}

/**
 * The rows of the convert screen for one POST /v1/convert answer: each value with the page and
 * line it was read from, whether the reader marked it to confirm, and whether the checker needs it.
 * @param {any} conv the API answer
 */
export function convertRows(conv) {
  /** @type {Map<string, any>} */
  const byPath = new Map((conv?.fields ?? []).map((/** @type {any} */ f) => [f.path, f]));
  const missing = new Set([...(conv?.missing ?? [])].map((/** @type {any} */ m) => m.path));
  return CONVERT_GROUPS.map(([group, items]) => ({
    group,
    rows: items.map(([path, kind]) => {
      const f = byPath.get(path);
      const v = getPath(conv?.draft, path);
      return {
        path,
        kind,
        value: kind === "endpoint" ? endpointText(v) : v === undefined || v === null ? "" : String(v),
        source: f ? { page: f.page, line: f.line } : null,
        check: Boolean(f?.check),
        note: f?.note ?? null,
        // Still needed while it is empty: filling it in clears the mark.
        missing: missing.has(path) && (v === undefined || v === null || v === "" || (kind === "endpoint" && !endpointText(v))),
      };
    }),
  }));
}

/**
 * What still stands between the confirmed draft and a download: fields the reader marked that the
 * person has neither ticked nor edited, and the PDF's printed totals that the built e-invoice does
 * not match. Pure, so the page and the tests agree.
 * @param {{ toConfirm?: string[], printedTotals?: { net: number | null, vat: number | null, gross: number | null } }} conv
 * @param {Set<string>} confirmed paths ticked or edited
 * @param {{ net: number, tax: number, gross: number, taxable?: number } | null} [built] the built file's totals
 * @returns {{ unconfirmed: string[], mismatches: Array<{ id: "net" | "vat" | "gross", pdf: number, einvoice: number }> }}
 */
export function convertBlockers(conv, confirmed, built = null) {
  const unconfirmed = (conv.toConfirm ?? []).filter((p) => !confirmed.has(p));
  /** @type {Array<{ id: "net" | "vat" | "gross", pdf: number, einvoice: number }>} */
  const mismatches = [];
  const pt = conv.printedTotals;
  if (built && pt) {
    const c = (/** @type {number} */ n) => Math.round(n * 100);
    // The PDF's net total is the amount VAT is charged on: after its discounts and charges, which
    // is the e-invoice's taxable amount (BT-109; the rows' total BT-106 when there are none).
    const net = built.taxable ?? built.net;
    if (pt.net !== null && c(pt.net) !== c(net)) mismatches.push({ id: "net", pdf: pt.net, einvoice: net });
    if (pt.vat !== null && c(pt.vat) !== c(built.tax)) mismatches.push({ id: "vat", pdf: pt.vat, einvoice: built.tax });
    if (pt.gross !== null && c(pt.gross) !== c(built.gross)) mismatches.push({ id: "gross", pdf: pt.gross, einvoice: built.gross });
  }
  return { unconfirmed, mismatches };
}

/**
 * A line's typed cell to the draft's value: numbers accept a decimal comma ("12,5"); a number
 * column left blank or unreadable is `undefined` so the creator reports it, never 0.
 * @param {(typeof LINE_COLUMNS)[number]} col @param {string} raw
 */
export function lineValue(col, raw) {
  const s = String(raw ?? "").trim();
  if (col === "description" || col === "unit") return s || undefined;
  if (!s) return undefined;
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return /^-?\d+(?:[.,]\d+)?$/.test(s.replace(/\s/g, "")) && Number.isFinite(n) ? n : undefined;
}

/** Base64 to bytes, for the built file's download. @param {string} b64 */
export function fromBase64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/**
 * After line `i` is removed: its own path (`lines.i`, `lines.i.description`) goes, later lines
 * move up by one, everything else is kept. `list` is the draft's list: `lines`, `allowances` or
 * `charges`.
 * @param {string[]} paths @param {number} i @param {"lines" | "allowances" | "charges"} [list]
 */
export function shiftLinePaths(paths, i, list = "lines") {
  /** @type {string[]} */
  const out = [];
  for (const p of paths) {
    const m = new RegExp(`^${list}\\.(\\d+)(\\..*)?$`).exec(p);
    if (!m) out.push(p);
    else if (Number(m[1]) > i) out.push(`${list}.${Number(m[1]) - 1}${m[2] ?? ""}`);
    else if (Number(m[1]) < i) out.push(p);
  }
  return out;
}

/** The reader's fields after line `i` is removed (see shiftLinePaths). @param {any[]} fields @param {number} i @param {"lines" | "allowances" | "charges"} [list] */
export function shiftLineFields(fields, i, list = "lines") {
  return fields.flatMap((f) => {
    const [p] = shiftLinePaths([f.path], i, list);
    return p === undefined ? [] : [{ ...f, path: p }];
  });
}

// ---------- A row's discount on the convert screen (a line allowance, EN 16931 BG-27) ----------

/** The number in a typed cell, with a decimal comma allowed, or null. @param {string} s */
const typedNumber = (s) => {
  const t = s.replace(/\s/g, "");
  return /^\d+(?:[.,]\d+)?$/.test(t) ? Number(t.replace(",", ".")) : null;
};

/**
 * The text a row's discount cell shows: "10 %" for a percent, "5.5" for an amount, "" for none.
 * `editable` is false when the line has more than one allowance or any charge (a hand-made draft,
 * or a charge printed under the row), so the cell does not silently drop the others.
 * @param {any} line @returns {{ text: string, editable: boolean }}
 */
export function discountText(line) {
  const list = Array.isArray(line?.allowances) ? line.allowances : [];
  // A charge on the row (BG-28, e.g. "zzgl. Eilzuschlag" printed under it) is shown after the
  // discount with a "+", and the cell is then read-only so neither is dropped by an edit.
  const charges = Array.isArray(line?.charges) ? line.charges.filter((c) => c && typeof c === "object") : [];
  if (charges.length) {
    const parts = [discountText({ allowances: list }).text, ...charges.map((c) => `+${discountText({ allowances: [c] }).text}`)].filter((t) => t && t !== "+");
    return { text: parts.join(" "), editable: false };
  }
  if (list.length > 1) return { text: list.map((a) => discountText({ allowances: [a] }).text).join(" + "), editable: false };
  const a = list[0];
  if (!a || typeof a !== "object") return { text: "", editable: true };
  if (a.percent !== undefined && a.percent !== null && a.percent !== "") return { text: `${String(a.percent)} %`, editable: true };
  if (a.amount !== undefined && a.amount !== null && a.amount !== "") return { text: String(a.amount), editable: true };
  return { text: "", editable: true };
}

/**
 * A typed discount cell read: "" is no discount (null); "10 %" or "10%" a percent of quantity x
 * price, above 0 and at most 100; "5,00" or "5.00" an amount above 0. Anything else is
 * `undefined`: unreadable, never guessed.
 * @param {string} raw @returns {{ percent: number } | { amount: number } | null | undefined}
 */
export function parseDiscount(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const pct = /^(.*?)\s*%$/.exec(s);
  if (pct) {
    const n = typedNumber(pct[1]);
    return n !== null && n > 0 && n <= 100 ? { percent: n } : undefined;
  }
  const n = typedNumber(s);
  return n !== null && n > 0 ? { amount: n } : undefined;
}

/**
 * The line's `allowances` after its discount cell is set: the first allowance is replaced and
 * keeps its reason (or takes `reason`, the screen's word for a discount, when it had none);
 * `null` removes it, and `undefined` (the list empty) when nothing is left. Only for lines
 * `discountText` calls editable.
 * @param {any} line @param {{ percent: number } | { amount: number } | null} discount @param {string} reason
 */
export function withDiscount(line, discount, reason) {
  const list = Array.isArray(line?.allowances) ? line.allowances : [];
  const rest = list.slice(1);
  if (discount === null) return rest.length ? rest : undefined;
  const kept = typeof list[0]?.reason === "string" && list[0].reason.trim() ? list[0].reason : reason;
  return [{ reason: kept, ...discount }, ...rest];
}
