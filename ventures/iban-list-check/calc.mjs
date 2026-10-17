// IBAN list checker. Pure functions, no I/O, no network.
// ISO 13616 check: move the first four characters to the end, map letters A=10..Z=35, the number mod 97 must be 1.
// The mod-97 check catches every single-character error and every adjacent transposition, which is what lets a
// transposed pair be suggested with proof rather than guessed.

// Country code -> total IBAN length, and the BBAN shape where it is simple enough to state with confidence.
export const COUNTRIES = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24,
  DE: 22, DK: 18, DO: 28, EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28,
  HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20,
  LV: 21, MC: 27, MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30, NL: 18, NO: 15, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29,
  RO: 24, RS: 22, SA: 24, SC: 31, SE: 24, SI: 19, SK: 24, SM: 27, ST: 25, SV: 28, TL: 23, TN: 24, TR: 26, UA: 29, VA: 22,
  VG: 24, XK: 20,
};
const BBAN_SHAPE = {
  DE: /^\d{18}$/, AT: /^\d{16}$/, BE: /^\d{12}$/, ES: /^\d{20}$/, DK: /^\d{14}$/, FI: /^\d{14}$/, NO: /^\d{11}$/,
  PL: /^\d{24}$/, PT: /^\d{21}$/, SE: /^\d{20}$/, CZ: /^\d{20}$/, SK: /^\d{20}$/, HR: /^\d{17}$/, SI: /^\d{15}$/,
  GB: /^[A-Z]{4}\d{14}$/, NL: /^[A-Z]{4}\d{10}$/, IE: /^[A-Z]{4}\d{14}$/, LU: /^\d{3}[A-Z0-9]{13}$/,
};
const HEADER_RE = /iban|international bank|bank ?account|account ?(no|number)|konto/i;
const STRONG_HEADER_RE = /iban/i;

export function mod97(iban) {
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of moved) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem;
}
export const checkOk = (iban) => /^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban) && mod97(iban) === 1;
export function computeCheckDigits(country, bban) {
  return String(98 - mod97(`${country}00${bban}`)).padStart(2, "0");
}
export const printFormat = (iban) => iban.replace(/(.{4})/g, "$1 ").trim();

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


