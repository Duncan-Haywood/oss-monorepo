import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, invoiceText, scheduleCsv, normStatus, SAMPLE, SAMPLE_SETTINGS } from "./progress.mjs";

test("the worked example: $84,000 kitchen, 10% deposit spread, third stage billed now (hand sums)", () => {
  const r = compute(SAMPLE, SAMPLE_SETTINGS);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.stages.map((s) => s.value), [1260000, 1680000, 2520000, 2100000, 840000]);
  assert.deepEqual(r.stages.map((s) => s.credit), [126000, 168000, 252000, 210000, 84000]);
  // 25,200 - 2,520 deposit credit = 22,680 due.
  assert.deepEqual(r.invoice, { value: 2520000, credit: 252000, retainage: 0, net: 2268000 });
  assert.equal(r.totals.billedBefore, 2940000);
  assert.equal(r.totals.reachedValue, 5460000);
  assert.equal(r.totals.left, 2940000);
  assert.equal(r.totals.depositUnapplied, 294000);
  const text = invoiceText(r, { number: "3" });
  assert.match(text, /Amount due this invoice: \$22,680\.00/);
  assert.match(text, /Left to bill: \$29,400\.00/);
});

test("percent shares that add to 100% add to the contract to the cent (largest remainder)", () => {
  const r = compute("A,33.33%,done\nB,33.33%,\nC,33.34%,", { contract: "1000.01" });
  assert.equal(r.stages.reduce((a, s) => a + s.value, 0), 100001);
  assert.deepEqual(r.warnings.filter((w) => /add to/.test(w)), []);
  const thirds = compute("A,33.3333%,\nB,33.3333%,\nC,33.3334%,", { contract: "100" });
  assert.equal(thirds.stages.reduce((a, s) => a + s.value, 0), 10000);
});

test("a deposit spread pro rata sums to the deposit exactly", () => {
  const r = compute("A,1000\nB,1000\nC,1000.01", { contract: "3000.01", deposit: "1000" });
  assert.equal(r.stages.reduce((a, s) => a + s.credit, 0), 100000);
});

test("deposit on the first stage spills into the next when the first is smaller; 'last' works from the end", () => {
  const r = compute("Mobilize,5%,done\nRough,45%,\nFinish,50%,", { contract: "20000", deposit: "1500", depositApply: "first" });
  assert.deepEqual(r.stages.map((s) => s.credit), [100000, 50000, 0]);
  assert.equal(r.invoice.net, 0);
  assert.ok(r.warnings.some((w) => /more than the first stage/.test(w)));
  const l = compute("A,50%\nB,50%", { contract: "10000", deposit: "1000", depositApply: "last" });
  assert.deepEqual(l.stages.map((s) => s.credit), [0, 100000]);
});

test("retainage is held on each stage's value, not on the deposit, and rounded per stage", () => {
  const r = compute("Stage,Draw amount,Status\nFootings,12345.67,done\nFrame,20000,", { contract: "32345.67", retainage: "10%", deposit: "1000" });
  const first = r.stages[0];
  assert.equal(first.retainage, 123457);
  assert.equal(first.net, first.value - first.credit - first.retainage);
  assert.equal(r.totals.retainageHeld, 123457);
});

test("shares that miss the contract sum are named with the gap", () => {
  const under = compute("A,40%\nB,50%", { contract: "10000" });
  assert.ok(under.warnings.some((w) => /\$1,000\.00 less than the contract sum/.test(w)));
  const over = compute("A,6000\nB,6000", { contract: "10000" });
  assert.ok(over.warnings.some((w) => /\$2,000\.00 more than the contract sum/.test(w)));
});

test("bad input is refused with the reason, and nothing is computed", () => {
  assert.match(compute("A,25%", { contract: "" }).errors.join(" "), /Contract sum/);
  assert.match(compute("A,lots", { contract: "100" }).errors.join(" "), /not a percent or an amount/);
  assert.match(compute("A,", { contract: "100" }).errors.join(" "), /no share/);
  assert.match(compute("A,-5%", { contract: "100" }).errors.join(" "), /above zero/);
  assert.match(compute("", { contract: "100" }).errors.join(" "), /at least one stage/);
  assert.match(compute("A,100%", { contract: "100", deposit: "200" }).errors.join(" "), /more than the contract/);
  assert.match(compute("A,100%", { contract: "100", retainage: "150" }).errors.join(" "), /Retainage/);
  assert.match(compute("A,100%", { contract: "1e5" }).errors.join(" "), /Contract sum/);
});

test("statuses: billed, done and blank; a reached stage after an open one is flagged", () => {
  assert.equal(normStatus("Invoiced"), "billed");
  assert.equal(normStatus("x"), "done");
  assert.equal(normStatus(""), "open");
  const r = compute("A,50%,\nB,50%,done", { contract: "100" });
  assert.ok(r.warnings.some((w) => /B is marked reached while A/.test(w)));
  const none = compute("A,100%,", { contract: "100" });
  assert.ok(none.warnings.some((w) => /nothing to invoice now/.test(w)));
});

test("tab-separated paste with headers in another order reads by header", () => {
  const r = compute("Status\tMilestone\tPercent\ndone\tSlab\t50%\n\tTop out\t50%", { contract: "200000" });
  assert.deepEqual(r.stages.map((s) => [s.name, s.value, s.status]), [["Slab", 10000000, "done"], ["Top out", 10000000, "open"]]);
});

test("the schedule CSV neutralises formula cells", () => {
  const r = compute("=HYPERLINK(\"x\"),100%,done", { contract: "100" });
  const csv = scheduleCsv(r);
  assert.match(csv.split("\n")[1], /^"'=HYPERLINK/);
});
