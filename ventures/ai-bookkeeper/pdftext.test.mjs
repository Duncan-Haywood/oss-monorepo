import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
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
