import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftScope, quotedPrice } from './quote.mjs';
import { buildProposal, renderProposalHtml } from './proposal.mjs';
import { calculateBid } from './engine.mjs';

test('draft scope lists work and quantities, never crew hours or costs', () => {
  const scope = draftScope('Roofing', [
    { label: 'Tear off and re-roof', unit: 'sq', qty: '24', hoursPerUnit: '3.5', materialPerUnit: '110' },
    { label: 'Ridge vent', unit: 'ft', qty: 42.5, hoursPerUnit: 0.1, materialPerUnit: 4 },
    { label: 'Permit pull', unit: 'each', qty: 1 },
  ]);
  assert.deepEqual(scope, [
    'Tear off and re-roof: 24 sq',
    'Ridge vent: 42.5 ft',
    'Permit pull: 1',
    'Site protection and clean-up on completion',
  ]);
  assert.ok(!scope.join(' ').match(/110|3\.5|undefined|NaN/));
});

test('draft scope skips unnamed and zero-quantity lines and falls back to the trade name', () => {
  assert.deepEqual(draftScope('Fence install', [{ label: '', unit: 'ft', qty: 10 }, { label: 'Posts', unit: 'ea', qty: 0 }]),
    ['Fence install, labor and materials as agreed']);
  assert.deepEqual(draftScope('', []), []);
});

test('quoted price is the override when valid, else the calculated price', () => {
  assert.equal(quotedPrice(3437.5, '3450'), 3450);
  assert.equal(quotedPrice(3437.5, ''), 3437.5);
  assert.equal(quotedPrice(3437.5, '0'), 3437.5);
  assert.equal(quotedPrice(3437.5, '-5'), 3437.5);
  assert.equal(quotedPrice(3437.5, 'abc'), 3437.5);
  assert.equal(quotedPrice(3437.5, undefined), 3437.5);
});

test('the customer copy carries the price and scope but not the contractor costs', () => {
  const bid = calculateBid({ laborHours: 40, wage: 30, burdenPct: 25, materials: 1000, overheadPct: 10, marginPct: 20 });
  const p = buildProposal({
    companyName: 'Novak Roofing', clientName: 'R. Lindgren', price: quotedPrice(bid.price, ''),
    jobTitle: 'Roofing', scope: draftScope('Roofing', [{ label: 'Re-roof', unit: 'sq', qty: 20 }]),
    depositPercent: 30, validDays: 30, issuedOn: '2026-10-18',
  });
  const html = renderProposalHtml(p);
  assert.match(html, /Re-roof: 20 sq/);
  assert.match(html, new RegExp(bid.price.toLocaleString('en-US', { minimumFractionDigits: 2 })));
  assert.doesNotMatch(html, new RegExp(`${bid.walkAway.toLocaleString('en-US', { minimumFractionDigits: 2 })}`));
  assert.equal(p.pricing.depositAmount + p.pricing.balanceAmount, p.pricing.price);
});
