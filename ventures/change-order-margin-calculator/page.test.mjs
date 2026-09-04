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

test('the schedule and cap fields are on the page and wired into the render loop', () => {
  for (const id of ['daysAdded', 'dailyGeneralConditions', 'markupCapPercent']) {
    assert.match(page, new RegExp(`id="${id}"`), `missing input: ${id}`);
    assert.match(page, new RegExp(`'${id}'`), `${id} is not in the id list update() reads`);
  }
  for (const id of ['delayCost', 'cappedPrice', 'marginAtCap']) {
    assert.match(page, new RegExp(`id="${id}"`), `missing readout: ${id}`);
  }
});

test('a cap below the overhead rate warns before a proposed price is entered', () => {
  // The cap is a fact about the contract, not about the price under
  // consideration, so gating this message on a proposed price would keep the
  // one case worth catching silent on a half-filled page.
  assert.match(page, /if\(r\.capBelowCost\)\{/);
  assert.match(page, /Every change order on this contract loses money at these rates\./);
});

test('no cap entered reads as "no cap", not $0.00', () => {
  assert.match(page, /r\.cappedPrice===null\?'no cap'/);
});

test('every visible FAQ question also appears in the FAQPage block', () => {
  // This page hand-authors its own FAQPage, so build.mjs does not derive one
  // and nothing else keeps the two in step -- the drift class fixed in #2497.
  const decode = (t) => t
    .replace(/&mdash;/g, '—').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const visible = [...page.matchAll(/<h3>([^<]+)<\/h3>/g)].map((m) => decode(m[1]));
  assert.ok(visible.length >= 9, `expected the FAQ to have grown, saw ${visible.length}`);
  const schema = page.slice(page.indexOf('"@type":"FAQPage"'));
  for (const question of visible) {
    assert.ok(
      schema.includes(JSON.stringify(question).slice(1, -1)),
      `visible question is missing from the FAQPage block: ${question}`,
    );
  }
});

test('the schedule cost is not also counted under "materials + subcontractor"', () => {
  // directCost carries delayCost now, and delayCost has a readout of its own,
  // so subtracting loaded labor alone showed the same dollars twice under a
  // label that does not describe them.
  assert.match(page, /money\(r\.directCost-r\.loadedLabor-r\.delayCost\)/);
});

test('the result panel is announced to screen readers when it updates', () => {
  // The result section re-renders the target price, the dl breakdown, and
  // the verdict banner in place on every keystroke, with no page reload.
  // The verdict div already carries its own aria-live, but the section as a
  // whole (including the target price and dl figures) did not, so a
  // screen-reader user changing an input heard the verdict sentence but not
  // the price it was based on.
  assert.match(
    page,
    /<section class="result" aria-live="polite">/,
    'the result section is not a live region, so updates are never announced',
  );
});
