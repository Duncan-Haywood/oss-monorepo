import assert from 'node:assert/strict';
import { calculatePlan, compareOffer, DRAFT_KEY, DISCLAIMER, decodeShare, encodeShare, formatProposalSummary, inputIds, loadDraft, saveDraft, SHARE_FIELDS } from './app.js';

const plan = calculatePlan({ income: 6000, costs: 1800, hours: 160, utilization: 65, retainerHours: 20, buffer: 15 });
assert.equal(plan.capacity, 104);
assert.equal(plan.remainingCapacity, 84);
assert.equal(plan.target, 7800);
assert.equal(plan.rate, 75);
assert.equal(plan.retainer, 1725);
assert.equal(plan.committedHours, 0);
assert.equal(plan.bookedHours, 20);
assert.equal(plan.identicalRetainersThatFit, 5);
assert.equal(plan.fillRevenue, 8625);
assert.equal(plan.offer, null);
assert.ok(plan.concentration < 0.4);

const summary = formatProposalSummary({ income: '6000', costs: '1800', hours: '160', utilization: '65', retainerHours: '20', buffer: '15' }, plan, 'USD');
assert.match(summary, /Monthly price: \$1,725/);
assert.match(summary, /Billable utilization: 65%/);
assert.match(summary, /Hours already sold to other clients: 0/);
assert.match(summary, /Identical retainers that fit remaining capacity: 5/);
assert.doesNotMatch(summary, /Client offer comparison/);
assert.ok(summary.includes(DISCLAIMER));

assert.throws(() => calculatePlan({ income: 1, costs: 1, hours: 0, utilization: 50, retainerHours: 1, buffer: 0 }));
assert.throws(() => calculatePlan({ income: 6000, costs: 1800, hours: 160, utilization: 65, retainerHours: 105, buffer: 15 }), /only 104.0 billable hours/);
assert.throws(() => calculatePlan({ income: 6000, costs: 1800, hours: 160, utilization: 65, retainerHours: 20, buffer: 15, committedHours: 200 }), /already committed 200 hours/);
assert.throws(() => calculatePlan({ income: 6000, costs: 1800, hours: 160, utilization: 65, retainerHours: 80, buffer: 15, committedHours: 40 }), /only 64.0 billable hours remain after existing clients/);
assert.throws(() => calculatePlan({ income: 6000, costs: 1800, hours: 160, utilization: 65, retainerHours: 20, buffer: 15, offeredPrice: -10 }), /offered monthly price/);

const booked = calculatePlan({ income: 6000, costs: 1800, hours: 160, utilization: 65, retainerHours: 20, buffer: 15, committedHours: 40 });
assert.equal(booked.remainingAfterCommitted, 64);
assert.equal(booked.remainingCapacity, 44);
assert.equal(booked.bookedHours, 60);
assert.equal(booked.identicalRetainersThatFit, 3);
assert.equal(booked.fillRevenue, 5175);
assert.ok(booked.concentration < 0.4);

const concentrated = calculatePlan({ income: 6000, costs: 1800, hours: 160, utilization: 65, retainerHours: 50, buffer: 15 });
assert.ok(concentrated.concentration > 0.4);
assert.match(formatProposalSummary({ income: '6000', costs: '1800', hours: '160', utilization: '65', retainerHours: '50', buffer: '15' }, concentrated), /48% of billable capacity/);

const below = calculatePlan({ income: 6000, costs: 1800, hours: 160, utilization: 65, retainerHours: 20, buffer: 15, offeredPrice: 1400 });
assert.equal(below.offer.offeredPrice, 1400);
assert.equal(below.offer.gap, -325);
assert.equal(below.offer.belowFloor, true);
assert.equal(below.offer.effectiveIncluded, 70);
assert.equal(Math.round(below.offer.effectiveBuffered * 100) / 100, 60.87);
assert.equal(below.offer.hoursAtFloor, 16.2);
const belowSummary = formatProposalSummary({ income: '6000', costs: '1800', hours: '160', utilization: '65', retainerHours: '20', buffer: '15', offeredPrice: '1400' }, below);
assert.match(belowSummary, /Client offer comparison/);
assert.match(belowSummary, /This offer is below your planning floor/);
assert.match(belowSummary, /Hours you can include at your floor: 16.2/);

const atFloor = calculatePlan({ income: 6000, costs: 1800, hours: 160, utilization: 65, retainerHours: 20, buffer: 15, offeredPrice: 1725 });
assert.equal(atFloor.offer.belowFloor, false);
assert.equal(atFloor.offer.gap, 0);
assert.equal(atFloor.offer.hoursAtFloor, 20);
assert.match(formatProposalSummary({ income: '6000', costs: '1800', hours: '160', utilization: '65', retainerHours: '20', buffer: '15' }, atFloor), /meets or exceeds your planning floor/);

const above = calculatePlan({ income: 6000, costs: 1800, hours: 160, utilization: 65, retainerHours: 20, buffer: 15, offeredPrice: '2000' });
assert.equal(above.offer.belowFloor, false);
assert.equal(above.offer.gap, 275);

assert.equal(compareOffer({ retainer: 1725, rate: 75, retainerHours: 20, buffer: 0.15 }, ''), null);
assert.equal(compareOffer({ retainer: 1725, rate: 75, retainerHours: 20, buffer: 0.15 }, null), null);

const data = new Map();
const storage = { setItem: (key, value) => data.set(key, value), getItem: (key) => data.get(key) || null };
const draft = { income: '5000', costs: '900', hours: '140', utilization: '70', retainerHours: '16', buffer: '10', committedHours: '24', offeredPrice: '1200' };
assert.equal(saveDraft(draft, storage), true);
assert.deepEqual(loadDraft(storage), draft);
assert.equal(loadDraft({ getItem: () => '{broken' }), null);
assert.equal(data.has(DRAFT_KEY), true);

data.set(DRAFT_KEY, JSON.stringify({ income: '5000', costs: '900', hours: '140', utilization: '70', retainerHours: '16', buffer: '10' }));
const upgraded = loadDraft(storage);
assert.equal(upgraded.committedHours, '');
assert.equal(upgraded.offeredPrice, '');
assert.equal(calculatePlan(upgraded).committedHours, 0);
assert.equal(calculatePlan(upgraded).offer, null);

const shared = {
  income: '6000',
  costs: '1800',
  hours: '160',
  utilization: '65',
  retainerHours: '20',
  buffer: '15',
  committedHours: '40',
  offeredPrice: '1400',
  currency: 'EUR',
};
assert.deepEqual(decodeShare(encodeShare(shared)), shared);
assert.equal(encodeShare({ income: 6000, bogus: 'x' }), 'income=6000');
assert.deepEqual(decodeShare('#income=6000&offeredPrice=1400&secret=abc'), { income: '6000', offeredPrice: '1400' });
assert.deepEqual(decodeShare('?retainerHours=12&currency=GBP'), { retainerHours: '12', currency: 'GBP' });
assert.ok(SHARE_FIELDS.includes('committedHours'));
assert.ok(SHARE_FIELDS.includes('offeredPrice'));
assert.deepEqual(inputIds.slice(-2), ['committedHours', 'offeredPrice']);

console.log('freelance retainer calculator tests passed');
