// GTIN / UPC / EAN list checker. Pure functions, no I/O, no network.
// GS1 check digit: from the right (excluding the check digit) weights alternate 3,1,3,1...
// Zero-padding on the left never changes validity, which is what lets lost leading zeros be restored.

export const VALID_LENGTHS = [8, 12, 13, 14];
const HEADER_RE = /gtin|upc|ean|barcode|isbn|bar code|product ?id|item ?id|asin/i;
const STRONG_HEADER_RE = /gtin|upc|ean|barcode|isbn|bar code/i;

export function checkDigitOk(digits) {
  if (!/^\d+$/.test(digits) || digits.length < 2) return false;
  return computeCheck(digits.slice(0, -1)) === Number(digits.at(-1));
}
export function computeCheck(body) {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const d = Number(body[body.length - 1 - i]);
    sum += d * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}
export function isbn10Ok(s) {
  if (!/^\d{9}[\dXx]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (10 - i) * (s[i].toUpperCase() === "X" ? 10 : Number(s[i]));
  return sum % 11 === 0;
}
export function isbn10To13(s) {
  const body = "978" + s.slice(0, 9);
  return body + computeCheck(body);
}

export function decodeBuffer(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  return new TextDecoder("utf-8").decode(b).replace(/^﻿/, "");
}

export function parseTable(text) {
  const first = text.split(/\r?\n/).find((l) => l.trim()) || "";
  const delims = [",", "\t", ";", "|"];
  const delim = delims.map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][1] > 1
    ? delims.map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0] : ",";
  const rows = [];
  let row = [], cell = "", q = false, line = 1, rowLine = 1;
  const push = () => { row.push(cell); cell = ""; };
  const end = () => { push(); if (row.some((c) => c.trim() !== "")) rows.push({ cells: row, line: rowLine }); row = []; rowLine = line + 1; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else { if (c === "\n") line++; cell += c; }
    } else if (c === '"' && cell === "") q = true;
    else if (c === delim) push();
    else if (c === "\n") { end(); line++; rowLine = line; }
    else if (c !== "\r") cell += c;
  }
  if (cell !== "" || row.length) end();
  return { delim, rows };
}

// Classify one raw cell. Returns { kind, value?, note? } where value is the best GTIN digits.
export function classify(raw) {
  let s = String(raw ?? "").trim();
  if (s === "") return { kind: "empty" };
  let notes = [];
  if (/^'/.test(s)) { s = s.slice(1); notes.push("a leading apostrophe was removed"); }
  s = s.replace(/^="?|"$/g, "").trim();
  const sci = /^(\d+)(?:\.(\d+))?[eE]\+?(\d+)$/.exec(s);
  if (sci) {
    const digits = sci[1] + (sci[2] || "");
    const exp = Number(sci[3]);
    if (digits.length > exp + 1) return { kind: "bad", why: "scientific notation with a fractional part" };
    const full = digits.padEnd(exp + 1, "0");
    const lost = exp + 1 - digits.length;
    const test = tryDigits(full);
    if (lost > 0 && !test.ok) return { kind: "sci-lost", detail: `${s} is Excel scientific notation. About ${lost} trailing digit${lost === 1 ? "" : "s"} were rounded away when the file was saved, and the digits that remain do not form a valid code. The original codes must be re-exported from the source with the column formatted as text.` };
    if (test.ok) return { kind: "ok", value: test.value, fixed: true, notes: [...notes, `Excel scientific notation (${s}) expanded; the check digit confirms it`] };
    return { kind: "bad", why: "scientific notation" };
  }
  if (/^\d+\.0+$/.test(s)) { notes.push("a trailing .0 was removed"); s = s.replace(/\.0+$/, ""); }
  const cleaned = s.replace(/[\s-]/g, "");
  if (cleaned !== s && /^\d+$/.test(cleaned)) { notes.push("spaces or hyphens were removed"); s = cleaned; }
  if (!/^\d+$/.test(s)) {
    if (isbn10Ok(s.replace(/[\s-]/g, ""))) { const t = s.replace(/[\s-]/g, ""); return { kind: "ok", value: isbn10To13(t), fixed: true, notes: [...notes, "ISBN-10 converted to ISBN-13 (978 prefix)"] }; }
    return { kind: "bad", why: "non-digit characters", detail: `"${s.slice(0, 40)}" contains characters other than digits.` };
  }
  if (s.length === 10 && isbn10Ok(s)) return { kind: "ok", value: isbn10To13(s), fixed: true, notes: [...notes, "ISBN-10 converted to ISBN-13 (978 prefix)"] };
  const t = tryDigits(s);
  if (t.ok) return { kind: "ok", value: t.value, fixed: t.value !== s || notes.length > 0, notes: t.value !== s ? [...notes, `leading zero${t.value.length - s.length === 1 ? "" : "s"} restored (${s.length} to ${t.value.length} digits)`] : notes };
  if (s.length > 14) return { kind: "bad", why: "too long", detail: `${s.length} digits; a GTIN has 8, 12, 13 or 14.` };
  const swap = findTransposition(s);
  return { kind: "bad", why: s.length < 8 || [9, 10, 11].includes(s.length) ? "wrong length" : "check digit", digits: s, swap };
}
// Returns { ok, value }: s itself if valid at a legal length, or zero-padded to the shortest legal length that validates.
function tryDigits(s) {
  if (!/^\d+$/.test(s)) return { ok: false };
  for (const n of VALID_LENGTHS) {
    if (n < s.length) continue;
    const p = s.padStart(n, "0");
    if (checkDigitOk(p)) return { ok: true, value: p };
    if (n === s.length) break; // a code that is a legal length must be valid as written
  }
  return { ok: false };
}
function findTransposition(s) {
  if (!VALID_LENGTHS.includes(s.length)) return null;
  const hits = [];
  for (let i = 0; i < s.length - 1; i++) {
    if (s[i] === s[i + 1]) continue;
    const t = s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2);
    if (checkDigitOk(t)) hits.push({ pos: i + 1, value: t });
  }
  return hits.length ? hits : null;
}

