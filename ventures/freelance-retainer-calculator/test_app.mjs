import assert from 'node:assert/strict';
import { calculatePlan, DRAFT_KEY, loadDraft, saveDraft } from './app.js';

const plan = calculatePlan({ income: 6000, costs: 1800, hours: 160, utilization: 65, retainerHours: 20, buffer: 15 });
assert.equal(plan.capacity, 104);
assert.equal(plan.target, 7800);
assert.equal(plan.rate, 75);
assert.equal(plan.retainer, 1725);
assert.throws(() => calculatePlan({ income: 1, costs: 1, hours: 0, utilization: 50, retainerHours: 1, buffer: 0 }));
const data = new Map();
const storage = { setItem: (key, value) => data.set(key, value), getItem: (key) => data.get(key) || null };
const draft = { income: '5000', costs: '900', hours: '140', utilization: '70', retainerHours: '16', buffer: '10' };
assert.equal(saveDraft(draft, storage), true);
assert.deepEqual(loadDraft(storage), draft);
assert.equal(loadDraft({ getItem: () => '{broken' }), null);
assert.equal(data.has(DRAFT_KEY), true);
console.log('freelance retainer calculator tests passed');
