/**
 * GTIN-13 (EAN-13) barcodes for a clothing line: one code per style x colour x
 * size, with the check digit worked out, a barcode drawn as SVG, and a CSV a
 * stockist or marketplace can load.
 *
 * Shops, wholesalers and marketplaces ask for a barcode on every variant. The
 * numbers must come from the brand's own GS1 company prefix (bought from GS1,
 * not from this tool): this only turns the prefix and a running item number
 * into valid 13-digit codes and draws them. It never invents a prefix.
 *
 * Rules (GS1 General Specifications, EAN-13): twelve data digits plus a check
 * digit; the check is (10 - (sum of digits at odd positions x1 + even x3) mod 10) mod 10
 * counting from the left over the first twelve. The first digit picks the
 * parity pattern of the six left-hand digits (L or G sets); the right six use R.
 * Quiet zones of at least 11 modules left and 7 right. Estimates and tooling,
 * not GS1 certification: scan a printed proof before ordering labels.
 */
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** Prefixes GS1 reserves; a code starting with them must not go on goods sold to other firms. */
export const RESTRICTED = Object.freeze([
  ["020", "029", "in-store use only (variable-measure and internal numbers)"],
  ["040", "049", "restricted distribution / internal use"],
  ["200", "299", "in-store use only"],
  ["977", "977", "serial publications (ISSN)"],
  ["978", "979", "books (ISBN)"],
  ["980", "980", "refund receipts"],
  ["981", "984", "coupons"],
  ["99", "99", "coupons"],
]);

export function checkDigit(first12) {
  if (!/^\d{12}$/.test(first12)) throw new Error("Need exactly 12 digits.");
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (s % 10)) % 10;
}

export function validate(code) {
  const c = String(code ?? "").replace(/[\s-]/g, "");
  if (!/^\d{13}$/.test(c)) return { ok: false, error: "A GTIN-13 has exactly 13 digits." };
  const want = checkDigit(c.slice(0, 12));
  return Number(c[12]) === want ? { ok: true, code: c } : { ok: false, error: `Check digit is ${c[12]}, should be ${want}.`, expected: c.slice(0, 12) + want };
}

export function restrictedReason(code) {
  for (const [a, b, why] of RESTRICTED) {
    const p = code.slice(0, a.length);
    if (p >= a && p <= b) return why;
  }
  return null;
}

/** 95 modules: start guard, 6 left digits, centre guard, 6 right digits, end guard (1 = bar). */
export function modules(code) {
  const v = validate(code);
  if (!v.ok) throw new Error(v.error);
  const c = v.code, par = PARITY[Number(c[0])];
  let m = "101";
  for (let i = 0; i < 6; i++) m += (par[i] === "L" ? L : G)[Number(c[i + 1])];
  m += "01010";
  for (let i = 0; i < 6; i++) m += R[Number(c[i + 7])];
  return m + "101";
}

/** SVG of one code at `module` px per module (>= 0.264 mm x 80% is the GS1 minimum size: scan a proof). */
export function barcodeSvg(code, { module = 2, height = 60 } = {}) {
  const m = modules(code), c = code.replace(/[\s-]/g, "");
  const q = 11, w = (95 + q + 7) * module, guardExtra = 6;
  let bars = "";
  for (let i = 0; i < 95;) {
    if (m[i] === "0") { i++; continue; }
    let j = i; while (j < 95 && m[j] === "1") j++;
    const guard = i < 3 || (i >= 45 && i < 50) || i >= 92;
    bars += `<rect x="${(q + i) * module}" y="0" width="${(j - i) * module}" height="${height + (guard ? guardExtra : 0)}"/>`;
    i = j;
  }
  const ty = height + guardExtra + 11, fs = 11;
  const text = `<text x="${(q - 4) * module}" y="${ty}" font-size="${fs}" font-family="monospace" text-anchor="end">${c[0]}</text>` +
    `<text x="${(q + 3) * module}" y="${ty}" font-size="${fs}" font-family="monospace" textLength="${42 * module}">${c.slice(1, 7)}</text>` +
    `<text x="${(q + 50) * module}" y="${ty}" font-size="${fs}" font-family="monospace" textLength="${42 * module}">${c.slice(7)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${ty + 3}" width="${w}" height="${ty + 3}" role="img" aria-label="EAN-13 barcode ${c}"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${bars}</g>${text}</svg>`;
}

