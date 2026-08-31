import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const scriptSource = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];

test('every tracked input recalculates on Enter, not only on the button click', () => {
  // There is no <form> wrapping these inputs, so a plain <input type="number">
  // swallows Enter by default. Editing a field (e.g. the target margin) and
  // pressing Enter -- the natural close-out on a phone's numeric keypad --
  // must reprice the plan exactly as clicking "Calculate maintenance plan"
  // does; otherwise the metrics keep showing the previous, now-wrong figures
  // with nothing on screen to say they are stale.
  assert.match(
    scriptSource,
    /ids\.forEach\(id => \$\(id\)\.addEventListener\('keydown', event => \{ if \(event\.key === 'Enter'\) \{ event\.preventDefault\(\); calculate\(\); \} \}\)\)/,
    'no per-input Enter-key handler calling calculate()',
  );
});

test('the Enter handler is attached to every id the calculation reads, not a hardcoded subset', () => {
  const idsDecl = scriptSource.match(/const ids = \[([^\]]+)\]/);
  assert.ok(idsDecl, 'ids array not found');
  const trackedIds = idsDecl[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1));
  assert.deepEqual(
    trackedIds,
    ['visits', 'hours', 'rate', 'travel', 'parts', 'callbacks', 'callbackHours', 'callbackCost', 'overhead', 'margin', 'proposed'],
  );
  // The Enter handler loops over the same `ids` array used to build the
  // calculatePlan() call, so a field added to one is covered by the other
  // without a second list to keep in sync.
  assert.match(scriptSource, /ids\.forEach\(id => \$\(id\)\.addEventListener\('keydown'/);
});

test('disclaimer and usage tracking are still present', () => {
  assert.match(html, /No warranty\./);
  assert.match(scriptSource, /recordUsage\(localStorage,false,'plan_calculated'\)/);
});

test('an invalid input clears every stale metric instead of leaving it next to the warning box', () => {
  // Before this fix, calculate()'s catch block only unhid #warning with the
  // error sentence. Monthly price, break-even floor, annual price,
  // technician hours, annual cost, effective revenue/hour, and the copyable
  // #summary all kept showing the last valid plan -- and `latest` stayed
  // set, so "Copy plan summary" could still copy that stale plan even
  // though the page no longer explains where the numbers came from.
  const catchMatch = scriptSource.match(/catch\(error\)\{([\s\S]*?)\n {4}\} \}/);
  assert.ok(catchMatch, 'calculate() catch block not found');
  const body = catchMatch[1];
  assert.match(body, /latest\s*=\s*undefined/, 'latest is not invalidated, so Copy plan summary can still copy a stale plan');
  for (const id of ['monthly', 'floor', 'annual', 'techHours', 'cost', 'effective', 'summary']) {
    assert.match(
      body,
      new RegExp(`\\$\\("${id}"\\)\\.textContent\\s*=\\s*''`),
      `#${id} keeps its stale value instead of being cleared on a rejected input`,
    );
  }
  assert.match(body, /\$\("warning"\)\.hidden\s*=\s*false/, 'the error message is never shown');
});
