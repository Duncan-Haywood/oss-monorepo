import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pdfToText } from "./pdftext.mjs";
import { readStatement, checkRunningBalance } from "./bank.mjs";

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url));
const squash = (s) => s.split("\n").map((l) => l.trim().replace(/\s+/g, " ")).filter(Boolean).join("\n");

// The fixtures were printed to PDF by headless Chromium (Skia: Flate streams,
// subset fonts with ToUnicode maps, a flipped coordinate system), the sort of
// generator many bank portals use. Not a real bank's file.
test("a Chromium-printed statement reads the same as poppler's pdftotext", async (t) => {
  for (const n of ["pasted-checking.pdf", "statement-table.pdf"]) {
    const mine = squash(await pdfToText(fx(n)));
    const r = spawnSync("pdftotext", ["-layout", new URL(`./fixtures/${n}`, import.meta.url).pathname, "-"], { encoding: "utf8" });
    if (r.error) { t.diagnostic("pdftotext not installed: comparison skipped"); assert.ok(mine.length > 50); continue; }
    assert.equal(mine.replace(/\f/g, ""), squash(r.stdout).replace(/\f/g, ""), n);
  }
});


test("a table statement with a running balance imports and reconciles", async () => {
  const text = await pdfToText(fx("statement-table.pdf"));
  const r = readStatement(text);
  assert.deepEqual(r.rows.map((x) => x.cents), [240000, -8640, 115025, -5999, -50000, -1250, -120000]);
  const c = checkRunningBalance(r.rows);
  assert.ok(c.checked);
  assert.equal(c.breaks.length, 0);
});

test("a text statement PDF reads as the pasted fixture does", async () => {
  const r = readStatement(await pdfToText(fx("pasted-checking.pdf")));
  assert.deepEqual(r.rows.map((x) => x.cents), [240000, 115025, -8640, -5999, -50000, -1250]);
});

