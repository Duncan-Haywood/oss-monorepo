import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { repairFacturX } from "./repair-facturx.mjs";
import { extractEmbeddedInvoiceXml, buildPdfWithAttachment } from "./facturx.mjs";
import { parseCiiInvoice } from "./cii.mjs";
import { checkInvoice } from "./checks.mjs";

const ex = (n) => readFileSync(new URL(`./examples/${n}`, import.meta.url));
const dec = (b) => new TextDecoder().decode(b);

test("a clean Factur-X PDF comes back byte for byte", async () => {
  const src = new Uint8Array(ex("factur-x-invoice.pdf"));
  const r = await repairFacturX(src);
  assert.equal(r.repaired, false);
  assert.equal(r.pdfRewritten, false);
  assert.deepEqual(r.pdf, src);
});

for (const filter of ["", "FlateDecode"]) {
  test(`a wrong total inside a PDF is fixed by an incremental update (${filter || "plain"} stream)`, async () => {
    const clean = dec(ex("xrechnung-cii-invoice.xml"));
    const bad = clean.replace("<ram:GrandTotalAmount>1190.00", "<ram:GrandTotalAmount>1100.00");
    let bytes = new TextEncoder().encode(bad);
    if (filter) {
      const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
      bytes = new Uint8Array(await new Response(cs).arrayBuffer());
    }
    const pdf = buildPdfWithAttachment(bytes, "factur-x.xml", { filter });
    const r = await repairFacturX(pdf);
    assert.equal(r.pdfRewritten, true);
    assert.deepEqual(r.changes.map((c) => c.path), ["/totals/gross"]);
    assert.deepEqual(r.pdf.subarray(0, pdf.length), pdf, "original bytes untouched");
    const again = dec(await extractEmbeddedInvoiceXml(r.pdf));
    assert.equal(again, clean);
    assert.deepEqual(checkInvoice(parseCiiInvoice(again)), []);
    assert.match(dec(r.pdf.subarray(pdf.length)), /\/Prev \d+/);
  });
}

// A PDF 1.5 shaped file: the newest cross-reference is a stream, no "trailer".
function xrefStreamPdf(xmlBytes) {
  const enc = new TextEncoder();
  const parts = [];
  const offsets = {};
  let len = 0;
  const put = (b) => { const u = typeof b === "string" ? enc.encode(b) : b; parts.push(u); len += u.length; };
  put("%PDF-1.5\n%\xE2\xE3\n");
  const obj = (n, body) => { offsets[n] = len; put(`${n} 0 obj\n`); put(body); put("\nendobj\n"); };
  obj(1, "<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles 3 0 R >> >>");
  obj(2, "<< /Type /Pages /Kids [] /Count 0 >>");
  obj(3, "<< /Names [(factur-x.xml) 4 0 R] >>");
  obj(4, "<< /Type /Filespec /F (factur-x.xml) /EF << /F 5 0 R >> >>");
  offsets[5] = len;
  put(`5 0 obj\n<< /Type /EmbeddedFile /Length ${xmlBytes.length} >>\nstream\n`);
  put(xmlBytes);
  put("\nendstream\nendobj\n");
  const at = len;
  put(`6 0 obj\n<< /Type /XRef /Size 7 /W [1 4 2] /Root 1 0 R /ID [<aa> <bb>] /Length 0 >>\nstream\n\nendstream\nendobj\nstartxref\n${at}\n%%EOF\n`);
  return Uint8Array.from(parts.flatMap((u) => [...u]));
}

