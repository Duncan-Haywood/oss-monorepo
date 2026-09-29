import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseNumber, classifyItem, normalizeRows, analyze, sampleCsv } from "./calc.mjs";

const HEAD = "date,item type,item name,quantity,item price,discount code,shipping,currency,sub total,seller tax,marketplace tax,transaction fee,net amount,country,buyer email\n";
const load = (body, head = HEAD) => normalizeRows(parseCsv(head + body));
const near = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);
const row = (d, type, name, qty, price, ship, gross, fee, net, o = {}) =>
  `${d},${type},${name},${qty},${price},${o.code || ""},${ship},${o.cur || "USD"},${gross},0,${o.tax || 0},${fee},${net},${o.country || "United States"},${o.buyer || "b" + Math.random()}@x.invalid\n`;

test("item wording is classified", () => {
  assert.equal(classifyItem("album"), "digital");
  assert.equal(classifyItem("track"), "digital");
  assert.equal(classifyItem("Vinyl LP"), "physical");
  assert.equal(classifyItem("merch"), "physical");
  assert.equal(classifyItem("subscription"), "subscription");
  assert.equal(classifyItem(""), "none");
});

test("numbers accept currency symbols, commas, brackets and blanks", () => {
  assert.equal(parseNumber("$1,234.50"), 1234.5);
  assert.equal(parseNumber("(5)"), -5);
  assert.equal(parseNumber(""), 0);
  assert.ok(Number.isNaN(parseNumber("abc")));
});

test("no recognisable header gives a plain error; empty file too", () => {
  assert.match(normalizeRows(parseCsv("foo,bar\n1,2\n")).error, /No header row/);
  assert.match(normalizeRows([]).error, /empty/);
});

test("buyer text is not kept on any sale", () => {
  const n = load(row("2026-01-02", "album", "A", 1, 8, 0, 8, 1.53, 6.47, { buyer: "secret" }) + row("2026-01-03", "album", "A", 1, 8, 0, 8, 1.53, 6.47, { buyer: "secret" }));
  assert.equal(n.error, undefined);
  assert.ok(!JSON.stringify(n.members).includes("secret"));
  assert.equal(n.members[0].buyerId, n.members[1].buyerId);
});

test("totals reconcile: gross plus shipping minus fee equals net, and types add to net", () => {
  const n = load(row("2026-01-02", "album", "A", 1, 8, 0, 8, 1.5, 6.5) + row("2026-01-03", "vinyl", "LP", 2, 20, 5, 40, 6, 39) + row("2026-02-03", "track", "T", 1, 1, 0, 1, 0.4, 0.6));
  const r = analyze(n.members);
  near(r.summary.gross, 49);
  near(r.summary.net, 46.1);
  near(r.summary.net, r.summary.gross + r.summary.shipping - r.summary.fee);
  assert.equal(r.reconciles, true);
  assert.equal(r.summary.units, 4);
});

test("net is derived when the column is missing", () => {
  const head = "date,item type,item name,quantity,sub total,shipping,transaction fee\n";
  const n = normalizeRows(parseCsv(head + "2026-01-02,album,A,1,8.00,0,1.50\n"));
  assert.equal(n.error, undefined);
  near(n.members[0].net, 6.5);
});

test("refund rows are counted apart and left out of totals", () => {
  const n = load(row("2026-01-02", "album", "A", 1, 8, 0, 8, 1.5, 6.5) + row("2026-01-03", "album", "A", 1, 8, 0, -8, 0, -8));
  const r = analyze(n.members);
  assert.equal(r.summary.sales, 1);
  assert.equal(r.summary.refunds, 1);
  near(r.summary.refundNet, -8);
  near(r.summary.net, 6.5);
});

test("only the main currency is analysed and the rest is named", () => {
  const n = load(row("2026-01-02", "album", "A", 1, 8, 0, 8, 1.5, 6.5) + row("2026-01-03", "album", "A", 1, 8, 0, 8, 1.5, 6.5) + row("2026-01-04", "album", "A", 1, 8, 0, 8, 1.5, 6.5, { cur: "GBP" }));
  assert.equal(n.currency, "USD");
  assert.equal(n.members.length, 2);
  assert.deepEqual(n.otherCurrencies, [{ currency: "GBP", rows: 1 }]);
  assert.ok(n.skipped.some((s) => /GBP/.test(s.reason)));
});

test("unreadable dates and total rows are skipped with a reason", () => {
  const n = load("Total,,,,,,,,,,,,,,\n" + row("nope", "album", "A", 1, 8, 0, 8, 1.5, 6.5) + row("2026-01-02", "album", "A", 1, 8, 0, 8, 1.5, 6.5));
  assert.equal(n.members.length, 1);
  assert.equal(n.skipped.length, 2);
});

test("day-first dates are read when unambiguous", () => {
  const n = load(row("25/01/2026", "album", "A", 1, 8, 0, 8, 1.5, 6.5) + row("03/02/2026", "album", "A", 1, 8, 0, 8, 1.5, 6.5));
  assert.equal(n.dmy, true);
  assert.equal(new Date(n.members[1].date).toISOString().slice(0, 10), "2026-02-03");
});

test("small sales that lose more to the fixed fee are flagged only with enough of them", () => {
  let body = "";
  for (let i = 0; i < 6; i++) body += row("2026-01-0" + (i + 1), "track", "T", 1, 1, 0, 1, 0.45, 0.55);
  for (let i = 0; i < 6; i++) body += row("2026-02-0" + (i + 1), "album", "A", 1, 10, 0, 10, 1.6, 8.4);
  const r = analyze(load(body).members);
  assert.equal(r.micro.count, 6);
  assert.ok(r.findings.some((f) => f.severity === "high" && /under \$3\.00/.test(f.title)));
  const few = analyze(load(row("2026-01-01", "track", "T", 1, 1, 0, 1, 0.45, 0.55)).members);
  assert.ok(!few.findings.some((f) => /under \$3/.test(f.title)));
});

test("physical profit and break-even price use typed costs and the observed fee rate", () => {
  let body = "";
  for (let i = 0; i < 6; i++) body += row("2026-03-0" + (i + 1), "vinyl", "LP", 1, 20, 5, 20, 2.5, 22.5);
  const r = analyze(load(body).members, { unitCost: 10, postage: 6 });
  near(r.physical.costs, 6 * 10 + 6 * 6);
  near(r.physical.profit, 6 * 22.5 - 96);
  const rate = 15 / 150;
  near(r.physical.feeRate, rate, 1e-9);
  near(r.physical.breakEven, (10 + (6 * 6 - 30) / 6) / (1 - rate), 1e-9);
  assert.equal(analyze(load(body).members, { unitCost: -1 }).invalid, "Unit cost must be a number, zero or more.");
});

test("repeat buyers are counted from anonymous ids", () => {
  let body = "";
  for (let i = 0; i < 20; i++) body += row("2026-01-02", "album", "A", 1, 8, 0, 8, 1.5, 6.5, { buyer: "u" + (i % 10) });
  const r = analyze(load(body).members);
  assert.equal(r.summary.buyers, 10);
  assert.equal(r.summary.repeatBuyers, 10);
});

test("the built-in example parses cleanly and reconciles", () => {
  const n = normalizeRows(parseCsv(sampleCsv()));
  assert.equal(n.error, undefined);
  assert.equal(n.skipped.length, 0);
  const r = analyze(n.members, { unitCost: 9, postage: 4 });
  assert.equal(r.reconciles, true);
  assert.ok(r.findings.length >= 3);
});
