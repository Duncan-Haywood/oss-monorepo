import test from "node:test";
import assert from "node:assert/strict";
import { proofingFrames, proofNames, fitSize, watermarkLayout, galleryHtml, readFavourites, LIST_HEADER } from "./proofing.mjs";

const P = { offset: 0, length: 1, width: 6000, height: 4000 };
const items = [
  { name: "IMG_0010.CR3", rating: 3, preview: P },
  { name: "IMG_0002.CR3", rating: 1, preview: P },
  { name: "IMG_0003.CR3", rating: 0, preview: P },
  { name: "IMG_0004.CR3", rating: 5, rejected: true, preview: P },
  { name: "IMG_0005.CR3", rating: 4, preview: null },
  { name: "IMG_0006.CR3", rating: 2, label: "Green", preview: P },
];

test("proofingFrames keeps rated, unrejected frames with a preview, in numeric name order", () => {
  assert.deepEqual(proofingFrames(items).map((i) => i.name), ["IMG_0002.CR3", "IMG_0006.CR3", "IMG_0010.CR3"]);
  assert.deepEqual(proofingFrames(items, { minRating: 3 }).map((i) => i.name), ["IMG_0010.CR3"]);
  assert.deepEqual(proofingFrames(items, { label: "Green" }).map((i) => i.name), ["IMG_0006.CR3"]);
});

test("proofNames gives each frame its own .jpg and keeps the stem", () => {
  assert.deepEqual(proofNames(["IMG_0001.CR3", "IMG_0001.JPG", "img_0001.nef", "a/b:c.ARW", ".hidden"]),
    ["IMG_0001.jpg", "IMG_0001-2.jpg", "img_0001-3.jpg", "a_b_c.jpg", "_hidden.jpg"]);
});

test("fitSize caps the long edge and never enlarges", () => {
  assert.deepEqual(fitSize(6000, 4000, 2048), [2048, 1365]);
  assert.deepEqual(fitSize(4000, 6000, 2048), [1365, 2048]);
  assert.deepEqual(fitSize(1600, 1067, 2048), [1600, 1067]);
});

test("watermarkLayout scales with the short edge", () => {
  const w = watermarkLayout(2048, 1365);
  assert.equal(w.size, 44); assert.equal(w.x, 2048 - 22); assert.equal(w.y, 1365 - 22);
  assert.equal(watermarkLayout(200, 100).size, 12);
});

test("galleryHtml escapes every text and cannot be broken out of by a file name", () => {
  const html = galleryHtml({ title: "Smith <wedding>", by: "A & B", note: `"quoted"`, frames: [{ file: "x</script><script>alert(1)</script>.jpg", original: "x.CR3", w: 10, h: 10 }] });
  assert.ok(html.includes("<title>Smith &lt;wedding&gt;</title>"));
  assert.ok(html.includes("From A &amp; B"));
  assert.ok(html.includes("&quot;quoted&quot;"));
  assert.equal(html.split("</script>").length, 2, "only the page's own closing script tag");
  assert.ok(!/https?:\/\//.test(html.replace(/<meta[^>]*>/g, "")), "no outside requests");
});

test("galleryHtml's script parses and lists the frames", () => {
  const html = galleryHtml({ title: "T", frames: [{ file: "a.jpg", original: "a.CR3", w: 3, h: 2 }, { file: "b.jpg", original: "b.CR3", w: 3, h: 2 }] });
  const js = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
  assert.doesNotThrow(() => new Function(js));
  assert.ok(js.includes('"f":"a.jpg"') && js.includes('"o":"b.CR3"'));
});

const proofs = [
  { file: "IMG_0412.jpg", original: "IMG_0412.CR3" },
  { file: "IMG_0413.jpg", original: "IMG_0413.CR3" },
  { file: "DSC_0412.jpg", original: "DSC_0412.NEF" },
  { file: "IMG_0500.jpg", original: "IMG_0500.CR3" },
  { file: "IMG_0500-2.jpg", original: "IMG_0500.JPG" },
];

test("readFavourites reads the gallery's own list", () => {
  const r = readFavourites(`${LIST_HEADER} — Smith wedding\nIMG_0413.jpg\nIMG_0500-2.jpg\n`, proofs);
  assert.deepEqual(r, { matched: ["IMG_0413.CR3", "IMG_0500.JPG"], unknown: [], ambiguous: [] });
});

test("readFavourites reads what clients type instead", () => {
  const r = readFavourites("1. IMG_0413\n• img_0412.cr3, \"DSC_0412.jpg\"\nalso 0413 and 9999\n", proofs);
  assert.deepEqual(r.matched, ["IMG_0413.CR3", "IMG_0412.CR3", "DSC_0412.NEF"]);
  assert.deepEqual(r.unknown, ["also", "and", "9999"]);
});

test("readFavourites reports a bare number or stem that fits two frames", () => {
  const r = readFavourites("0412\nIMG_0500", proofs);
  assert.deepEqual(r.matched, []);
  assert.deepEqual(r.ambiguous, ["0412", "IMG_0500"]);
});
