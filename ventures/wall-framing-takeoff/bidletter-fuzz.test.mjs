import { test } from "node:test";
import assert from "node:assert/strict";
import { proposal, proposalText, proposalHtml } from "./bidletter.mjs";

// Property test: random priced budgets give a proposal whose rows and payment
// milestones add to the price in cents, refuse when unpriced or when the
// milestones do not add to 100, and whose HTML never carries typed markup.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const cents = (x) => Math.round(x * 100);
const r2 = (x) => Math.round(x * 100) / 100;
const HOSTILE = ["<script>alert(1)</script>", "A & B", `"quoted"`, "<img src=x onerror=1>"];

function randomBudget(rand) {
  const names = ["Lumber", "Sheathing", "Roof", "Labor", "Allowances"].filter(() => rand() < 0.8);
  if (!names.length) names.push("Lumber");
  const sections = names.map((name) => ({ name, subtotal: r2(1 + rand() * 20000), unpriced: 0 }));
  const lines = sections.map((s) => ({ section: s.name, item: rand() < 0.3 ? HOSTILE[Math.floor(rand() * 4)] : "item " + s.name, qty: 1, unit: "ea", unitPrice: s.subtotal, amount: s.subtotal }));
  const materials = r2(sections.filter((s) => s.name !== "Labor" && s.name !== "Allowances").reduce((t, s) => t + s.subtotal, 0));
  const tax = materials ? r2(materials * rand() * 0.1) : 0;
  const contingency = materials ? r2(materials * rand() * 0.1) : 0;
  const total = r2(sections.reduce((t, s) => t + s.subtotal, 0) + tax + contingency);
  const bid = rand() < 0.6 ? r2(total * (1 + rand() * 0.5)) : 0;
  const unpriced = rand() < 0.25 ? ["Trusses (8 each)"] : [];
  return { lines, sections, materials, tax, contingency, total, bid, unpriced };
}

test("fuzz: proposals add up in cents, refuse gaps and bad schedules, and escape typed text", () => {
  let issued = 0, refused = 0;
  const failures = [];
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed);
    const b = randomBudget(rand);
    const opts = {};
    if (rand() < 0.5) opts.client = HOSTILE[Math.floor(rand() * 4)];
    if (rand() < 0.5) opts.project = HOSTILE[Math.floor(rand() * 4)];
    if (rand() < 0.5) opts.exclusions = [HOSTILE[Math.floor(rand() * 4)]];
    if (rand() < 0.5) opts.terms = [HOSTILE[Math.floor(rand() * 4)]];
    const n = 1 + Math.floor(rand() * 5);
    const goodPay = rand() < 0.5;
    if (rand() < 0.6) {
      const w = Array.from({ length: n }, () => 1 + rand() * 9);
      const ws = w.reduce((t, x) => t + x, 0);
      let pcts = w.map((x) => Math.round((x / ws) * 10000) / 100);
      pcts[n - 1] = Math.round((100 - pcts.slice(0, -1).reduce((t, x) => t + x, 0)) * 100) / 100;
      if (!goodPay) pcts[0] += 3;
      opts.payments = pcts.map((pct, i) => ({ name: "M" + i, pct }));
      opts.badPay = !goodPay || pcts.some((x) => !(x > 0));
    }
    const badPay = opts.badPay; delete opts.badPay;
    const partial = rand() < 0.3;
    const q = proposal(b, { ...opts, partial });
    const txt = proposalText(q).join("\n");
    if (b.unpriced.length && !partial) {
      if (q.ok) failures.push(`seed ${seed}: issued with unpriced lines`);
      refused++; continue;
    }
    if (badPay) {
      if (q.ok) failures.push(`seed ${seed}: bad payment schedule accepted`);
      refused++; continue;
    }
    if (!q.ok) { failures.push(`seed ${seed}: refused: ${q.error}`); continue; }
    issued++;
    const price = b.bid > 0 ? b.bid : b.total;
    if (cents(q.price) !== cents(price)) failures.push(`seed ${seed}: price ${q.price} != ${price}`);
    if (q.rows.reduce((t, r) => t + cents(r.amount), 0) !== cents(q.price)) failures.push(`seed ${seed}: rows do not add to price`);
    if (q.rows.some((r) => !(r.amount > 0))) failures.push(`seed ${seed}: non-positive row`);
    if (q.payments.length && q.payments.reduce((t, m) => t + cents(m.amount), 0) !== cents(q.price)) failures.push(`seed ${seed}: milestones do not add to price`);
    if (q.partial !== !!b.unpriced.length) failures.push(`seed ${seed}: partial flag wrong`);
    if (b.unpriced.length && !/WARNING: partial/.test(txt)) failures.push(`seed ${seed}: gap not stated`);
    if (/profit|overhead/i.test(txt)) failures.push(`seed ${seed}: cost words in text`);
    const html = proposalHtml(q);
    if (/<script|<img/i.test(html)) failures.push(`seed ${seed}: typed markup reached the HTML`);
  }
  assert.deepEqual(failures.slice(0, 5), []);
  assert.ok(issued > 100 && refused > 20, `issued ${issued}, refused ${refused}`);
});
