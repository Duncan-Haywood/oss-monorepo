import test from "node:test";
import assert from "node:assert/strict";
import { lookbook, pickLooks, figure } from "./lookbook.mjs";
import { planWardrobe, outfits, enumerateOutfits, defaultProfile } from "./wardrobe.mjs";

const profiles = [defaultProfile(), defaultProfile({ style: "classic", climate: "cold", season: "autumn-winter", size: 15 }), defaultProfile({ style: "streetwear", climate: "warm", season: "spring-summer", size: 8 })];

test("enumerateOutfits agrees with the outfit count", () => {
  for (const p of profiles) { const w = planWardrobe(p); assert.equal(enumerateOutfits(w.items).length, outfits(w.items).count); }
});

test("pickLooks is deterministic, within the limit, and spreads across pieces", () => {
  const all = enumerateOutfits(planWardrobe(profiles[0]).items);
  const a = pickLooks(all, 6), b = pickLooks(all, 6);
  assert.deepEqual(a, b);
  assert.equal(a.length, Math.min(6, all.length));
  const tops = new Set(a.map(o => o.top.id + o.top.colourName));
  assert.ok(tops.size >= Math.min(3, new Set(all.map(o => o.top.id + o.top.colourName)).size));
});

test("page lists every drawn look, escapes names and only links https URLs", () => {
  const r = lookbook(profiles[0], { brand: "<b>Mine</b>", links: { tee: "javascript:alert(1)", oxford: "https://example.com/oxford", jeans: "https://example.com/j" }, limit: 5 });
  assert.equal((r.html.match(/class="look"/g) || []).length, r.shown);
  assert.ok(!r.html.includes("<b>Mine</b>") && r.html.includes("&lt;b&gt;Mine"));
  assert.ok(!r.html.includes("javascript:"));
  assert.ok(!/<script/i.test(r.html));
  assert.ok(r.total >= r.shown);
});

test("no brand name is flagged, not invented", () => {
  assert.ok(lookbook(profiles[2]).warnings.some(w => /brand name/.test(w)));
  assert.equal(lookbook(profiles[2], { brand: "Atelier" }).warnings.length, 0);
});

test("a figure has the colours of its pieces and a layer is drawn over the top", () => {
  const o = enumerateOutfits(planWardrobe(profiles[1]).items).find(x => x.layer);
  const svg = figure(o);
  for (const c of [o.top.colour, o.bottom.colour, o.layer.colour]) assert.ok(svg.includes(c));
});
