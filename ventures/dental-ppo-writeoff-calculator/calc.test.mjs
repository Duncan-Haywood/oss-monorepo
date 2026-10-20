import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveReimbursement } from './calc.mjs';

/** The worked example the page opens on, so the tests and the page agree. */
const EXAMPLE = {
  plans: [
    { planName: 'Delta Premier', grossProduction: 48000, writeOff: 9600 },
    { planName: 'Delta PPO', grossProduction: 62000, writeOff: 24800 },
    { planName: 'Cigna', grossProduction: 31000, writeOff: 13950 },
    { planName: 'MetLife', grossProduction: 19000, writeOff: 6650 },
  ],
  selfPayProduction: 40000,
  chairHours: 640,
  providerCompensation: 52000,
  practiceOverhead: 61000,
  feeScheduleIncrease: 8,
};

const run = (over = {}) => effectiveReimbursement({ ...EXAMPLE, ...over });

test('the worked example computes', () => {
  const r = run();
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
});

test('gross production is insured plus self-pay', () => {
  const r = run();
  assert.equal(r.insuredGrossProduction, 160000);
  assert.equal(r.selfPayProduction, 40000);
  assert.equal(r.grossProduction, 200000);
});

test('net production is gross less every contractual write-off', () => {
  const r = run();
  assert.equal(r.totalWriteOff, 55000);
  assert.equal(r.netProduction, 145000);
});

test('the blended reimbursement rate is net over gross', () => {
  const r = run();
  assert.equal(r.blendedReimbursementRate, 0.725);
  assert.equal(r.writeOffRate, 0.275);
  // The two are complements: nothing else may sit between them.
  assert.equal(r.blendedReimbursementRate + r.writeOffRate, 1);
});

test('per-plan write-offs sum to the total', () => {
  const r = run();
  const summed = r.plans.reduce((s, p) => s + p.writeOff, 0);
  assert.equal(summed, r.totalWriteOff);
});

test('per-plan net production sums to net production less self-pay', () => {
  const r = run();
  const summed = r.plans.reduce((s, p) => s + p.netProduction, 0);
  assert.equal(summed, r.netProduction - r.selfPayProduction);
});

test('plans are ranked by write-off dollars, not by rate', () => {
  const r = run();
  assert.deepEqual(
    r.plans.map((p) => p.name),
    ['Delta PPO', 'Cigna', 'Delta Premier', 'MetLife'],
  );
  // Cigna has the worst rate and is second, which is the whole point of
  // ranking by dollars: the worst rate is not always the biggest problem.
  const worstRate = [...r.plans].sort((a, b) => a.reimbursementRate - b.reimbursementRate)[0];
  assert.equal(worstRate.name, 'Cigna');
  assert.notEqual(r.plans[0].name, worstRate.name);
});

test('a plan reimbursement rate is its own net over its own gross', () => {
  const r = run();
  const cigna = r.plans.find((p) => p.name === 'Cigna');
  assert.equal(cigna.reimbursementRate, 0.55);
  assert.equal(cigna.netProduction, 17050);
});

test('the allocation identity holds: net per chair hour is rate times gross per hour', () => {
  const r = run();
  for (const p of r.plans) {
    const expected = Math.round(p.reimbursementRate * r.grossProductionPerHour * 100) / 100;
    assert.equal(p.netPerChairHour, expected, `${p.name} breaks the allocation identity`);
  }
});

test('allocated hours sum to the insured share of chair hours', () => {
  const r = run();
  const summed = r.plans.reduce((s, p) => s + p.allocatedHours, 0);
  const insuredShare = (r.insuredGrossProduction / r.grossProduction) * r.chairHours;
  assert.ok(Math.abs(summed - insuredShare) < 0.05);
});

test('cost per chair hour is provider pay plus overhead over hours', () => {
  const r = run();
  assert.equal(r.costPerChairHour, 176.56);
  assert.equal(r.grossProductionPerHour, 312.5);
  assert.equal(r.netProductionPerHour, 226.56);
});

