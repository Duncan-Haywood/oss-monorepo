import { test } from "node:test";
import assert from "node:assert/strict";
import { levelBids, levelText } from "./bidlevel.mjs";

// Property test: random scopes and random bids. Totals must add up, a bid's
// leveled total never falls below what it bid, a gap with no price anywhere is
// listed rather than guessed, and the "lowest" fields agree with the numbers.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const r2 = (n) => Math.round(n * 100) / 100;

test("fuzz: bid leveling adds up, never lowers a bid and never guesses a price", () => {
  const failures = [];
  let cases = 0, gaps = 0, unlev = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed);
    const nLines = 1 + Math.floor(rand() * 6);
    const bud = { lines: [] };
    for (let i = 0; i < nLines; i++) bud.lines.push({ item: `Item ${i}`, qty: 10 + Math.floor(rand() * 500), unit: "ea", unitPrice: rand() < 0.3 ? r2(1 + rand() * 20) : null });
    const bids = [];
    const nBids = 1 + Math.floor(rand() * 4);
    for (let b = 0; b < nBids; b++) {
      const lines = [];
      for (const l of bud.lines) {
        if (rand() < 0.25) continue;
        const qty = Math.round(l.qty * (0.7 + rand() * 0.6));
        const unitPrice = r2(1 + rand() * 20);
        lines.push(rand() < 0.3 ? { item: l.item.toUpperCase(), qty, amount: r2(qty * unitPrice) } : { item: l.item, qty, unitPrice });
      }
      bids.push({ bidder: `B${b}`, lines });
    }
    const tag = `seed ${seed}`;
    const r = levelBids(bud, bids);
    cases++;
    if (r.errors.length) failures.push(`${tag}: unexpected errors ${r.errors}`);
    if (r.bidders.length !== bids.length) failures.push(`${tag}: bidder count`);
    for (const o of r.bidders) {
      if (![o.bidTotal, o.additions, o.leveledTotal].every(Number.isFinite)) failures.push(`${tag} ${o.bidder}: non-finite total`);
      if (o.additions < -1e-9) failures.push(`${tag} ${o.bidder}: negative additions ${o.additions}`);
      if (Math.abs(o.leveledTotal - r2(o.bidTotal + o.additions)) > 0.011) failures.push(`${tag} ${o.bidder}: leveled != bid + additions`);
      if (o.leveledTotal + 1e-9 < o.bidTotal) failures.push(`${tag} ${o.bidder}: leveled below bid`);
      const bid = bids.find((x) => x.bidder === o.bidder);
      const given = new Set(bid.lines.map((l) => l.item.toLowerCase()));
      const missing = bud.lines.filter((l) => !given.has(l.item.toLowerCase()));
      gaps += missing.length;
      for (const l of missing) {
        const priced = l.unitPrice != null || bids.some((x) => x.lines.some((y) => y.item.toLowerCase() === l.item.toLowerCase()));
        const isUnlev = o.unleveled.includes(l.item);
        if (!priced && !isUnlev) failures.push(`${tag} ${o.bidder}: ${l.item} had no price but was not listed unleveled`);
        if (priced && isUnlev) failures.push(`${tag} ${o.bidder}: ${l.item} priceable but listed unleveled`);
        if (isUnlev) unlev++;
        if (!o.flags.some((f) => f.item === l.item && f.kind === "missing")) failures.push(`${tag} ${o.bidder}: ${l.item} gap not flagged`);
      }
    }
    const lo = (key) => [...r.bidders].sort((a, b) => a[key] - b[key])[0][key];
    const byName = (n) => r.bidders.find((x) => x.bidder === n);
    if (byName(r.lowestLeveled).leveledTotal !== lo("leveledTotal")) failures.push(`${tag}: lowestLeveled wrong`);
    if (byName(r.lowestAsBid).bidTotal !== lo("bidTotal")) failures.push(`${tag}: lowestAsBid wrong`);
    // the report renders and is deterministic
    if (levelText(r).join("\n") !== levelText(levelBids(bud, bids)).join("\n")) failures.push(`${tag}: not deterministic`);
    // a looser tolerance never adds flags of kind short/over
    const count = (x) => x.bidders.reduce((s, o) => s + o.flags.filter((f) => f.kind !== "missing").length, 0);
    if (count(levelBids(bud, bids, { tolerance: 0.5 })) > count(r)) failures.push(`${tag}: looser tolerance flagged more`);
  }
  assert.ok(gaps > 100 && unlev > 5, `weak coverage: gaps ${gaps}, unleveled ${unlev}`);
  assert.deepEqual(failures.slice(0, 10), [], `${failures.length} failures over ${cases} cases`);
});