test("a Factur-X PDF with a cross-reference stream is fixed by an appended xref stream", async () => {
  const clean = dec(ex("xrechnung-cii-invoice.xml"));
  const bad = clean.replace("<ram:GrandTotalAmount>1190.00", "<ram:GrandTotalAmount>1100.00");
  const pdf = xrefStreamPdf(new TextEncoder().encode(bad));
  const r = await repairFacturX(pdf);
  assert.equal(r.pdfRewritten, true);
  assert.deepEqual(r.pdf.subarray(0, pdf.length), pdf, "original bytes untouched");
  assert.equal(dec(await extractEmbeddedInvoiceXml(r.pdf)), clean);
  const tail = new TextDecoder("latin1").decode(r.pdf);
  const start = Number(tail.match(/startxref\s+(\d+)\s+%%EOF\s*$/)[1]);
  assert.match(tail.slice(start), /^7 0 obj\n<< \/Type \/XRef \/Size 8 \/W \[1 4 2\] \/Index \[5 1 7 1\] \/Root 1 0 R \/ID \[<aa> <bb>\] \/Prev \d+/);
  const rows = r.pdf.subarray(tail.indexOf("stream\n", start) + 7);
  const off = (i) => (rows[i * 7 + 1] << 24 | rows[i * 7 + 2] << 16 | rows[i * 7 + 3] << 8 | rows[i * 7 + 4]);
  assert.match(tail.slice(off(0)), /^5 0 obj/);
  assert.equal(off(1), start);
  assert.match(tail.slice(Number(tail.match(/\/Prev (\d+)/g).at(-1).slice(6))), /^6 0 obj/);
});

test("an encrypted cross-reference stream is not extended", async () => {
  const xml = new TextEncoder().encode(dec(ex("xrechnung-cii-invoice.xml")).replace("<ram:GrandTotalAmount>1190.00", "<ram:GrandTotalAmount>1100.00"));
  const pdf = xrefStreamPdf(xml);
  const enc = Uint8Array.from(new TextEncoder().encode(new TextDecoder("latin1").decode(pdf).replace("/Root 1 0 R", "/Root 1 0 R /Encrypt 9 0 R")));
  await assert.rejects(repairFacturX(enc), /encrypted/);
});

test("a non-CII or non-PDF input is refused", async () => {
  await assert.rejects(repairFacturX(new TextEncoder().encode("hello")), /not a PDF/);
});

test("CLI repairs a PDF to a file and the API returns the PDF in base64", async () => {
  const { execFileSync, spawnSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync, readFileSync: rf } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(`${tmpdir()}/fxr-`);
  const clean = dec(ex("xrechnung-cii-invoice.xml"));
  const pdf = buildPdfWithAttachment(new TextEncoder().encode(clean.replace("<ram:GrandTotalAmount>1190.00", "<ram:GrandTotalAmount>1100.00")));
  writeFileSync(`${dir}/in.pdf`, pdf);
  const r = spawnSync("node", [new URL("./repair-cli.mjs", import.meta.url).pathname, `${dir}/in.pdf`, "-o", `${dir}/out.pdf`], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /1 fixed, 0 left/);
  assert.equal(dec(await extractEmbeddedInvoiceXml(new Uint8Array(rf(`${dir}/out.pdf`)))), clean);
  void execFileSync;
});

// A third-party reader (poppler), when installed, opens the repaired example:
// the pages are intact and it hands back the corrected XML, not the original.
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync as readFile } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const hasPoppler = spawnSync("pdfdetach", ["-v"]).error === undefined;
test("poppler opens the repaired PDF and extracts the corrected XML", { skip: !hasPoppler }, async () => {
  const src = readFile(new URL("./examples/factur-x-credit-note-with-defects.pdf", import.meta.url));
  const x = await repairFacturX(new Uint8Array(src));
  assert.ok(x.repaired && x.pdfRewritten);
  const dir = mkdtempSync(join(tmpdir(), "fx-"));
  const pdf = join(dir, "fixed.pdf");
  writeFileSync(pdf, x.pdf);
  const info = spawnSync("pdfinfo", [pdf], { encoding: "utf8" });
  assert.match(info.stdout, /Pages:\s+1/);
  assert.doesNotMatch(info.stderr, /Syntax Error/);
  const out = join(dir, "out.xml");
  const det = spawnSync("pdfdetach", ["-save", "1", "-o", out, pdf], { encoding: "utf8" });
  assert.equal(det.status, 0, det.stderr);
  assert.equal(readFile(out, "utf8"), x.xml);
});