test('the break-even is a rate directly comparable to the plan rates', () => {
  const r = run();
  assert.equal(r.breakEvenReimbursementRate, 0.565);
  // Stated as a rate it must equal cost per hour over gross per hour.
  const expected = Math.round((r.costPerChairHour / r.grossProductionPerHour) * 10000) / 10000;
  assert.equal(r.breakEvenReimbursementRate, expected);
});

test('a plan below the break-even rate is named, and one above is not', () => {
  const r = run();
  assert.deepEqual(r.plansBelowBreakEven, ['Cigna']);
  assert.equal(r.productionBelowBreakEven, 31000);
  const delta = r.plans.find((p) => p.name === 'Delta PPO');
  assert.equal(delta.belowBreakEven, false);
});

test('the practice can cover its cost overall while one plan does not', () => {
  const r = run();
  assert.equal(r.coversCost, true);
  assert.equal(r.marginPerChairHour, 50);
  assert.ok(r.plansBelowBreakEven.length > 0);
});

test('concentration counts the plans making up half the write-off', () => {
  const r = run();
  // Delta PPO alone is 24800 of 55000, which is under half; with Cigna it is
  // 38750, which is over.
  assert.equal(r.plansToHalfTheWriteOff, 2);
});

test('a fee rise adds write-off on contracted production and collects nothing there', () => {
  const r = run();
  const f = r.feeRaiseImpact;
  assert.equal(f.addedGrossProduction, 16000);
  assert.equal(f.addedWriteOff, 12800);
  assert.equal(f.addedCollections, 3200);
  // The identity that makes the point: every added dollar of gross production
  // is either written off or collected, and 80% of it is written off.
  assert.equal(f.addedWriteOff + f.addedCollections, f.addedGrossProduction);
  assert.equal(f.contractedShareOfProduction, 0.8);
});

test('a practice with no self-pay production collects nothing from a fee rise', () => {
  const r = run({ selfPayProduction: 0 });
  assert.equal(r.feeRaiseImpact.addedCollections, 0);
  assert.equal(r.feeRaiseImpact.addedWriteOff, r.feeRaiseImpact.addedGrossProduction);
});

test('a zero fee rise moves nothing', () => {
  const r = run({ feeScheduleIncrease: 0 });
  assert.equal(r.feeRaiseImpact.addedGrossProduction, 0);
  assert.equal(r.feeRaiseImpact.addedWriteOff, 0);
  assert.equal(r.feeRaiseImpact.addedCollections, 0);
});

test('an all-self-pay practice has a 100% reimbursement rate and no write-off', () => {
  const r = effectiveReimbursement({
    plans: [{ planName: 'None', grossProduction: 0, writeOff: 0 }],
    selfPayProduction: 90000,
    chairHours: 400,
    providerCompensation: 24000,
    practiceOverhead: 30000,
    feeScheduleIncrease: 5,
  });
  assert.equal(r.ok, true);
  assert.equal(r.blendedReimbursementRate, 1);
  assert.equal(r.totalWriteOff, 0);
  assert.equal(r.feeRaiseImpact.addedCollections, 4500);
  assert.equal(r.feeRaiseImpact.addedWriteOff, 0);
});

test('a plan with no production this month is not called below break-even', () => {
  const r = run({
    plans: [...EXAMPLE.plans, { planName: 'Guardian', grossProduction: 0, writeOff: 0 }],
  });
  assert.equal(r.ok, true);
  assert.equal(r.planCount, 5);
  assert.ok(!r.plansBelowBreakEven.includes('Guardian'));
  const guardian = r.plans.find((p) => p.name === 'Guardian');
  assert.equal(guardian.belowBreakEven, false);
  // And it changes none of the practice-level arithmetic.
  assert.equal(r.grossProduction, 200000);
  assert.equal(r.totalWriteOff, 55000);
});

test('blank rows are skipped rather than rejected', () => {
  const r = run({
    plans: [
      ...EXAMPLE.plans,
      { planName: '', grossProduction: '', writeOff: '' },
      { planName: '   ', grossProduction: null, writeOff: null },
    ],
  });
  assert.equal(r.ok, true);
  assert.equal(r.planCount, 4);
});

