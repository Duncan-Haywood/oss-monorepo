import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { quoteGig, tierLadder, annualPlan, overtimeFloor, parseAddons, sampleAddons, money, money2 } from "./quote.mjs";

const read = (f) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const GUIDE = "how-much-should-a-wedding-dj-charge.html";

test("quoteGig on the defaults matches a hand calculation", () => {
  const q = quoteGig({});
  // hours: 5 play + 2 load + 2 prep + 1 travel = 10. costs: gear 6000/150=40, insurance 600/60=10, software 900/60=15, mileage 40*0.7=28 => 93.
  assert.equal(q.totalHours, 10);
  assert.equal(q.unpaidHours, 5);
  near(q.costs, 93);
  near(q.fees, 36);
  near(q.profit, 1200 - 36 - 93);
  near(q.effectiveHourly, 107.1);
  near(q.quotedHourly, 240);
});

test("break-even price gives zero profit and the target price gives exactly the target hourly", () => {
  for (const opts of [{}, { leadFeePct: 15, secondOpHours: 4 }, { overtimeHours: 1, overtimeRate: 20, targetHourly: 80 }]) {
    const q = quoteGig(opts);
    near(quoteGig({ ...opts, basePrice: q.breakEvenPrice }).profit, 0, 1e-6);
    const t = quoteGig({ ...opts, basePrice: q.targetPrice });
    near(t.effectiveHourly, q.options.targetHourly, 1e-6);
  }
});

test("a lead fee, second operator, overtime and add-ons move the numbers in the right direction", () => {
  const base = quoteGig({});
  assert.ok(quoteGig({ leadFeePct: 15 }).profit < base.profit);
  near(quoteGig({ secondOpHours: 5, secondOpRate: 40 }).profit, base.profit - 200);
  const ot = quoteGig({ overtimeHours: 1, overtimeRate: 150 });
  near(ot.totalHours, 11);
  near(ot.profit, base.profit + 150 * 0.97);
  const a = quoteGig({}, [{ name: "x", price: 300, cost: 50, hours: 1, tier: "good" }]);
  near(a.profit, base.profit + 300 * 0.97 - 50);
  assert.equal(a.totalHours, 11);
});

test("deposit schedule sums to the quote, with overtime billed separately", () => {
  const q = quoteGig({ depositPct: 25, overtimeHours: 2, overtimeRate: 100 });
  near(q.schedule[0].amount, 300);
  near(q.schedule[1].amount, 900);
  near(q.scheduleTotal, q.revenue);
  assert.equal(q.schedule.length, 3);
});

test("bad input is reported, not computed", () => {
  assert.match(quoteGig({ gearGigs: 0 }).error, /gear life/i);
  assert.match(quoteGig({ cardFeePct: 60, leadFeePct: 40 }).error, /under 100/);
  assert.match(quoteGig({ basePrice: "abc" }).error, /basePrice/);
  assert.match(quoteGig({ depositPct: 120 }).error, /Deposit/);
  assert.match(annualPlan({ peakGigs: 0, offGigs: 0 }).error, /at least one/);
});

test("parseAddons reads lines, skips junk and defaults the tier", () => {
  const r = parseAddons(sampleAddons());
  assert.equal(r.rows.length, 5);
  assert.deepEqual(r.rows.map((a) => a.tier), ["good", "better", "better", "best", "best"]);
  const j = parseAddons("Lights,100\nnonsense\nBad,-5");
  assert.equal(j.rows.length, 1);
  assert.equal(j.rows[0].tier, "better");
  assert.equal(j.warnings.length, 1);
});

test("tier ladder: each tier hits the hourly target after rounding up, and prices rise with scope", () => {
  const { tiers } = tierLadder({}, parseAddons(sampleAddons()).rows);
  assert.deepEqual(tiers.map((t) => t.name), ["good", "better", "best"]);
  for (const t of tiers) {
    assert.ok(t.effectiveHourly >= 60 - 1e-9);
    assert.equal(t.price % 25, 0);
    assert.ok(t.price - t.exactTarget < 25);
  }
  assert.ok(tiers[0].price < tiers[1].price && tiers[1].price < tiers[2].price);
  assert.deepEqual(tiers[0].addons, ["Ceremony sound"]);
  assert.equal(tiers[2].addons.length, 5);
});

test("annual plan reaches the income goal exactly and the peak premium holds", () => {
  const p = annualPlan({});
  near(p.income, 60000, 1e-6);
  near(p.peakPrice / p.offPrice, 1.2);
  assert.equal(p.gigs, 60);
  assert.equal(p.annualHours, 600);
  // Independent re-derivation from per-gig profit: 25 off + 35 peak gigs.
  const off = quoteGig({ basePrice: p.offPrice }), peak = quoteGig({ basePrice: p.peakPrice });
  near(25 * off.profit + 35 * peak.profit, 60000, 1e-6);
  assert.equal(p.gigsNeededAtQuotePrice, 59);
});

test("overtime floor covers the target plus fees, plus the second operator", () => {
  near(overtimeFloor({}).rate, 60 / 0.97);
  near(overtimeFloor({ secondOpHours: 3, secondOpRate: 35 }).rate, 95 / 0.97);
});

test("module has no network or DOM access", () => {
  assert.doesNotMatch(read("quote.mjs"), /fetch\(|XMLHttpRequest|sendBeacon|document\.|window\.|^\s*import\s/m);
});

test("the quote builder is wired into the page: every input id exists with the engine default", () => {
  const idx = read("index.html");
  const fields = JSON.parse(idx.match(/const QFIELDS = (\[.*?\]);/)[1]);
  const q = quoteGig({});
  for (const k of fields) {
    assert.ok(k in q.options, k);
    assert.match(idx, new RegExp(`<label for="q_${k}">`), `label ${k}`);
    assert.match(idx, new RegExp(`id="q_${k}" inputmode="decimal" value="${q.options[k]}"`), `default ${k}`);
  }
  assert.equal(fields.length, Object.keys(q.options).length);
  for (const e of ["quote_built", "quote_example_loaded"]) assert.ok(idx.includes(`record("${e}")`), e);
  assert.ok(idx.includes(`href="${GUIDE}"`));
});

test("the guide's worked numbers match the engine and it is in the sitemap", () => {
  const g = read(GUIDE);
  const q = quoteGig({}), plan = annualPlan({}, []), ot = overtimeFloor({});
  const ladder = tierLadder({}, parseAddons(sampleAddons()).rows).tiers;
  for (const s of [money(q.price), money2(q.profit), money2(q.effectiveHourly), money2(q.quotedHourly), money(q.breakEvenPrice), money(q.targetPrice), money2(ot.rate), money(plan.offPrice), money(plan.peakPrice), money2(plan.hourly), String(plan.annualHours), money(plan.income), ...Object.values(q.fixed).slice(0, 4).map(money2)]) assert.ok(g.includes(s), s);
  for (const t of ladder) for (const s of [money(t.price), money(t.profit), money2(t.effectiveHourly)]) assert.ok(g.includes(s), `${t.name} ${s}`);
  assert.match(g, /No warranty/);
  assert.match(g, /Not affiliated with/);
  const blocks = [...g.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks[0]["@type"], "FAQPage");
  for (const f of blocks[0].mainEntity) assert.ok(g.includes(`<h3>${f.name}</h3>`), f.name);
  const sm = read("sitemap.xml");
  for (const n of readdirSync(new URL("./", import.meta.url)).filter((n) => n.endsWith(".html") && n !== "index.html")) assert.ok(sm.includes(n), n);
});
