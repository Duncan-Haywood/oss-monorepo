import test from "node:test";
import assert from "node:assert/strict";
import { planWardrobe, defaultProfile } from "./wardrobe.mjs";
import { lookbook, enumerateOutfits, pickOutfits } from "./lookbook.mjs";

const plans = [defaultProfile(), defaultProfile({ style: "classic", climate: "cold", season: "autumn-winter", size: 15 }), defaultProfile({ style: "streetwear", climate: "warm", season: "spring-summer", size: 8 })].map(planWardrobe);

test("enumeration equals the planner's outfit count", () => {
  for (const p of plans) assert.equal(enumerateOutfits(p.items).length, p.outfitCount);
});

test("no outfit has two accents or a same-colour layer", () => {
  for (const p of plans) for (const o of enumerateOutfits(p.items)) {
    assert.ok([o.top, o.bottom, o.layer].filter(x => x && x.accent).length <= 1);
  }
});

test("pickOutfits spreads: shows every piece when max is large enough", () => {
  const p = plans[1], all = enumerateOutfits(p.items);
  const picked = pickOutfits(all, all.length);
  assert.equal(picked.length, all.length);
  assert.equal(pickOutfits(all, 5).length, 5);
});

test("page: svg per look, escaped names, https-only links, no scripts", () => {
  const p = plans[0];
  const it = p.items.find(i => i.role === "top");
  const { html, warnings, shown } = lookbook(p, { brand: '"><script>x</script>', links: { [`${it.id}|${it.colourName}`]: "javascript:alert(1)" } });
  assert.ok(!/<script/i.test(html));
  assert.ok(!/javascript:/.test(html));
  assert.equal((html.match(/<article>/g) || []).length, shown);
  assert.ok(warnings.some(w => /https only/.test(w)));
  const ok = lookbook(p, { links: { [`${it.id}|${it.colourName}`]: "https://example.com/p" } });
  assert.match(ok.html, /href="https:\/\/example\.com\/p"/);
});

test("warns when not every piece is shown", () => {
  const { warnings } = lookbook(plans[1], { max: 2 });
  assert.ok(warnings.some(w => /not in the 2 outfits/.test(w)));
});
