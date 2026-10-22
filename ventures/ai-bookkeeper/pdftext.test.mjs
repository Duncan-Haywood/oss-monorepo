import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { pdfText } from "./pdftext.mjs";
import { readStatement } from "./bank.mjs";

const bytes = (s) => new Uint8Array(Buffer.from(s, "latin1"));

// A PDF assembled by hand: objects, optional Flate on the content stream.
function build(content, { flate = false, font = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>", extra = [] } = {}) {
  const data = flate ? deflateSync(Buffer.from(content, "latin1")).toString("latin1") : content;
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${data.length}${flate ? " /Filter /FlateDecode" : ""} >>\nstream\n${data}\nendstream`, font, ...extra];
  let out = "%PDF-1.4\n";
  objs.forEach((o, i) => { out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  return bytes(out + "trailer\n<< /Size 6 /Root 1 0 R >>\n%%EOF\n");
}
const lines = (ls) => "BT /F1 9 Tf 40 760 Td 11 TL " + ls.map((l) => `(${l.replace(/[()\\]/g, "\\$&")}) Tj T*`).join(" ") + " ET";

test("plain and Flate content streams give the same lines, escapes included", async () => {
  const ls = ["Deposits", "2026-09-03 Client payment (ACME) 1,200.00", "Withdrawals", "2026-09-05 Rent \\ Sept 800.00"];
  const want = ls.join("\n");
  assert.equal(await pdfText(build(lines(ls))), want);
  assert.equal(await pdfText(build(lines(ls), { flate: true })), want);
});

test("TJ kerning keeps a word together and a wide gap becomes a space", async () => {
  const c = "BT /F1 10 Tf 40 700 Td [(Ac) 20 (me) -600 (Bank)] TJ ET";
  assert.equal(await pdfText(build(c)), "Acme Bank");
});

test("a two-byte font with a ToUnicode map is decoded", async () => {
  const cmap = "/CIDInit begin begincmap 1 begincodespacerange <0000> <FFFF> endcodespacerange 2 beginbfchar <0001> <0041> <0002> <0042> endbfchar 1 beginbfrange <0003> <0005> <0043> endbfrange endcmap";
  const font = "<< /Type /Font /Subtype /Type0 /BaseFont /X /Encoding /Identity-H /ToUnicode 6 0 R /DescendantFonts [7 0 R] >>";
  const extra = [`<< /Length ${cmap.length} >>\nstream\n${cmap}\nendstream`, "<< /Type /Font /Subtype /CIDFontType2 /DW 500 >>"];
  const t = await pdfText(build("BT /F1 10 Tf 40 700 Td <0001000200030004> Tj ET", { font, extra }));
  assert.equal(t, "ABCD");
});

test("rows keep their order by height and columns by position", async () => {
  const c = "BT /F1 10 Tf 1 0 0 1 300 500 Tm (800.00) Tj 1 0 0 1 40 500 Tm (2026-09-05 Rent) Tj 1 0 0 1 40 700 Tm (Withdrawals) Tj ET";
  assert.equal(await pdfText(build(c)), "Withdrawals\n2026-09-05 Rent   800.00");
});

test("not a PDF throws; a PDF with no text gives an empty string", async () => {
  await assert.rejects(pdfText(bytes("hello")), /not a PDF/);
  assert.equal(await pdfText(build("0 0 10 10 re f")), "");
});

// Made by Chromium's print-to-PDF (Flate streams, Type0 fonts, per-glyph positioning,
// a flipped CTM): the shape most "print to PDF" statements have.
test("a statement PDF printed by Chromium reads to the table's rows", async () => {
  const text = await pdfText(readFileSync(new URL("./fixtures/statement-chromium.pdf", import.meta.url)));
  assert.match(text, /^2026-09-03 +Client payment ACME +1,200\.00$/m);
  assert.ok(text.indexOf("Deposits") < text.indexOf("Withdrawals"));
  const r = readStatement(text);
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2026-09-03", 120000], ["2026-09-10", 4510], ["2026-09-05", -80000], ["2026-09-12", -5499]]);
});