// Classify one raw cell. Returns { kind, value?, notes? }.
export function classify(raw) {
  let s = String(raw ?? "").trim();
  if (s === "") return { kind: "empty" };
  const notes = [];
  if (/^'/.test(s)) { s = s.slice(1); notes.push("a leading apostrophe was removed"); }
  s = s.replace(/^="?|"$/g, "").trim();
  s = s.replace(/^IBAN[:\s]+/i, () => { notes.push('a leading "IBAN" label was removed'); return ""; });
  const stripped = s.replace(/[\s\-. ]/g, "");
  if (stripped !== s && /^[A-Za-z0-9]+$/.test(stripped)) { notes.push("spaces or separators were removed"); s = stripped; }
  if (!/^[A-Za-z0-9]+$/.test(s)) return { kind: "bad", why: "invalid characters", detail: `"${s.slice(0, 40)}" contains characters that cannot appear in an IBAN.` };
  if (/[a-z]/.test(s)) { notes.push("lower case changed to upper case"); s = s.toUpperCase(); }
  if (!/^[A-Z]{2}\d{2}/.test(s)) return { kind: "bad", why: "not an IBAN", detail: `"${s.slice(0, 40)}" does not start with a two-letter country code and two check digits; it may be a plain account number.` };
  const cc = s.slice(0, 2);
  const want = COUNTRIES[cc];
  if (!want) return { kind: "bad", why: "unknown country", detail: `${cc} is not a country in the IBAN list this tool knows.` };
  if (s.length !== want) {
    const diff = s.length - want;
    return { kind: "bad", why: "wrong length", cc, detail: `${s} has ${s.length} characters; an IBAN for ${cc} has ${want} (${diff > 0 ? diff + " too many" : -diff + " missing"}).` };
  }
  const shape = BBAN_SHAPE[cc];
  if (shape && !shape.test(s.slice(4))) return { kind: "bad", why: "wrong format", detail: `${s} has the right length for ${cc} but its account part has characters in positions a ${cc} IBAN does not allow.` };
  if (checkOk(s)) return { kind: "ok", value: s, fixed: notes.length > 0, notes };
  return { kind: "bad", why: "check digits", iban: s, swap: findTransposition(s) };
}
function findTransposition(s) {
  const hits = [];
  for (let i = 0; i < s.length - 1; i++) {
    if (s[i] === s[i + 1]) continue;
    const t = s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2);
    if (checkOk(t) && (!BBAN_SHAPE[t.slice(0, 2)] || BBAN_SHAPE[t.slice(0, 2)].test(t.slice(4)))) hits.push({ pos: i + 1, value: t });
  }
  return hits.length ? hits : null;
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
    const score = rows.slice(0, 200).filter((r) => looksLikeData(r.cells[c])).length;
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return { col: best, header: !looksLikeData(head[best]) };
}
const looksLikeData = (c) => /^[A-Za-z]{2}\d{2}[A-Za-z0-9 .\-]{8,}$/.test(String(c ?? "").trim().replace(/^'/, ""));

export function validate(text, options = {}) {
  const table = parseTable(String(text ?? ""));
  const { col, header } = pickColumn(table, options.column);
  const body = table.rows.slice(header ? 1 : 0);
  const findings = [];
  const seen = new Map();
  const items = [];
  const countries = new Map();
  let valid = 0, fixable = 0, errors = 0, warnings = 0, blanks = 0;
  const add = (severity, line, title, detail) => { findings.push({ severity, line, title, detail }); if (severity === "error") errors++; else if (severity === "warning") warnings++; };
  for (const r of body) {
    const raw = r.cells[col];
    const c = classify(raw);
    items.push({ line: r.line, raw: raw ?? "", result: c });
    if (c.kind === "empty") { blanks++; continue; }
    if (c.kind === "ok") {
      c.fixed ? fixable++ : valid++;
      if (c.fixed) add("info", r.line, `Fixable: ${c.notes.join("; ")}`, `"${String(raw).trim()}" becomes ${c.value}.`);
      countries.set(c.value.slice(0, 2), (countries.get(c.value.slice(0, 2)) || 0) + 1);
      if (seen.has(c.value)) add("warning", r.line, "Duplicate IBAN", `${c.value} already appears on line ${seen.get(c.value)}. A repeated account is a common sign of a double payment or a duplicated supplier record.`);
      else seen.set(c.value, r.line);
    } else if (c.why === "check digits") {
      const hint = c.swap
        ? c.swap.length === 1
          ? ` Swapping the characters at positions ${c.swap[0].pos} and ${c.swap[0].pos + 1} gives ${c.swap[0].value}, which is valid; confirm with the account holder before using it.`
          : ` ${c.swap.length} different adjacent swaps would validate (${c.swap.slice(0, 3).map((h) => h.value).join(", ")}${c.swap.length > 3 ? ", ..." : ""}), so the check digits alone cannot say which; confirm with the account holder.`
        : " A single mistyped character would also fail this check, so the right value cannot be worked out from the IBAN alone.";
      add("error", r.line, "IBAN check digits do not match", `${c.iban} has the right length for ${c.iban.slice(0, 2)} but fails the ISO 13616 mod-97 check.${hint}`);
    } else add("error", r.line, `Not a valid IBAN: ${c.why}`, c.detail);
  }
  if (blanks) add("warning", 0, `${blanks} blank IBAN${blanks === 1 ? "" : "s"}`, "Rows with an empty IBAN cell; a payment file will reject or skip them.");
  if (countries.size > 1) add("info", 0, "Several countries", [...countries.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ") + ". Some bulk payment formats (a domestic or SEPA-only file) will reject IBANs from outside their scheme.");
  const total = body.length - blanks;
  return {
    findings: findings.sort((a, b) => (a.severity === b.severity ? a.line - b.line : a.severity === "error" ? -1 : b.severity === "error" ? 1 : a.severity === "warning" ? -1 : 1)),
    items, column: col, hasHeader: header, delim: table.delim,
    summary: { rows: body.length, codes: total, valid, fixable, errors, warnings, blanks, unfixable: items.filter((i) => i.result.kind === "bad").length },
  };
}

// Rewrite the chosen column with normalised IBANs (electronic form, or groups of four). Unfixable rows are left exactly as they were.
export function repair(text, options = {}) {
  const table = parseTable(String(text ?? ""));
  const { col, header } = pickColumn(table, options.column);
  const changes = [];
  const fmt = (v) => (options.groups ? printFormat(v) : v);
  const outRows = table.rows.map((r, i) => {
    if (header && i === 0) return r.cells;
    const c = classify(r.cells[col]);
    const cells = r.cells.slice();
    if (c.kind === "ok" && cells[col] !== undefined) {
      const out = fmt(c.value);
      if (out !== String(cells[col]).trim()) {
        changes.push(`Line ${r.line}: ${String(cells[col]).trim()} to ${out}${c.notes.length ? " (" + c.notes.join("; ") + ")" : ""}`);
        cells[col] = out;
      }
    }
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

export const sampleFile = () => "supplier,iban,amount\nAcme GmbH,DE89 3704 0044 0532 0130 00,1200.00\nBrown Ltd,GB82 WEST 1234 5698 7654 32,830.50\nDupont SARL,FR1420041010050500013M02606,410.00\nVan Dijk BV,NL91ABNA0417164300,95.20\n";
export const sampleBrokenFile = () => "supplier,iban,amount\nAcme GmbH,DE89 3704 0044 0532 0130 00,1200.00\nBrown Ltd,gb82west12345698765432,830.50\nDupont SARL,FR1420041010050500013M02660,410.00\nVan Dijk BV,NL91 ABNA 0417 1643 0,95.20\nMeyer AG,DE89 3704 0044 0532 0130 00,300.00\nRossi Srl,XX00 1234 5678,77.00\nLopez SA,12345678901234567890,60.00\nKim Co,,10.00\nSmith Inc,DE89 3704 0044 0532 0031 00,45.00\n";
