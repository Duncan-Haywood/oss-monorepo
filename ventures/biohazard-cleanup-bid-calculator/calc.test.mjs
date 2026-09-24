import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateJobBid, formatBidBreakdown, DEFAULTS, BREAKDOWN_DISCLAIMER } from './calc.mjs';

test('default inputs produce a positive, profitable price', () => {
  const r = calculateJobBid(DEFAULTS);
  assert.ok(r.price > 0);
  assert.ok(r.profit > 0);
  assert.ok(Math.abs(r.effectiveMarginPercent - DEFAULTS.targetMarginPercent) < 1);
});

test('labor cost is technicians times hours times rate', () => {
  const r = calculateJobBid(DEFAULTS);
  assert.equal(r.laborCost, DEFAULTS.technicianCount * DEFAULTS.hoursOnSitePerTechnician * DEFAULTS.laborRatePerHour);
});

test('disposal rounds up to a whole container, never billing a fractional one', () => {
  // 55 lb at 40 lb/container needs 2 containers, not 1.375.
  const r = calculateJobBid(DEFAULTS);
  assert.equal(r.containersNeeded, 2);
  assert.equal(r.disposalCost, 2 * DEFAULTS.costPerContainer);
});

test('waste that divides evenly needs exactly that many containers, no partial roundup beyond it', () => {
  const r = calculateJobBid({ ...DEFAULTS, biohazardWastePounds: 80 });
  assert.equal(r.containersNeeded, 2);
  assert.equal(r.unusedContainerCapacityPounds, 0);
});

test('zero waste needs zero containers and costs nothing to dispose', () => {
  const r = calculateJobBid({ ...DEFAULTS, biohazardWastePounds: 0 });
  assert.equal(r.containersNeeded, 0);
  assert.equal(r.disposalCost, 0);
});

test('the per-pound naive estimate undercounts disposal whenever a container is not full', () => {
  const r = calculateJobBid(DEFAULTS);
  // 55 lb naive: 55 * (110/40) = 151.25; real: 2 containers * 110 = 220.
  assert.ok(Math.abs(r.naiveDisposalCost - 151.25) < 1e-6);
  assert.equal(r.disposalCost, 220);
  assert.ok(r.disposalUndercount > 0);
  assert.ok(Math.abs(r.disposalUndercount - (r.disposalCost - r.naiveDisposalCost)) < 1e-6);
});

test('a naive per-pound estimate matches the real one only when waste divides evenly into whole containers', () => {
  const r = calculateJobBid({ ...DEFAULTS, biohazardWastePounds: 80 });
  assert.equal(r.disposalCost, r.naiveDisposalCost);
  assert.equal(r.disposalUndercount, 0);
});

test('PPE cost scales with technicians times decon cycles, not headcount alone', () => {
  const oneCycle = calculateJobBid({ ...DEFAULTS, deconCyclesPerTechnician: 1 });
  const threeCycles = calculateJobBid({ ...DEFAULTS, deconCyclesPerTechnician: 3 });
  assert.equal(oneCycle.ppeSets, DEFAULTS.technicianCount);
  assert.equal(threeCycles.ppeSets, DEFAULTS.technicianCount * 3);
  assert.equal(threeCycles.ppeCost, threeCycles.ppeSets * DEFAULTS.ppeCostPerSet);
  assert.ok(threeCycles.price > oneCycle.price);
});

test('a naive headcount-only PPE estimate undercounts once decon cycles exceed one', () => {
  const r = calculateJobBid({ ...DEFAULTS, deconCyclesPerTechnician: 2 });
  assert.equal(r.naivePpeCost, DEFAULTS.technicianCount * DEFAULTS.ppeCostPerSet);
  assert.ok(r.ppeUndercount > 0);
  assert.equal(r.ppeUndercount, r.ppeCost - r.naivePpeCost);
});

test('one decon cycle per technician matches the naive headcount-only PPE estimate exactly', () => {
  const r = calculateJobBid({ ...DEFAULTS, deconCyclesPerTechnician: 1 });
  assert.equal(r.ppeCost, r.naivePpeCost);
  assert.equal(r.ppeUndercount, 0);
});