test("things that are not readable PDFs fail plainly", async () => {
  await assert.rejects(() => pdfToText(new TextEncoder().encode("hello")), /not a PDF/);
  assert.equal(await pdfToText(new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF")), "");
  await assert.rejects(() => pdfToText(new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R /Encrypt 2 0 R >>\n%%EOF")), /password/);
});

// Made by Chromium's print-to-PDF from an HTML table (Flate streams, Type0 fonts,
// one glyph per Td under a flipped CTM): the shape most "print to PDF" statements have.
test("a statement PDF printed by Chromium reads to the table's rows", async () => {
  const text = await pdfToText(readFileSync(new URL("./fixtures/statement-chromium.pdf", import.meta.url)));
  assert.match(text, /^2026-09-03 +Client payment ACME +1,200\.00$/m);
  assert.match(text, /^2026-09-12 +Adobe Creative Cloud +54\.99$/m);
  assert.ok(text.indexOf("Deposits") < text.indexOf("Withdrawals"));
});

// Printed by LibreOffice 24.2 (Writer/Web export of an HTML table). A second generator beside Chromium; still not a real bank's file.
test("a LibreOffice-printed statement reads like poppler, and says what is missing without a year", async (t) => {
  const bytes = fx("statement-libreoffice.pdf");
  const text = await pdfToText(bytes);
  const r = spawnSync("pdftotext", ["-layout", new URL("./fixtures/statement-libreoffice.pdf", import.meta.url).pathname, "-"], { encoding: "utf8" });
  if (!r.error) assert.equal(squash(text).replace(/\f/g, ""), squash(r.stdout).replace(/\f/g, ""));
  assert.equal(readStatement(text).rows.length, 5);          // the header names March 2026
  const bare = readStatement(text.replace("March 2026", "March"));
  assert.equal(bare.rows.length, 0);
  assert.match(bare.problems[0], /no year/);
  const ok = readStatement(text.replace('March 2026', 'March'), { year: 2026 });
  assert.deepEqual(ok.rows.map((x) => x.cents), [-575, 240000, -85000, -4219, 31]);
  assert.equal(ok.rows[0].date, "2026-03-02");
  assert.ok(checkRunningBalance(ok.rows).checked);
  assert.equal(checkRunningBalance(ok.rows).breaks.length, 0);
});

// ---- older generators' stream filters -------------------------------------------
// Hand-built one-page PDFs whose content stream goes through each filter chain,
// checked against poppler's pdftotext where it is installed. The encoders below
// are test-side only.
const CONTENT = "BT /F1 12 Tf 72 700 Td (2026-03-02 Coffee Shop -5.75) Tj 0 -20 Td (2026-03-05 Client payment 2,400.00) Tj ET";

function a85(b) {
  let o = "";
  for (let i = 0; i < b.length; i += 4) {
    const n = Math.min(4, b.length - i);
    let v = 0; for (let k = 0; k < 4; k++) v = v * 256 + (i + k < b.length ? b[i + k] : 0);
    if (n === 4 && v === 0) { o += "z"; continue; }
    const d = []; for (let k = 0; k < 5; k++) { d.unshift(v % 85); v = Math.floor(v / 85); }
    o += d.slice(0, n + 1).map((x) => String.fromCharCode(x + 33)).join("");
  }
  return Buffer.from(o + "~>");
}
function lzwEncode(b, early = 1) {
  const out = []; let acc = 0, bits = 0, width = 9;
  const put = (c) => { acc = (acc << width) | c; bits += width; while (bits >= 8) { out.push((acc >>> (bits - 8)) & 255); bits -= 8; } acc &= (1 << bits) - 1; };
  let dict, next;
  const reset = () => { dict = new Map(); next = 258; width = 9; };
  reset(); put(256);
  let w = "";
  for (const byte of b) {
    const k = w + String.fromCharCode(byte);
    if (k.length === 1 || dict.has(k)) { w = k; continue; }
    put(w.length === 1 ? w.charCodeAt(0) : dict.get(w));
    dict.set(k, next++);
    if (next + early > 2048) width = 12; else if (next + early > 1024) width = 11; else if (next + early > 512) width = 10;
    if (next >= 4094) { put(256); reset(); }
    w = String.fromCharCode(byte);
  }
  if (w) put(w.length === 1 ? w.charCodeAt(0) : dict.get(w));
  put(257);
  if (bits) out.push((acc << (8 - bits)) & 255);
  return Buffer.from(out);
}
function pngUp(b, cols) {
  const rows = []; let prev = Buffer.alloc(cols);
  for (let r = 0; r < b.length; r += cols) {
    const row = Buffer.alloc(cols); b.copy(row, 0, r, Math.min(r + cols, b.length));
    rows.push(Buffer.concat([Buffer.from([2]), Buffer.from(row.map((x, k) => (x - prev[k]) & 255))]));
    prev = row;
  }
  return Buffer.concat(rows);
}
function pdfWith(filter, data, parms = "") {
  const parts = [Buffer.from("%PDF-1.4\n")];
  const add = (s) => parts.push(Buffer.isBuffer(s) ? s : Buffer.from(s, "latin1"));
  add("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  add("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n");
  add(`4 0 obj\n<< /Length ${data.length} /Filter ${filter}${parms} >>\nstream\n`); add(data); add("\nendstream\nendobj\n");
  add("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");
  return Buffer.concat(parts);
}
const content = Buffer.from(CONTENT);
const lines = (t) => squash(t).replace(/\f/g, "");
const WANT = "2026-03-02 Coffee Shop -5.75\n2026-03-05 Client payment 2,400.00";

test("ASCII85, ASCIIHex, RunLength, LZW and predictor streams read like plain text", async (t) => {
  const { deflateSync } = await import("node:zlib");
  const cases = {
    ascii85: pdfWith("/ASCII85Decode", a85(content)),
    asciihex: pdfWith("/ASCIIHexDecode", Buffer.from([...content].map((c) => c.toString(16).padStart(2, "0")).join("") + ">")),
    runlength: pdfWith("/RunLengthDecode", Buffer.concat([Buffer.from([content.length - 1]), content, Buffer.from([128])])),
    lzw: pdfWith("/LZWDecode", lzwEncode(content)),
    "ascii85 over flate": pdfWith("[/ASCII85Decode /FlateDecode]", a85(deflateSync(content))),
    "flate with PNG up predictor": pdfWith("/FlateDecode", deflateSync(pngUp(content, 16)), " /DecodeParms << /Predictor 12 /Columns 16 >>"),
    "lzw with predictor": pdfWith("/LZWDecode", lzwEncode(pngUp(content, 16)), " /DecodeParms << /Predictor 15 /Columns 16 >>"),
  };
  for (const [name, pdf] of Object.entries(cases)) {
    assert.equal(lines(await pdfToText(pdf)), WANT, name);
    const dir = mkdtempSync(join(tmpdir(), "pdft-"));
    writeFileSync(join(dir, "a.pdf"), pdf);
    const r = spawnSync("pdftotext", ["-layout", join(dir, "a.pdf"), "-"], { encoding: "utf8" });
    if (!r.error && name !== "lzw with predictor") assert.equal(lines(r.stdout), WANT, `poppler: ${name}`);
    rmSync(dir, { recursive: true });
  }
});

test("LZW codes past 512 and 1024 entries decode (width changes), with early change 0 too", async () => {
  const big = Buffer.from(Array.from({ length: 6000 }, (_, i) => 32 + ((i * 7 + (i >> 3)) % 90)));
  for (const early of [1, 0]) {
    const pdf = pdfWith("/LZWDecode", lzwEncode(Buffer.concat([Buffer.from("BT /F1 12 Tf 72 700 Td ("), Buffer.from(big.toString("latin1").replace(/[()\\]/g, "x")), Buffer.from(") Tj ET")]), early), early ? "" : " /DecodeParms << /EarlyChange 0 >>");
    const text = (await pdfToText(pdf)).replace(/\s/g, "");
    assert.equal(text, big.toString("latin1").replace(/[()\\]/g, "x").replace(/\s/g, ""), `early ${early}`);
  }
});