const list = v => (Array.isArray(v) ? v : String(v ?? "").split(",")).map(s => String(s).trim()).filter(Boolean);
export const MAX_VARIANTS = 2000;

/**
 * @param {{prefix:string, start?:number, styles:{sku?:string,name:string,colours?:string|string[],sizes?:string|string[]}[], existing?:string}} o
 * `prefix` is the company prefix GS1 gave the brand (7 to 10 digits); the item
 * number fills the digits up to the 12th, starting at `start`.
 */
export function assignCodes(o) {
  const prefix = String(o?.prefix ?? "").replace(/\D/g, "");
  if (prefix.length < 7 || prefix.length > 10) return { ok: false, error: "Type the company prefix GS1 gave you: 7 to 10 digits." };
  const room = 12 - prefix.length;
  const start = Number.isInteger(Number(o?.start)) && Number(o.start) >= 0 ? Number(o.start) : 0;
  const warnings = [];
  const why = restrictedReason(prefix.padEnd(13, "0"));
  if (why) warnings.push(`Prefix ${prefix} starts in a range GS1 keeps for ${why}; codes from it are not valid for goods sold to shops.`);
  const used = new Set(list(String(o?.existing ?? "").replace(/\n/g, ",")).map(x => x.replace(/\s/g, "")));
  const rows = [];
  let n = start;
  for (const s of Array.isArray(o?.styles) ? o.styles : []) {
    const name = String(s?.name ?? "").trim();
    if (!name) continue;
    const colours = list(s.colours), sizes = list(s.sizes);
    for (const c of colours.length ? colours : [""]) for (const z of sizes.length ? sizes : [""]) {
      let code;
      do {
        if (String(n).length > room) return { ok: false, error: `A ${prefix.length}-digit prefix leaves room for ${10 ** room} item numbers; this line needs more. Use a shorter prefix or fewer variants.`, warnings };
        const first12 = prefix + String(n).padStart(room, "0");
        code = first12 + checkDigit(first12);
        n++;
      } while (used.has(code));
      used.add(code);
      rows.push({ sku: s.sku ? String(s.sku).trim() : "", style: name, colour: c, size: z, gtin: code });
      if (rows.length > MAX_VARIANTS) return { ok: false, error: `Up to ${MAX_VARIANTS} variants at a time.`, warnings };
    }
  }
  if (!rows.length) return { ok: false, error: "Add at least one named style." };
  const checks = rows.length;
  return { ok: true, prefix, rows, warnings, next: n, itemNumbersLeft: 10 ** room - n, checks };
}

export function csv(rows) {
  const q = v => { const t = String(v ?? "").replace(/^[=+\-@\t\r]/, "'$&"); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const out = [["GTIN", "SKU", "Style", "Colour", "Size"]];
  // a GTIN is digits only, so it is never a formula; keep it unquoted for importers
  for (const r of rows) out.push([r.gtin, r.sku, r.style, r.colour, r.size]);
  return out.map(r => r.map((v, i) => (i === 0 ? v : q(v))).join(",")).join("\n") + "\n";
}

/** Printable sheet of barcode labels (HTML, print to PDF). */
export function labelSheetHtml(rows, { brand = "" } = {}) {
  const e = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const cells = rows.map(r => `<div class="l"><b>${e(brand)}</b><div>${e(r.style)}</div><div>${e([r.colour, r.size].filter(Boolean).join(" / "))}</div>${barcodeSvg(r.gtin, { module: 1.6, height: 42 })}</div>`).join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Barcode labels</title><style>body{font:11px system-ui,sans-serif;margin:10mm}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(48mm,1fr));gap:3mm}.l{border:1px dashed #999;padding:2mm;break-inside:avoid}</style><body><div class="g">${cells}</div></body></html>`;
}