test('a decon cycle count below 1 is rejected -- every technician dons at least once', () => {
  assert.throws(() => calculateJobBid({ ...DEFAULTS, deconCyclesPerTechnician: 0 }));
});

test('the minimum job fee floors a small-scope quote that would otherwise price below it', () => {
  const r = calculateJobBid({
    ...DEFAULTS,
    technicianCount: 1,
    hoursOnSitePerTechnician: 1,
    biohazardWastePounds: 5,
    minimumJobFee: 900,
  });
  assert.ok(r.marginPrice < 900);
  assert.equal(r.price, 900);
  assert.equal(r.minimumApplied, true);
});

test('a job priced above the minimum on cost-plus-margin is not floored', () => {
  const r = calculateJobBid(DEFAULTS);
  assert.equal(r.minimumApplied, r.marginPrice < DEFAULTS.minimumJobFee);
  if (!r.minimumApplied) assert.equal(r.price, r.marginPrice);
});

test('target margin at or above 100% is rejected rather than producing a negative or infinite price', () => {
  assert.throws(() => calculateJobBid({ ...DEFAULTS, targetMarginPercent: 100 }));
  assert.throws(() => calculateJobBid({ ...DEFAULTS, targetMarginPercent: 150 }));
});

test('checking a proposed price below direct cost reports a loss', () => {
  const r = calculateJobBid({ ...DEFAULTS, proposedPrice: 10 });
  assert.ok(r.proposed.belowDirectCost);
  assert.ok(r.proposed.profit < 0);
});

test('checking a proposed price equal to the quoted price agrees with the quoted profit', () => {
  const base = calculateJobBid(DEFAULTS);
  const r = calculateJobBid({ ...DEFAULTS, proposedPrice: base.price });
  assert.ok(Math.abs(r.proposed.profit - base.profit) < 1e-6);
});

test('omitting a proposed price leaves proposed as null', () => {
  const r = calculateJobBid(DEFAULTS);
  assert.equal(r.proposed, null);
});

test('non-numeric or negative inputs are rejected with a field-specific message', () => {
  assert.throws(() => calculateJobBid({ ...DEFAULTS, technicianCount: 'abc' }), /Technician count must be a number/);
  assert.throws(() => calculateJobBid({ ...DEFAULTS, technicianCount: 0 }), /Technician count must be greater than zero/);
  assert.throws(() => calculateJobBid({ ...DEFAULTS, laborRatePerHour: -1 }), /Labor rate must be at least 0/);
  assert.throws(() => calculateJobBid({ ...DEFAULTS, containerCapacityPounds: 0 }), /Container capacity \(lb\) must be greater than zero/);
});

test('every finding carries an id, severity, title, and detail', () => {
  const r = calculateJobBid({ ...DEFAULTS, deconCyclesPerTechnician: 2 });
  assert.ok(r.findings.length > 0);
  for (const f of r.findings) {
    assert.equal(typeof f.id, 'string');
    assert.equal(typeof f.severity, 'string');
    assert.equal(typeof f.title, 'string');
    assert.equal(typeof f.detail, 'string');
  }
});

test('formatBidBreakdown renders a plain-text summary carrying the disclaimer', () => {
  const r = calculateJobBid(DEFAULTS);
  const text = formatBidBreakdown(r);
  assert.match(text, /BIOHAZARD \/ TRAUMA-SCENE CLEANUP JOB BID/);
  assert.match(text, /Quoted price/);
  assert.ok(text.includes(BREAKDOWN_DISCLAIMER));
});

test('formatBidBreakdown notes when the minimum job fee was applied', () => {
  const r = calculateJobBid({
    ...DEFAULTS,
    technicianCount: 1,
    hoursOnSitePerTechnician: 1,
    biohazardWastePounds: 5,
    minimumJobFee: 900,
  });
  const text = formatBidBreakdown(r);
  assert.match(text, /minimum job fee applied/);
});
