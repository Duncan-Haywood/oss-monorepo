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
    ['visits', 'hours', 'rate', 'travel', 'parts', 'callbacks', 'callbackHours', 'callbackCost', 'overhead', 'margin', 'proposed', 'pullThrough', 'cancelMonths'],
  );
  // The Enter handler loops over the same `ids` array used to build the
  // calculatePlan() call, so a field added to one is covered by the other
  // without a second list to keep in sync.
  assert.match(scriptSource, /ids\.forEach\(id => \$\(id\)\.addEventListener\('keydown'/);
});

test('an invalid input hides stale results instead of leaving them next to a silent error', () => {
  // Before this fix, a rejected input (a negative number, non-numeric text)
  // overwrote only the break-even warning banner with the error sentence and
  // left every metric -- monthly price, floor, annual price, technician
  // hours, annual cost, effective revenue, and the copyable summary -- showing
  // the last valid calculation. A visitor could easily miss the message and
  // read those stale figures as the answer for what is now on screen.
  assert.match(html, /id="errors"[^>]*role="alert"/, 'a dedicated, announced error region is missing');
  const catchBlock = scriptSource.match(/\} catch\(error\)\{([\s\S]*?)\n {4}\} \}/);
  assert.ok(catchBlock, 'calculate() catch block not found');
  const body = catchBlock[1];
  for (const id of ['monthly', 'floor', 'annual', 'techHours', 'cost', 'effective', 'payback', 'ptFloor', 'ptProfit', 'summary']) {
    assert.match(
      body,
      new RegExp(`\\$\\("${id}"\\)\\.textContent\\s*=\\s*''`),
      `#${id} keeps its stale value instead of being cleared on a rejected input`,
    );
  }
  assert.match(body, /warning\.hidden\s*=\s*true/, 'the break-even warning is not hidden on a rejected input');
  assert.match(body, /errorsEl\.hidden\s*=\s*false/, 'the error message is never shown');
});

test('the cancellation banner is cleared with the rest of the stale result', () => {
  // The cancellation exposure is the most alarming number on the page. Leaving
  // it up beside a rejected input would read as a live verdict on figures the
  // calculator has just refused.
  const catchBlock = scriptSource.match(/\} catch\(error\)\{([\s\S]*?)\n {4}\} \}/);
  assert.ok(catchBlock, 'calculate() catch block not found');
  assert.match(catchBlock[1], /cancelNote\.hidden\s*=\s*true/);
  assert.match(catchBlock[1], /ptFloorMetric"\)\.hidden\s*=\s*true/);
});

test('the optional retention inputs are genuinely optional on the page', () => {
  // Both carry a placeholder rather than a value, so an untouched form prices
  // the plan fee alone -- the behaviour every existing user already relies on.
  assert.match(html, /<input id="pullThrough"[^>]*placeholder=/);
  assert.match(html, /<input id="cancelMonths"[^>]*placeholder=/);
  assert.equal(/<input id="pullThrough"[^>]*\svalue=/.test(html), false);
  assert.equal(/<input id="cancelMonths"[^>]*\svalue=/.test(html), false);
});

test('disclaimer and usage tracking are still present', () => {
  assert.match(html, /No warranty\./);
  assert.match(scriptSource, /recordUsage\(localStorage,false,'plan_calculated'\)/);
});

// Closest MEP sibling: same subcategory, but a one-off appliance repair call
// rather than a recurring HVAC maintenance plan. Related-tool chrome rotates
// inside the subcategory, so without an explicit one-hop a crawler on this
// page may never land on that tool.
test('index links one hop to the appliance-repair-quote-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/appliance-repair-quote-calculator\/"/,
    'index must link ../appliance-repair-quote-calculator/ so crawlers reach the appliance calculator in one hop',
  );
  assert.match(html, /appliance repair quote calculator/i);
});
