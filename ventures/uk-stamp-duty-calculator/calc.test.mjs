import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, parse, sdlt } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("sample 450,000 main home pays 12,500", () => {
  const r = run({});
  assert.equal(r.tax, 2500 + 10000);
  assert.equal(r.effective, 2.78);
  assert.equal(r.rows.length, 3);
});

test("known band totals at standard rates", () => {
  assert.equal(sdlt(125000, "main", false).tax, 0);
  assert.equal(sdlt(300000, "main", false).tax, 5000);
  assert.equal(sdlt(500000, "main", false).tax, 15000);
  assert.equal(sdlt(1000000, "main", false).tax, 43750);
  assert.equal(sdlt(2000000, "main", false).tax, 153750);
});

test("first-time buyer relief and its cliff at 500,000", () => {
  assert.equal(sdlt(300000, "ftb", false).tax, 0);
  assert.equal(sdlt(400000, "ftb", false).tax, 5000);
  assert.equal(sdlt(500000, "ftb", false).tax, 10000);
  assert.equal(sdlt(500001, "ftb", false).tax, 15000);
  assert.equal(sdlt(500001, "ftb", false).relief, false);
  const r = run({ buyer: "ftb", price: 600000 });
  assert.ok(r.findings.some((f) => f.title.includes("does not apply above")));
});

test("additional dwelling adds 5% on the whole price, from 40,000", () => {
  assert.equal(sdlt(300000, "additional", false).tax, 20000);
  assert.equal(sdlt(39999, "additional", false).tax, 0);
  assert.equal(sdlt(40000, "additional", false).tax, 2000);
  const r = run({ buyer: "additional", price: 300000 });
  assert.ok(r.findings.some((f) => f.title.includes("adds GBP 15,000")));
});

test("non-UK resident surcharge adds 2%", () => {
  assert.equal(sdlt(300000, "main", true).tax, 11000);
  assert.equal(sdlt(300000, "additional", true).tax, 26000);
  assert.equal(sdlt(300000, "ftb", true).tax, 6000);
});

test("tax is rounded down to whole pounds", () => {
  assert.equal(sdlt(250001.5, "main", false).tax, 2500);
});

test("bad input is rejected, never clamped", () => {
  assert.ok(compute({ ...SAMPLE, price: "" }).errors.length);
  assert.ok(compute({ ...SAMPLE, price: -5 }).errors.length);
  assert.ok(compute({ ...SAMPLE, price: "abc" }).errors.length);
  assert.ok(compute({ ...SAMPLE, buyer: "x" }).errors.length);
  assert.ok(parse(undefined).errors.length);
});

test("summary names the source and carries the disclaimer", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.ok(t.includes("Not tax advice"));
  assert.ok(t.includes("Stamp Duty to pay: GBP 12,500"));
});

// Quality audit 2026-11-22 (round 96): the band-edge finding said a price drop "would save you up to -GBP 199" and used the wrong table's edges.
test("band-edge finding never shows negative money and uses the buyer's own table", () => {
  for (const buyer of ["main", "ftb", "additional"]) for (const nonResident of ["no", "yes"]) for (let price = 100000; price <= 1600000; price += 5000) {
    const r = compute({ price, buyer, nonResident });
    for (const f of r.findings) assert.ok(!f.title.includes("-GBP"), `${buyer} ${price}: ${f.title}`);
  }
  const edge = (o) => compute(o).findings.find((f) => /below GBP/.test(f.title))?.title;
  assert.match(edge({ price: 240000, buyer: "main", nonResident: "no" }), /below GBP 250,000\. Price above that is taxed at 5% instead of 2%; at exactly GBP 250,000 the tax would be GBP 2,500, GBP 200 more than now/);
  assert.equal(edge({ price: 240000, buyer: "ftb", nonResident: "no" }), undefined, "a first-time buyer pays 0% to 300,000, so 250,000 is not their edge");
  assert.match(edge({ price: 490000, buyer: "ftb", nonResident: "no" }), /relief is lost entirely, so the tax jumps to GBP 15,000/);
  assert.equal(edge({ price: 490000, buyer: "main", nonResident: "no" }), undefined, "500,000 is not a standard-rate edge");
});

test("tax is rounded down, and the marginal rate is a percentage", () => {
  assert.equal(sdlt(250030, "main", false).tax, 2501); // 2,501.50 down to whole pounds
  assert.equal(compute({ price: 300000, buyer: "main", nonResident: "no" }).marginal, 5);
  assert.equal(compute({ price: 1000000, buyer: "main", nonResident: "no" }).marginal, 10);
});

// Red team 2026-11-22: guards for mutants that escaped the suite above.
test("band rows stop exactly at each band edge", () => {
  const r = compute({ price: 1000000, buyer: "main", nonResident: "no" });
  assert.deepEqual(r.rows.map((x) => [x.from, x.to]), [[0, 125000], [125000, 250000], [250000, 925000], [925000, 1000000]]);
  assert.equal(sdlt(925019.5, "main", false).tax, 36251); // 36,251.95 down: an overlapping pound at 5% would tip it to 36,252
});

