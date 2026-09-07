import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('landing page exposes searchable product, full disclaimer, and local app', () => {
  assert.match(html, /CAM Reconciliation/);
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, financial, or real-estate advice/i);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /reconcile/);
  assert.match(html, /This is arithmetic, not a conclusion about what the lease allows/);
});

test('landing page exposes the optional occupancy gross-up fields, wires them to reconcile, and documents the clause', () => {
  assert.match(html, /id="variablePercent"/);
  assert.match(html, /id="actualOccupancyPercent"/);
  assert.match(html, /id="targetOccupancyPercent"/);
  assert.match(html, /variablePercent.*actualOccupancyPercent.*targetOccupancyPercent/s);
  assert.match(html, /What is a CAM gross-up/);
  assert.match(html, /"@type":"Question","name":"What is a CAM gross-up/);
});

test('the page offers a share link, reads one back, and says where the figures go', () => {
  assert.match(html, /id="copy-share-link"/);
  assert.match(html, /from '\.\/share\.mjs'/);
  assert.match(html, /decodeInputs\(window\.location\.hash\|\|window\.location\.search\)/);
  // The privacy claim has to move with the feature: a link is the one thing
  // that carries a visitor's figures off their device, and the page's own
  // "nothing leaves this browser" copy would be misleading without saying so.
  assert.match(html, /anyone holding the link can read them/);
  assert.match(html, /Can I send this reconciliation to the landlord/);
});

test('the share status line is announced rather than silently rewritten', () => {
  assert.match(html, /<p id="link-status"[^>]*role="status"[^>]*aria-live="polite">/);
});

test('the input id list is imported, never restated in the page script', () => {
  // CLAUDE.md records twice what a copied-instead-of-imported constant costs
  // here. If the page rebuilt its own field list, a new input would reach the
  // calculation and vanish from every share link with nothing to notice it.
  assert.match(html, /FIELD_IDS\.map\(id=>\[id,\$\(id\)\.value\]\)/);
  assert.doesNotMatch(
    html,
    /\['annualExpenses','rentableArea'/,
    'the page script should read FIELD_IDS from share.mjs rather than its own array',
  );
});

test('the page money formatter rounds to cents before deciding a sign, so a break-even variance never prints as -$0.00', () => {
  // `variance` is the one figure here that can be negative, and a
  // perfectly reconciled statement (billed to the exact cent of the
  // modeled share) routinely lands it a sub-cent residual below zero from
  // floating-point subtraction rather than a real shortfall --
  // `Intl.NumberFormat(...).format(-0.002)` prints "-$0.00" verbatim. See
  // calc.mjs's `moneyText` and its own regression tests for the reproduction
  // and the arithmetic; this just guards that the page's own formatter
  // wasn't left on the un-rounded call the fix replaced.
  assert.match(html, /const money=n=>\{const c=Math\.round\(n\*100\);return new Intl\.NumberFormat\('en-US',\{style:'currency',currency:'USD'\}\)\.format\(c===0\?0:c\/100\);\};/);
});

test('the transparent-result panel is an aria-live region so screen readers hear it appear', () => {
  // #output starts hidden and is revealed by script on submit, with no page
  // reload -- without aria-live a screen-reader user gets no announcement
  // that a reconciliation result now exists.
  assert.match(html, /<section id="output" class="hidden" aria-live="polite">/);
});

// Closest sibling: same private, browser-only reconciliation shape, but
// matching processor payouts to bank deposits rather than checking a
// landlord's CAM bill. Without a crawlable link here, a crawler entering on
// the CAM reconciliation calculator never reaches the payment reconciliation
// workbench in one hop.
test('index links one hop to the payment-reconciliation-workbench sibling', () => {
  assert.match(
    html,
    /href="\.\.\/payment-reconciliation-workbench\/"/,
    'index must link ../payment-reconciliation-workbench/ so crawlers reach the payment reconciliation workbench in one hop',
  );
});
