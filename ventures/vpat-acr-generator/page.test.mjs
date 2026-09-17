// Guards on the page wiring, which is where this tool has actually failed.
//
// `calc.mjs` is pure and thoroughly tested, and it was green for the whole
// time the product was dead. The defect was one line of DOM plumbing:
// per-criterion controls are addressed by ids that embed a WCAG criterion
// number (`level-1.1.1`, `remarks-2.4.7`), and those dots are CSS class
// separators. `document.querySelector('#level-1.1.1')` therefore does not
// return null -- it throws `SyntaxError: '#level-1.1.1' is not a valid
// selector`. That call sat in `currentInput()`, which runs on the `input`
// listener, on the Generate button, and on draft restore, so every path
// through the page threw on first use and nothing worked at all.
//
// Nothing caught it because no test in this venture had ever looked at the
// page: `calc.test.mjs` exercises `buildReport` directly and `usage.test.mjs`
// the counter. The catalogue-wide browser sweep found it the first time it
// ran over this venture, as a `pageerror`. These assertions are the cheap
// version -- they need no browser, so they run in the ordinary `node --test`
// pass rather than only in the 30-minute sweep.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { WCAG21_AA_CRITERIA } from './calc.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, 'index.html'), 'utf8');
const guide = readFileSync(join(here, 'why-procurement-rejects-a-vpat.html'), 'utf8');

const PAGES = [
  ['index.html', page],
  ['why-procurement-rejects-a-vpat.html', guide],
];

test('no criterion id is ever interpolated into a CSS selector', () => {
  // The exact shape of the defect: a selector string built from a criterion
  // id. `1.1.1` parses as `#level-1` plus two class selectors and throws.
  const interpolated = [...page.matchAll(/querySelector(?:All)?\(\s*[`'"][^`'"]*\$\{[^}]*\bc\.id\b/g)];
  assert.equal(
    interpolated.length,
    0,
    'a criterion id reached querySelector: ids containing dots are not valid ' +
      'CSS selectors and throw SyntaxError. Use getElementById.',
  );
});

test('per-criterion controls are addressed with getElementById', () => {
  for (const name of ['level-', 'remarks-']) {
    assert.match(
      page,
      new RegExp(`getElementById\\(|byId\\(\`${name}`),
      `${name}<id> controls must be looked up by id, not by selector`,
    );
  }
});

test('criterion ids really do contain the character that broke it', () => {
  // If the criterion set ever stopped using dotted ids the guard above would
  // quietly stop guarding anything. Pin the premise, not just the fix.
  assert.ok(WCAG21_AA_CRITERIA.length > 0, 'no criteria to check');
  assert.ok(
    WCAG21_AA_CRITERIA.every((c) => c.id.includes('.')),
    'criterion ids no longer contain dots -- re-read the selector guards above',
  );
});

test('every per-criterion control carries an accessible name naming its criterion', () => {
  // axe reported 100 critical `select-name` violations here: 50 rows, two
  // viewports. A screen reader user moving control to control heard "combo
  // box" fifty times with nothing to say which criterion each belonged to.
  // The visible cell beside the control is not a label.
  for (const control of ['Conformance level for', 'Remarks for']) {
    assert.match(
      page,
      new RegExp(`aria-label['"\`,\\s]*.{0,40}${control}`),
      `no aria-label naming the criterion on the "${control}" control`,
    );
  }
  assert.match(
    page,
    /setAttribute\('aria-label', `Conformance level for \$\{c\.id\} \$\{c\.name\}`\)/,
    'the select aria-label must name the criterion id and title',
  );
  assert.match(
    page,
    /setAttribute\('aria-label', `Remarks for \$\{c\.id\} \$\{c\.name\}`\)/,
    'the remarks aria-label must name the criterion id and title',
  );
});

test('both pages carry the no-warranty clause', () => {
  for (const [name, html] of PAGES) {
    assert.match(html, /No warranty\./, `${name} has no no-warranty clause`);
    assert.match(html, /accept no liability/, `${name} does not disclaim liability`);
  }
});

test('both pages keep the tool on the right side of its liability line', () => {
  // The whole product position: it formats and checks completeness, it never
  // assesses. A page that implied otherwise would be making a conformance
  // claim this portfolio is in no position to make.
  for (const [name, html] of PAGES) {
    assert.match(
      html,
      /does not (test|scan)|never (scans|selects|decides|picks)|does not scan/i,
      `${name} does not say the tool never assesses the product`,
    );
  }
});

test('both pages carry the ITI trademark notice', () => {
  for (const [name, html] of PAGES) {
    assert.match(html, /Information Technology Industry Council/, `${name} omits the ITI attribution`);
    assert.match(html, /not affiliated with/i, `${name} does not disclaim affiliation`);
  }
});

test('the guide page links back to the tool and the tool links to the guide', () => {
  assert.match(guide, /href="\.\/"/, 'the guide page never links back to the tool');
  assert.match(
    page,
    /href="\.\/why-procurement-rejects-a-vpat\.html"/,
    'the tool does not link to its guide page, so nothing can reach it',
  );
});

test('the guide page ships FAQ schema that matches its visible questions', () => {
  const ld = guide.match(/"@type":"FAQPage","mainEntity":\[([\s\S]*?)\]}<\/script>/);
  assert.ok(ld, 'no FAQPage JSON-LD on the guide page');
  const names = [...ld[1].matchAll(/"@type":"Question","name":"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(names.length >= 5, `expected several questions, got ${names.length}`);
  for (const name of names) {
    const visible = name.replace(/\\"/g, '"');
    assert.ok(
      guide.includes(`<h3>${visible}</h3>`),
      `"${visible}" is in the schema but is not a visible heading on the page`,
    );
  }
});