test("small positive amounts in the summary never carry a minus sign", () => {
  const t = summaryText(compute({ price: 125010, buyer: "main", nonResident: "no" }));
  assert.ok(t.includes("GBP 125,000 to GBP 125,010 at 2%: GBP 0.20"), t);
  assert.ok(!t.includes("-GBP"), t);
});

test("nonResident accepts true, 'yes' and 'true', and nothing else", () => {
  for (const v of [true, "yes", "true"]) assert.equal(parse({ price: 1, buyer: "main", nonResident: v }).nonResident, true, String(v));
  for (const v of [false, "no", "false", undefined, ""]) assert.equal(parse({ price: 1, buyer: "main", nonResident: v }).nonResident, false, String(v));
});

test("first-time buyer saving shows from the first pound above 300,000", () => {
  const saves = (price) => compute({ price, buyer: "ftb", nonResident: "no" }).findings.some((f) => f.title.startsWith("First-time buyer relief saves you"));
  assert.equal(saves(300000), false);
  assert.equal(saves(300001), true);
});

test("summary lists the first-time buyer price only when relief is possible", () => {
  assert.match(summaryText(compute({ price: 400000, buyer: "main", nonResident: "no" })), /Same price as a first-time buyer: GBP 5,000/);
  assert.doesNotMatch(summaryText(compute({ price: 600000, buyer: "main", nonResident: "no" })), /Same price as a first-time buyer/);
});

// Real defect 2026-11-22: the non-resident finding quoted 2% of the price in pence (GBP 5,001.98 at 250,099) while the bill, rounded down to whole pounds, rose by GBP 5,002.
test("non-resident surcharge finding quotes the same whole-pound difference as the bill", () => {
  for (const buyer of ["main", "ftb", "additional"]) for (const price of [250099, 300000.5, 39999, 450000, 600000]) {
    const yes = compute({ price, buyer, nonResident: "yes" });
    const no = compute({ price, buyer, nonResident: "no" });
    const f = yes.findings.find((x) => x.title.startsWith("The 2% non-UK resident surcharge adds"));
    assert.ok(f.title.includes(`adds GBP ${(yes.tax - no.tax).toLocaleString("en-GB")} to the bill`), `${buyer} ${price}: ${f.title}`);
  }
});

// Red team 2026-11-22 (second campaign): guards for five more escaped mutants, and one real defect.
test("a price of zero is rejected, not divided by", () => {
  assert.ok(compute({ ...SAMPLE, price: 0 }).errors.length);
  assert.ok(compute({ ...SAMPLE, price: "0" }).errors.length);
});

test("the worked example on the page is a 450,000 main-home purchase", () => {
  assert.deepEqual(SAMPLE, { price: 450000, buyer: "main", nonResident: "no" });
  assert.equal(run({}).price, 450000);
});

test("the below-40,000 note shows only for an additional property", () => {
  const note = (buyer) => compute({ price: 30000, buyer, nonResident: "no" }).findings.some((f) => f.title.startsWith("The 5% higher rate for additional dwellings only applies"));
  assert.equal(note("additional"), true);
  assert.equal(note("main"), false);
  assert.equal(note("ftb"), false);
});

test("a price exactly on a band edge is not 'GBP 0 below' that edge", () => {
  for (const price of [125000, 250000, 925000, 1500000]) {
    const r = compute({ price, buyer: "main", nonResident: "no" });
    assert.ok(!r.findings.some((f) => f.title.startsWith("You are GBP 0 below")), `${price}`);
  }
  assert.ok(!compute({ price: 300000, buyer: "ftb", nonResident: "no" }).findings.some((f) => /^You are GBP 0 below/.test(f.title)));
});

// Real defect 2026-11-22: below GBP 40,000 a main-home buyer was told they "may owe the 5% additional dwelling rate instead: GBP 0", a surcharge the calculator itself never charges there.
test("main-home buyers below 40,000 are told the additional rate does not apply", () => {
  const titles = compute({ price: 30000, buyer: "main", nonResident: "no" }).findings.map((f) => f.title);
  assert.ok(!titles.some((t) => t.includes("may owe the 5% additional dwelling rate")), titles.join("\n"));
  assert.ok(titles.some((t) => t.includes("does not apply below GBP 40,000")), titles.join("\n"));
  assert.ok(compute({ price: 40000, buyer: "main", nonResident: "no" }).findings.some((f) => f.title.includes("may owe the 5% additional dwelling rate instead: GBP 2,000")));
});

test("a slice of a pound or one pound into a band still shows as its own row (red team 2026-11-23)", () => {
  const one = compute({ price: 125001, buyer: "main" });
  assert.deepEqual(one.rows.at(-1), { from: 125000, to: 125001, rate: 0.02, amount: 1, tax: 0.02 });
  const half = compute({ price: 250000.5, buyer: "main" });
  assert.equal(half.rows.at(-1).amount, 0.5);
  assert.equal(half.rows.at(-1).rate, 0.05);
});