test('a half-filled row is an error, naming the field', () => {
  const r = run({ plans: [{ planName: 'Aetna', grossProduction: 1000, writeOff: '' }] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.id === 'plan-0-writeOff'));
});

test('a write-off larger than its production is rejected as a period mismatch', () => {
  const r = run({ plans: [{ planName: 'Aetna', grossProduction: 1000, writeOff: 1200 }] });
  assert.equal(r.ok, false);
  assert.match(r.errors.find((e) => e.id === 'plan-0-writeOff').message, /same period/);
});

test('negative figures are rejected', () => {
  const negatives = [
    [{ chairHours: -1 }, 'chairHours'],
    [{ providerCompensation: -1 }, 'providerCompensation'],
    [{ practiceOverhead: -1 }, 'practiceOverhead'],
    [{ selfPayProduction: -1 }, 'selfPayProduction'],
  ];
  for (const [over, id] of negatives) {
    const r = run(over);
    assert.equal(r.ok, false, `${id} accepted a negative`);
    assert.ok(r.errors.some((e) => e.id === id), `${id} did not name itself`);
  }
});

test('zero chair hours is rejected rather than dividing by zero', () => {
  const r = run({ chairHours: 0 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.id === 'chairHours'));
});

test('an empty plan table asks for a plan', () => {
  const r = run({ plans: [] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.id === 'plan-0-planName'));
});

test('a fee increase outside 0-100 percent is rejected', () => {
  for (const value of [-1, 101]) {
    const r = run({ feeScheduleIncrease: value });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.id === 'feeScheduleIncrease'));
  }
});

test('currency formatting in the input is accepted', () => {
  const r = run({
    plans: [{ planName: 'Aetna', grossProduction: '$48,000', writeOff: '9,600' }],
    selfPayProduction: '$40,000',
  });
  assert.equal(r.ok, true);
  assert.equal(r.insuredGrossProduction, 48000);
});

test('a practice below cost is reported as such without being told what to do', () => {
  const r = run({ practiceOverhead: 130000 });
  assert.equal(r.ok, true);
  assert.equal(r.coversCost, false);
  assert.ok(r.marginPerChairHour < 0);
});

test('every plan share is a fraction of one', () => {
  const r = run();
  const production = r.plans.reduce((s, p) => s + p.shareOfProduction, 0);
  const writeOff = r.plans.reduce((s, p) => s + p.shareOfWriteOff, 0);
  assert.ok(Math.abs(production - r.insuredGrossProduction / r.grossProduction) < 0.001);
  assert.ok(Math.abs(writeOff - 1) < 0.001);
});

test('the annual figures are twelve times the period figures', () => {
  const r = run();
  assert.equal(r.annualWriteOff, r.totalWriteOff * 12);
  for (const p of r.plans) assert.equal(p.annualWriteOff, p.writeOff * 12);
});

test('shortfall to break-even is the rate gap times production, only for plans below it', () => {
  const r = effectiveReimbursement({
    plans: [
      { planName: 'Good', grossProduction: 50000, writeOff: 5000 },
      { planName: 'Thin', grossProduction: 40000, writeOff: 28000 },
    ],
    selfPayProduction: 10000,
    chairHours: 200,
    providerCompensation: 20000,
    practiceOverhead: 20000,
  });
  assert.equal(r.ok, true);
  const thin = r.plans.find((p) => p.name === 'Thin');
  const good = r.plans.find((p) => p.name === 'Good');
  // cost/hr 200, gross/hr 500 => break-even 0.4; Thin pays 0.3
  assert.equal(r.breakEvenReimbursementRate, 0.4);
  assert.equal(thin.shortfallToBreakEven, 4000);
  assert.equal(thin.payRiseToBreakEven, 0.3333);
  assert.equal(good.shortfallToBreakEven, 0);
  assert.equal(good.payRiseToBreakEven, null);
  assert.equal(r.totalShortfallToBreakEven, 4000);
  assert.equal(r.annualShortfallToBreakEven, 48000);
});
