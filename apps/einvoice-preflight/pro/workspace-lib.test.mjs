// The workspace page's pure helpers. FSL-1.1-MIT (see ../LICENSE, part 2).
import assert from "node:assert/strict";
import { test } from "node:test";
import { isBlocking as reportIsBlocking } from "../report.mjs";
import { MAX_BATCH, MAX_FILE, diffName, fixedName, formatEuro, planBatches, summarizeResult, toBase64, usageShare, isBlocking } from "./web/workspace-lib.mjs";

test("toBase64 matches Buffer for large and binary input", () => {
  const bytes = new Uint8Array(200_000).map((_, i) => (i * 7919) & 255);
  assert.equal(toBase64(bytes), Buffer.from(bytes).toString("base64"));
  assert.equal(toBase64(new Uint8Array()), "");
});

test("planBatches keeps to 50 documents and the body cap, refuses empty and oversized files", () => {
  const small = Array.from({ length: 120 }, (_, i) => ({ name: `f${i}.xml`, size: 1000 }));
  const p = planBatches(small);
  assert.deepEqual(p.batches.map((b) => b.length), [MAX_BATCH, MAX_BATCH, 20]);
  const big = Array.from({ length: 40 }, (_, i) => ({ name: `b${i}.pdf`, size: MAX_FILE }));
  const q = planBatches([...big, { name: "huge.pdf", size: MAX_FILE + 1 }, { name: "empty.xml", size: 0 }]);
  for (const b of q.batches) assert.ok(b.reduce((s, f) => s + 4 * Math.ceil(f.size / 3), 0) <= 20 * 1024 * 1024);
  assert.equal(q.batches.flat().length, 40);
  assert.deepEqual(q.refused.map((r) => [r.file.name, r.reason]), [["huge.pdf", "too_large"], ["empty.xml", "empty"]]);
});

test("fixed and diff file names", () => {
  assert.equal(fixedName("rechnung.xml"), "rechnung.fixed.xml");
  assert.equal(fixedName("C:\\in\\facture 12.XML"), "facture 12.fixed.XML");
  assert.equal(fixedName("noext"), "noext.fixed.xml");
  assert.equal(diffName("rechnung.xml"), "rechnung.diff");
});

test("isBlocking agrees with the checker's rule", () => {
  for (const severity of [undefined, "error", "fatal", "warning", "note", "information"]) {
    assert.equal(isBlocking({ severity }), reportIsBlocking({ severity }), String(severity));
  }
});

test("summarizeResult puts blocking findings first and exposes the fixed file only when a fix applied", () => {
  const s = summarizeResult({
    file: "a.xml",
    status: "fail",
    findings: [
      { rule: "W-1", severity: "warning", message: "w" },
      { rule: "INV-003", message: "bad date", explanation: { title: "Datum", action: "Ändern", source: "template", lang: "de" } },
    ],
    fixes: { applied: [{ id: "date-format", resolves: ["INV-003"] }], skipped: [], content: "<x/>", diff: "--- a", revalidation: { status: "pass" } },
  });
  assert.deepEqual(s.rows.map((r) => r.rule), ["INV-003", "W-1"]);
  assert.equal(s.blocking, 1);
  assert.equal(s.warnings, 1);
  assert.equal(s.rows[0].title, "Datum");
  assert.equal(s.fixedContent, "<x/>");
  assert.equal(s.fixedStatus, "pass");
  const none = summarizeResult({ file: "b.pdf", status: "pass", findings: [], fixes: { applied: [], skipped: [{ id: "*", reason: "pdf" }] } });
  assert.equal(none.fixedContent, null);
  assert.equal(none.skipped.length, 1);
});

test("formatEuro and usageShare", () => {
  assert.equal(formatEuro(1900, "en"), "€19");
  assert.equal(formatEuro(1950, "de"), "19,50 €");
  assert.equal(usageShare(150, 100), 1);
  assert.equal(usageShare(1, 0), 0);
});
