// node --test site/image-items.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { imageList, matchImages, itemName, isImageFile, UNDRAWABLE_EXT } from "./image-items.mjs";
import { parseList, listId, encodeList, decodeList, MAX_ITEMS } from "./rank-core.mjs";

const files = (...names) => names.map((name) => ({ name, type: /\.(txt|pdf)$/.test(name) ? "text/plain" : "" }));

test("a picture list is the sorted, normalised names, whatever order the picker returned", () => {
  const a = imageList(files("logo-c.png", "Logo-A.png", "logo-b.svg"));
  const b = imageList(files("logo-b.svg", "logo-c.png", "Logo-A.png"));
  assert.deepEqual(a.items, ["Logo-A.png", "logo-b.svg", "logo-c.png"]);
  assert.deepEqual(a.items, b.items);
  assert.equal(listId(a.items), listId(b.items));
  // files[i] points back at the input file for items[i]
  assert.deepEqual(a.files, [1, 2, 0]);
  assert.deepEqual(b.files, [2, 0, 1]);
});

test("non-pictures, case repeats and names past the cap are reported, not silently ranked", () => {
  const r = imageList(files("notes.txt", "a.jpg", "A.JPG", "b.webp", "c.heic", "brief.pdf"));
  assert.deepEqual(r.items, ["a.jpg", "b.webp", "c.heic"]);
  assert.deepEqual(r.notImages, ["notes.txt", "brief.pdf"]);
  assert.deepEqual(r.repeats, ["A.JPG"]);
  const many = imageList(files(...Array.from({ length: MAX_ITEMS + 5 }, (_, i) => `p${String(i).padStart(3, "0")}.png`)));
  assert.equal(many.items.length, MAX_ITEMS);
  assert.deepEqual(many.overCap, ["p060.png", "p061.png", "p062.png", "p063.png", "p064.png"]);
  assert.ok(UNDRAWABLE_EXT.test("c.heic") && !UNDRAWABLE_EXT.test("a.jpg"));
});

test("a file's MIME type counts even with an odd extension", () => {
  assert.ok(isImageFile({ name: "scan", type: "image/png" }));
  assert.ok(!isImageFile({ name: "scan", type: "application/octet-stream" }));
});

test("item names survive the link round trip, so the receiver's list and fingerprint match", () => {
  // Bullet-like and over-long names are normalised the same way parseList normalises a typed line.
  const long = "x".repeat(200) + ".png";
  const r = imageList(files("1. sunrise.jpg", "- beach.png", long, "dog 🐕.jpg"));
  assert.deepEqual(parseList(r.items.join("\n")), r.items);
  const back = decodeList(encodeList({ title: "Best shot?", items: r.items, images: true }));
  assert.deepEqual(back.items, r.items);
  assert.equal(back.images, true);
  assert.equal(itemName("1. sunrise.jpg"), "sunrise.jpg");
});

test("a typed list's link does not claim to be pictures", () => {
  const back = decodeList(encodeList({ items: ["a", "b", "c"] }));
  assert.equal(back.images, undefined);
});

test("matchImages pairs attached files with the list by name, case-blind, and names the gaps", () => {
  const items = ["Logo-A.png", "logo-b.svg", "logo-c.png"];
  const m = matchImages(items, files("LOGO-C.PNG", "holiday.jpg", "logo-a.png", "logo-a.png"));
  assert.deepEqual(m.files, [2, -1, 0]);
  assert.deepEqual(m.missing, ["logo-b.svg"]);
  assert.deepEqual(m.extra, ["holiday.jpg", "logo-a.png"]);
  // bullet-stripped names match the files they came from
  const r = imageList(files("1. sunrise.jpg", "2. sunset.jpg", "3. noon.jpg"));
  assert.deepEqual(matchImages(r.items, files("3. noon.jpg", "1. sunrise.jpg", "2. sunset.jpg")).missing, []);
});

test("the picture landing page carries the disclaimer, canonical URL and usage counter, and the ranker and landing page link it", async () => {
  const { readFileSync } = await import("node:fs");
  const here = new URL(".", import.meta.url);
  const page = readFileSync(new URL("pick-the-best-photo.html", here), "utf8");
  assert.match(page, /<strong>Disclaimer\.<\/strong>/);
  assert.match(page, /rel="canonical" href="https:\/\/marisstella.app\/quick-pick-survey\/pick-the-best-photo.html"/);
  assert.match(page, /import \{ record \} from "\.\/usage\.mjs"/);
  for (const f of ["rank.html", "index.html"]) assert.ok(readFileSync(new URL(f, here), "utf8").includes('href="pick-the-best-photo.html"'), f);
  const rank = readFileSync(new URL("rank.html", here), "utf8");
  assert.match(rank, /from "\.\/image-items\.mjs"/);
  assert.match(rank, /id="images" accept="image\/\*" multiple/);
});