const RESTRICTED = [
  [/^0[2]/, "02 (variable-weight / in-store use)"], [/^04/, "04 (in-store / company internal use)"], [/^05/, "05 (coupons)"],
  [/^2/, "2 (in-store / internal use)"], [/^98[1-5]/, "981-985 (coupons / refunds)"], [/^99/, "99 (coupons)"],
];
export function restrictedPrefix(gtin13) {
  for (const [re, name] of RESTRICTED) if (re.test(gtin13)) return name;
  return null;
}

export function pickColumn(table, columnOverride) {
  const rows = table.rows;
  if (!rows.length) return { col: 0, header: false };
  const head = rows[0].cells;
  if (columnOverride !== undefined && columnOverride !== "" && columnOverride !== null) {
    const n = Number(columnOverride) - 1;
    if (Number.isInteger(n) && n >= 0) return { col: n, header: !looksLikeData(head[n]) };
  }
  const strong = head.findIndex((c) => STRONG_HEADER_RE.test(c));
  if (strong >= 0) return { col: strong, header: true };
  const weak = head.findIndex((c) => HEADER_RE.test(c));
  if (weak >= 0) return { col: weak, header: true };
  const width = Math.max(...rows.map((r) => r.cells.length));
  let best = 0, bestScore = -1;
  for (let c = 0; c < width; c++) {
    const score = rows.slice(0, 200).filter((r) => /^[\d\s.\-eE+'="]{7,}$/.test((r.cells[c] || "").trim())).length;
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return { col: best, header: !looksLikeData(head[best]) };
}
const looksLikeData = (c) => /^[\d\s.\-eE+'="]{7,}$/.test(String(c ?? "").trim());

export function validate(text, options = {}) {
  const table = parseTable(String(text ?? ""));
  const { col, header } = pickColumn(table, options.column);
  const body = table.rows.slice(header ? 1 : 0);
  const findings = [];
  const seen = new Map();
  const items = [];
  const lengths = new Map();
  let valid = 0, fixable = 0, errors = 0, warnings = 0, blanks = 0;
  const add = (severity, line, title, detail) => { findings.push({ severity, line, title, detail }); if (severity === "error") errors++; else if (severity === "warning") warnings++; };
  for (const r of body) {
    const raw = r.cells[col];
    const c = classify(raw);
    const item = { line: r.line, raw: raw ?? "", result: c };
    items.push(item);
    if (c.kind === "empty") { blanks++; continue; }
    if (c.kind === "ok") {
      c.fixed ? fixable++ : valid++;
      if (c.fixed) add("info", r.line, `Fixable: ${c.notes.join("; ")}`, `"${String(raw).trim()}" becomes ${c.value}.`);
      lengths.set(c.value.length, (lengths.get(c.value.length) || 0) + 1);
      const g13 = c.value.padStart(13, "0");
      if (/^0+$/.test(c.value)) add("error", r.line, "All zeros", "A placeholder, not a barcode.");
      else if (/^(\d)\1+$/.test(c.value)) add("warning", r.line, "Repeated single digit", `${c.value} has a valid check digit but looks like a placeholder.`);
      const rp = restrictedPrefix(g13);
      if (rp) add("warning", r.line, `Restricted prefix ${rp}`, `${c.value} starts in a range GS1 reserves for in-store or internal use. Marketplaces and retailers usually reject these as product identifiers.`);
      if (g13.startsWith("977")) add("info", r.line, "ISSN prefix 977", "Periodical identifier; a book catalogue would use 978 or 979.");
      const key = c.value.padStart(14, "0");
      if (seen.has(key)) add("warning", r.line, "Duplicate code", `${c.value} already appears on line ${seen.get(key)}. Two different products sharing one code is a common cause of listing rejections.`);
      else seen.set(key, r.line);
    } else if (c.kind === "sci-lost") add("error", r.line, "Excel rounded this code", c.detail);
    else if (c.why === "check digit") {
      const hint = c.swap
        ? c.swap.length === 1
          ? ` Swapping the digits at positions ${c.swap[0].pos} and ${c.swap[0].pos + 1} gives ${c.swap[0].value}, which is valid; confirm against the product before using it.`
          : ` ${c.swap.length} different adjacent swaps would validate (${c.swap.slice(0, 4).map((h) => h.value).join(", ")}${c.swap.length > 4 ? ", ..." : ""}), so the check digit alone cannot say which; check the product or packaging.`
        : "";
      add("error", r.line, "Check digit does not match", `${c.digits} is ${c.digits.length} digits but its last digit is not the GS1 check digit for the rest.${hint}`);
    } else if (c.why === "wrong length") add("error", r.line, "Not a legal GTIN length", `${c.digits} has ${c.digits.length} digits; a GTIN has 8, 12, 13 or 14.`);
    else if (c.why === "too long") add("error", r.line, "Too many digits", c.detail);
    else add("error", r.line, `Not a barcode: ${c.why}`, c.detail || `"${String(raw).slice(0, 40)}"`);
  }
  if (blanks) add("warning", 0, `${blanks} blank code${blanks === 1 ? "" : "s"}`, "Rows with an empty barcode cell; some marketplaces need a GTIN or an explicit exemption.");
  if (lengths.size > 1) add("info", 0, "Mixed code lengths", [...lengths.entries()].sort((a, b) => a[0] - b[0]).map(([n, k]) => `${k} × ${n}-digit`).join(", ") + ". Mixing is legal; some importers want one length, and 12-digit UPC-A can be written as 13-digit EAN-13 with a leading 0.");
  const total = body.length - blanks;
  return {
    findings: findings.sort((a, b) => (a.severity === b.severity ? a.line - b.line : a.severity === "error" ? -1 : b.severity === "error" ? 1 : a.severity === "warning" ? -1 : 1)),
    items, column: col, hasHeader: header, delim: table.delim,
    summary: { rows: body.length, codes: total, valid, fixable, errors, warnings, blanks, unfixable: items.filter((i) => ["bad", "sci-lost"].includes(i.result.kind)).length },
  };
}

// Rewrite the chosen column with normalised codes. Rows that cannot be fixed are left exactly as they were.
export function repair(text, options = {}) {
  const table = parseTable(String(text ?? ""));
  const { col, header } = pickColumn(table, options.column);
  const changes = [];
  const outRows = table.rows.map((r, i) => {
    if (header && i === 0) return r.cells;
    const c = classify(r.cells[col]);
    const cells = r.cells.slice();
    if (c.kind === "ok" && c.fixed && cells[col] !== undefined) {
      changes.push(`Line ${r.line}: ${String(cells[col]).trim()} to ${c.value} (${c.notes.join("; ")})`);
      cells[col] = options.excelSafe ? `="${c.value}"` : c.value;
    } else if (c.kind === "ok" && options.excelSafe) cells[col] = `="${c.value}"`;
    return cells;
  });
  const d = table.delim;
  const q = (v) => (/["\n\r]/.test(v) || v.includes(d) ? `"${v.replace(/"/g, '""')}"` : v);
  return { text: outRows.map((c) => c.map((v) => q(String(v ?? ""))).join(d)).join("\n") + "\n", changes };
}

export function findingsCsv(result) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return ["severity,line,title,detail", ...result.findings.map((f) => [f.severity, f.line || "", f.title, f.detail].map(q).join(","))].join("\n") + "\n";
}

export const sampleFile = () => "sku,title,gtin\nA-100,Steel water bottle,012345678905\nA-101,Bamboo toothbrush 4-pack,4006381333931\nA-102,Cotton tote,036000291452\nA-103,Notebook A5,9780306406157\n";
export const sampleBrokenFile = () => "sku,title,upc\nB-1,Steel water bottle,12345678905\nB-2,Bamboo toothbrush,4006381333932\nB-3,Cotton tote,3.60003E+11\nB-4,Notebook,0306406152\nB-5,Mug,036000291452\nB-6,Mug (blue),036000291452\nB-7,Candle,2000000000008\nB-8,Poster,ABC123\nB-9,Sticker pack,4006381333913\nB-10,Gift card,\n";
