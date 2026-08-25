import assert from 'node:assert/strict';
import { parseInputs, reconcile, reviewItems, summary } from './calc.mjs';

const parsed = parseInputs({ annualExpenses: '120000', rentableArea: '10000', tenantArea: '1000', billedAmount: '10000', credits: '500' });
assert.equal(parsed.ok, true);
const result = reconcile(parsed.values);
assert.equal(result.share, 0.1);
assert.equal(result.modeledShare, 12000);
assert.equal(result.netBilled, 9500);
assert.equal(result.variance, 2500);
assert.match(reviewItems(result).at(-1), /above net billed/);
assert.match(summary(result), /Tenant area share: 10.00%/);
assert.equal(parseInputs({ annualExpenses: '5', rentableArea: '0', tenantArea: '1', billedAmount: '2', credits: '0' }).ok, false);
assert.equal(parseInputs({ annualExpenses: '5', rentableArea: '10', tenantArea: '11', billedAmount: '2', credits: '0' }).ok, false);
console.log('cam reconciliation tests passed');
