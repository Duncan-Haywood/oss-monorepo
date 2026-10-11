import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, sampleInput, loanPayment, loanBalance, effectiveApr, resultText, resultCsv, serializeState, parseState, money, leasePayment } from "./calc.mjs";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test("the worked example matches the dealer formula by hand", () => {
  const R = solve({ ...sampleInput(), taxRate: 0 });
  // cap cost 33,000 + 895 capitalized fee; residual 60% of 35,000
  assert.equal(R.residual, 21000);
  close(R.adjCap, 33895);
  close(R.dep, (33895 - 21000) / 36);
  close(R.fin, (33895 + 21000) * 0.00125);
  close(R.pmt, 358.1944444 + 68.61875, 1e-4);
  close(R.stated, 3);
});

test("quoted-payment mode recovers the money factor that produced it", () => {
  for (const mf of [0, 0.0004, 0.00125, 0.0031]) {
    const A = solve({ ...sampleInput(), moneyFactor: mf });
    const B = solve({ ...sampleInput(), mode: "payment", quotedPayment: A.pmt });
    close(B.mf, mf, 1e-9);
    close(B.stated, mf * 2400, 1e-6);
  }
});

test("the effective APR is near the stated APR with no fees and rises with fees", () => {
  const base = { ...sampleInput(), acqFee: 0, dispositionFee: 0, taxRate: 0 };
  const clean = solve(base);
  assert.ok(Math.abs(clean.apr - clean.stated) < 0.35, `${clean.apr} vs ${clean.stated}`);
  const fees = solve({ ...base, acqFee: 895, acqCapitalized: false, dispositionFee: 395 });
  assert.ok(fees.apr > clean.apr + 0.3);
  const down = solve({ ...base, down: 3000 });
  assert.ok(down.apr > 0 && down.apr < 20);
});

test("a higher money factor never lowers the payment, and each lever moves the right way", () => {
  const a = solve(sampleInput());
  assert.ok(solve({ ...sampleInput(), moneyFactor: 0.002 }).pmt > a.pmt);
  assert.ok(solve({ ...sampleInput(), price: 31000 }).pmt < a.pmt);
  assert.ok(solve({ ...sampleInput(), residualPct: 65 }).pmt < a.pmt);
  assert.ok(solve({ ...sampleInput(), down: 2000 }).pmt < a.pmt);
  assert.ok(a.levers.per1000Price > 25 && a.levers.perMfPoint > 0 && a.levers.perResidualPoint > 0);
});

test("lever figures equal re-running the formula", () => {
  const a = solve(sampleInput());
  const b = solve({ ...sampleInput(), price: 32000 });
  close(a.levers.per1000Price, a.monthly - b.monthly, 1e-9);
});

test("markup against a base money factor is priced in dollars", () => {
  const R = solve(sampleInput());
  close(R.markup.mf, 0.00125 - 0.00085, 1e-12);
  close(R.markup.perMonth, (R.adjCap + R.residual) * 0.0004, 1e-9);
  close(R.markup.overTerm, R.markup.perMonth * 36, 1e-9);
  assert.ok(R.notes.some((n) => /above the base rate/.test(n)));
  const none = solve({ ...sampleInput(), baseMoneyFactor: "" });
  assert.equal(none.markup, undefined);
});

test("tax, due at signing and total lease cost add up", () => {
  const R = solve(sampleInput());
  close(R.tax, R.pmt * 0.07, 1e-9);
  close(R.driveOff, 0 + 300 + R.monthly, 1e-9); // fee capitalized, no down
  close(R.leaseTotal, 0 + 895 + 300 + R.monthly * 36 + 395 + R.overage, 1e-9);
  close(R.overMiles, 6000);
  close(R.overage, 6000 * 0.25, 1e-9);
});

