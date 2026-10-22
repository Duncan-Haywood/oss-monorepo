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
