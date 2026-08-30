import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('a saved draft is read back on load, not only written on change', () => {
  // Regression: update() has always written every field to
  // localStorage('change-order-draft') on each change, and the FAQ tells
  // the user their entries are "saved ... as a draft you can return to" --
  // but nothing ever called localStorage.getItem for that key, so a
  // returning user always saw the hardcoded HTML defaults instead of their
  // own numbers. The draft was write-only.
  assert.match(page, /function restoreDraft\(\)/);
  assert.match(page, /localStorage\.getItem\('change-order-draft'\)/);
  assert.match(page, /localStorage\.setItem\('change-order-draft'/);

  // restoreDraft() must run before the first update() so the initial
  // render reflects the restored values instead of the HTML defaults.
  const scriptStart = page.indexOf('<script type="module">');
  const restoreCallIndex = page.indexOf('restoreDraft();', scriptStart);
  const firstUpdateCallIndex = page.indexOf('update();', scriptStart);
  assert.ok(restoreCallIndex > scriptStart, 'restoreDraft() is called in the page script');
  assert.ok(
    restoreCallIndex < firstUpdateCallIndex,
    'restoreDraft() must run before the first update() call so the initial render uses restored values'
  );
});

test('restoreDraft only applies string field values from a well-formed saved object', () => {
  // A defensive parse guard: malformed or non-object JSON in localStorage
  // (private-browsing quirks, a stale schema, manual tampering) must not
  // throw during page load and must not overwrite fields with garbage.
  assert.match(page, /JSON\.parse\(localStorage\.getItem\('change-order-draft'\) \|\| 'null'\)/);
  assert.match(page, /if \(!saved \|\| typeof saved !== 'object'\) return;/);
  assert.match(page, /typeof saved\[id\] === 'string'/);
});

test('the live verdict is announced to assistive tech as it updates', () => {
  // The result panel re-renders on every keystroke via update(); the
  // verdict text (below cost / meets target / short of target) is the
  // single most important line and previously had no aria-live, so screen
  // reader users got no notification that pricing feedback had changed.
  const verdictStart = page.indexOf('id="verdict"');
  const verdictTagEnd = page.indexOf('>', verdictStart);
  const openTag = page.slice(page.lastIndexOf('<div', verdictStart), verdictTagEnd + 1);
  assert.match(openTag, /role="status"/);
  assert.match(openTag, /aria-live="polite"/);
});

test('the form still exposes every field the calculator and summary read', () => {
  const ids = ['title', 'hours', 'wage', 'burdenPercent', 'materials', 'subcontractor', 'overheadPercent', 'targetMarginPercent', 'proposedPrice'];
  for (const id of ids) {
    assert.match(page, new RegExp(`id="${id}"`), id);
  }
});
