import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('landing page exposes searchable product, full disclaimer, and local app', () => {
  assert.match(html, /Duplicate Payment Audit/);
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, financial, or accounting advice/i);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /src="app\.mjs"/);
  assert.match(html, /Download review CSV/);
  assert.match(html, /Files are never uploaded/);
  assert.match(html, /does not determine that any payment was fraudulent/i);
});

test('the results panel wires every element app.mjs writes into', () => {
  for (const id of ['checked', 'flagged', 'highConfidence', 'table', 'results', 'download', 'message', 'window', 'usage', 'ledger', 'run']) {
    assert.match(html, new RegExp(`id="${id}"`), `index.html is missing #${id}`);
  }
});

test('editing the date window and pressing Enter re-runs the check, not only the button click', () => {
  const appSource = fs.readFileSync(new URL('./app.mjs', import.meta.url), 'utf8');
  assert.match(
    appSource,
    /\$\('window'\)\.addEventListener\('keydown', event => \{ if \(event\.key === 'Enter'\) \{ event\.preventDefault\(\); run\(\); \} \}\)/,
    'no Enter-key handler on #window calling run()',
  );
  assert.match(appSource, /\$\('run'\)\.addEventListener\('click', run\)/, 'run() is not shared between the click and Enter-key paths');
});

test('index links one hop to the payment-reconciliation-workbench sibling', () => {
  assert.match(
    html,
    /href="\.\.\/payment-reconciliation-workbench\/"/,
    'index must link ../payment-reconciliation-workbench/ so crawlers reach the sibling AP tool in one hop',
  );
});
