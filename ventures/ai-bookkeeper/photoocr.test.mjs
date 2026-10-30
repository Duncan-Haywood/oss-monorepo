import { test } from "node:test";
import assert from "node:assert/strict";
import { readPhotos, OCR_URLS } from "./photoocr.mjs";

const png = (name) => ({ name, type: "image/png" });
const engine = (texts) => { let i = 0; return { closed: false, recognize: async () => texts[i++], close() { this.closed = true; } }; };

test("each photo becomes one block, damaged digits are repaired, blocks are split by ---", async () => {
  const e = engine(["Blue Bottle\n03/14/2026\n\nTotal l0.62  \n", "Hardware Hank\nTotal 43.2O"]);
  const r = await readPhotos([png("a.png"), png("b.png")], { loadEngine: async () => e });
  assert.equal(r.read, 2);
  assert.equal(r.text, "Blue Bottle\n03/14/2026\nTotal 10.62\n---\nHardware Hank\nTotal 43.20");
  assert.ok(e.closed, "the worker is released");
});

test("non-images and empty reads are skipped with a reason; no image means the engine never loads", async () => {
  let loads = 0;
  const load = async () => { loads++; return engine(["", "Cafe\nTotal 5.00"]); };
  const none = await readPhotos([{ name: "r.pdf", type: "application/pdf" }], { loadEngine: load });
  assert.equal(loads, 0);
  assert.equal(none.skipped[0].name, "r.pdf");
  const r = await readPhotos([png("blank.png"), png("ok.png"), { name: "n.txt", type: "text/plain" }], { loadEngine: load });
  assert.equal(r.read, 1);
  assert.deepEqual(r.skipped.map((s) => s.name).sort(), ["blank.png", "n.txt"]);
});

test("the engine is closed even when a photo throws; reader files come only from jsDelivr", async () => {
  const e = { closed: false, recognize: async () => { throw new Error("bad image"); }, close() { this.closed = true; } };
  await assert.rejects(readPhotos([png("x.png")], { loadEngine: async () => e }), /bad image/);
  assert.ok(e.closed);
  for (const u of Object.values(OCR_URLS)) assert.match(u, /^https:\/\/cdn\.jsdelivr\.net\/npm\/(@[^/]+\/)?[^/]+@\d/);
});
