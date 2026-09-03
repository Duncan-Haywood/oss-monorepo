import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('landing page exposes searchable product, full disclaimer, and local app', () => {
  assert.match(html, /Payment Reconciliation Workbench/);
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, financial, or accounting advice/i);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /src="app\.mjs"/);
  assert.match(html, /Download review CSV/);
  assert.match(html, /Files are never uploaded/);
});

test('the results panel wires every element app.mjs writes into', () => {
  // app.mjs reaches for these by id; a renamed or dropped element makes the
  // review queue silently stop updating, which no unit test would catch.
  for (const id of ['matched', 'unmatchedPayouts', 'unmatchedDeposits', 'explained', 'table', 'results', 'download', 'message', 'tolerance', 'usage']) {
    assert.match(html, new RegExp(`id="${id}"`), `index.html is missing #${id}`);
  }
  assert.match(html, /What to check/);
});

test('editing the tolerance and pressing Enter re-runs the match, not only the button click', () => {
  // #tolerance sits outside a <form>, so a plain <input type="number"> swallows
  // Enter by default. Once results are already showing, adjusting the
  // tolerance and pressing Enter -- the natural close-out on a phone's numeric
  // keypad -- must reprice the match exactly as clicking "Run reconciliation"
  // does, or the table keeps showing results from the old tolerance with
  // nothing on screen to say they are stale.
  const appSource = fs.readFileSync(new URL('./app.mjs', import.meta.url), 'utf8');
  assert.match(
    appSource,
    /\$\('tolerance'\)\.addEventListener\('keydown', event => \{ if \(event\.key === 'Enter'\) \{ event\.preventDefault\(\); run\(\); \} \}\)/,
    'no Enter-key handler on #tolerance calling run()',
  );
  assert.match(appSource, /\$\('run'\)\.addEventListener\('click', run\)/, 'run() is not shared between the click and Enter-key paths');
});
