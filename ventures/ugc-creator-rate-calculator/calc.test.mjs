import { test } from "node:test";
import assert from "node:assert/strict";
import { priceUgc, quoteText, bulkDiscount, SAMPLE, TIERS, USAGE, VERIFY } from "./calc.mjs";

const base = { ...SAMPLE, videos: 1, usage: "none", whitelist: "none", exclusivity: "none", rawFootage: "no", rush: "no", extraHooks: 0, extraRevisions: 0, productCost: 0, niche: "general", format: "short", tier: "mid" };

test("a plain organic video prices at the tier range", () => {
  const r = priceUgc(base);
  assert.equal(r.ok, true);
  assert.equal(r.low, 150);
  assert.equal(r.high, 350);
  assert.equal(r.walkAway, 120);
});

test("usage rights add to the base, and perpetual costs more than 12 months", () => {
  const d90 = priceUgc({ ...base, usage: "d90" });
  assert.equal(d90.low, 225);
  const y1 = priceUgc({ ...base, usage: "d365" });
  const forever = priceUgc({ ...base, usage: "forever" });
  assert.ok(forever.low > y1.low && y1.low > d90.low);
});

test("rights are monotonic for every usage option", () => {
  let last = -1;
  for (const u of USAGE) { const r = priceUgc({ ...base, usage: u.id }); assert.ok(r.low >= last); last = r.low; }
});

test("bulk discount applies at 3, 5 and 10 videos", () => {
  assert.equal(bulkDiscount(2), 0);
  assert.equal(bulkDiscount(3), 0.05);
  assert.equal(bulkDiscount(5), 0.08);
  assert.equal(bulkDiscount(12), 0.12);
  const three = priceUgc({ ...base, videos: 3 });
  assert.ok(three.low < 3 * 150 && three.low > 2 * 150);
});

test("raw footage, rush, hooks and revisions each raise the price", () => {
  const b = priceUgc(base).low;
  for (const k of [{ rawFootage: "yes" }, { rush: "yes" }, { extraHooks: 3 }, { extraRevisions: 3 }, { productCost: 50 }]) {
    assert.ok(priceUgc({ ...base, ...k }).low > b, JSON.stringify(k));
  }
});

test("higher tiers and pricier niches never price below lower ones", () => {
  const lows = TIERS.map((t) => priceUgc({ ...base, tier: t.id }).low);
  assert.deepEqual([...lows].sort((a, b) => a - b), lows);
  assert.ok(priceUgc({ ...base, niche: "finance" }).low > priceUgc(base).low);
});

test("bad input is rejected with messages, never clamped", () => {
  assert.equal(priceUgc({ ...base, videos: 0 }).ok, false);
  assert.equal(priceUgc({ ...base, videos: -2 }).ok, false);
  assert.equal(priceUgc({ ...base, videos: 1.5 }).ok, false);
  assert.equal(priceUgc({ ...base, videos: "" }).ok, false);
  assert.equal(priceUgc({ ...base, tier: "" }).ok, false);
  assert.equal(priceUgc({ ...base, productCost: -5 }).ok, false);
  assert.equal(priceUgc({ ...base, rush: "maybe" }).ok, false);
  assert.ok(priceUgc({ ...base, usage: "x" }).errors.length > 0);
});

test("findings warn about perpetual rights and handle access, and name a source to verify", () => {
  const r = priceUgc({ ...base, usage: "forever", whitelist: "d90", exclusivity: "d30" });
  const titles = r.findings.map((f) => f.title).join("|");
  assert.match(titles, /Perpetual/);
  assert.match(titles, /Handle access/);
  assert.match(titles, /Exclusivity/);
  assert.ok(r.findings.some((f) => f.detail.includes(VERIFY)));
});

test("the sample prices and the quote text reflects the rights chosen", () => {
  const r = priceUgc(SAMPLE);
  assert.equal(r.ok, true);
  const t = quoteText(SAMPLE, r);
  assert.match(t, /Paid ads, 90 days/);
  assert.match(t, /Raw footage/);
  assert.match(t, /\$/);
  assert.equal(quoteText(SAMPLE, { ok: false }), "");
});