test("buying comparison uses a standard amortizing loan", () => {
  close(loanPayment(10000, 0, 50), 200);
  close(loanPayment(30000, 6, 60), 579.98, 0.01);
  close(loanBalance(30000, 6, 60, 60), 0);
  close(loanBalance(30000, 6, 60, 0), 30000, 1e-6);
  const p = loanPayment(30000, 6, 60);
  close(loanBalance(30000, 6, 60, 1), 30000 * 1.005 - p, 1e-6);
  const R = solve({ ...sampleInput(), marketValue: 24000 });
  assert.equal(R.buy.marketValue, 24000);
  close(R.buy.net, R.buy.cashOut - 24000, 1e-9);
  assert.ok(R.buy.balance > 0);
});

test("equity matters: a car worth more than the residual favours buying", () => {
  const lo = solve({ ...sampleInput(), marketValue: 18000 });
  const hi = solve({ ...sampleInput(), marketValue: 26000 });
  assert.ok(hi.buy.net < lo.buy.net);
  assert.equal(hi.cheaper, "buy");
});

test("validation names the problem", () => {
  assert.match(solve({ ...sampleInput(), msrp: 0 }).errors.join(" "), /MSRP/);
  assert.match(solve({ ...sampleInput(), term: 5 }).errors.join(" "), /Term/);
  assert.match(solve({ ...sampleInput(), residualPct: 120 }).errors.join(" "), /Residual/);
  assert.match(solve({ ...sampleInput(), down: 40000 }).errors.join(" "), /cannot cover/);
  assert.match(solve({ ...sampleInput(), moneyFactor: -1 }).errors.join(" "), /Money factor/);
  assert.match(solve({ ...sampleInput(), mode: "payment", quotedPayment: 0 }).errors.join(" "), /Quoted payment/);
  assert.equal(solve({ ...sampleInput(), term: 36.5 }).ok, false);
});

test("a payment below straight depreciation is flagged, not hidden", () => {
  const R = solve({ ...sampleInput(), mode: "payment", quotedPayment: 300 });
  assert.ok(R.mf < 0);
  assert.ok(R.notes.some((n) => /negative money factor/.test(n)));
});

test("property: random leases are internally consistent", () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let k = 0; k < 300; k++) {
    const msrp = 20000 + rnd() * 80000;
    const raw = {
      ...sampleInput(), msrp, price: msrp * (0.85 + rnd() * 0.15), residualPct: 40 + rnd() * 35,
      term: 12 + Math.floor(rnd() * 5) * 6, moneyFactor: rnd() * 0.004, down: Math.floor(rnd() * 5) * 1000,
      acqCapitalized: rnd() < 0.5, taxRate: rnd() * 10,
    };
    const R = solve(raw);
    assert.ok(R.ok, JSON.stringify(R.errors));
    const lp = leasePayment({ adjCap: R.adjCap, residual: R.residual, term: raw.term, mf: raw.moneyFactor });
    close(R.pmt, lp.pmt, 1e-9);
    const Q = solve({ ...raw, mode: "payment", quotedPayment: R.pmt });
    close(Q.mf, raw.moneyFactor, 1e-9);
    if (R.apr !== null) {
      const back = effectiveApr({ value: raw.price, upfront: raw.down + (raw.acqCapitalized ? 0 : raw.acqFee), pmt: R.pmt, term: raw.term, endCost: R.residual + raw.dispositionFee });
      close(back, R.apr, 1e-9);
      assert.ok(R.apr >= R.stated - 1.5);
    }
  }
});

test("exports and saved files round-trip", () => {
  const R = solve(sampleInput());
  assert.match(resultText(R), /Money factor 0\.00125 = 3\.00% APR/);
  assert.match(resultCsv(R), /Payment before tax,426\.81/);
  const out = parseState(serializeState(sampleInput()));
  assert.equal(out.state.price, 33000);
  assert.match(parseState("nope").error, /not valid JSON/);
  assert.match(parseState('{"kind":"x"}').error, /not a saved lease/);
  assert.equal(money(-5), "-$5.00");
});
