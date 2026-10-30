import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REFLOW_CSS,
  TABLE_SCROLL_CLASS,
  WRAP_TABLES_JS,
  injectReflow,
  wrapTables,
} from './reflow.mjs';

const page = (body) => `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`;

test('a table is wrapped in a scrolling box', () => {
  const out = wrapTables('<p>before</p><table><tr><td>1</td></tr></table><p>after</p>');
  assert.equal(
    out,
    `<p>before</p><div class="${TABLE_SCROLL_CLASS}"><table><tr><td>1</td></tr></table></div><p>after</p>`,
  );
});

test('every table on the page is wrapped, attributes and all', () => {
  const out = wrapTables('<table id="a"><tbody></tbody></table><hr><TABLE class="b"></TABLE>');
  assert.equal(out.match(new RegExp(TABLE_SCROLL_CLASS, 'g')).length, 2);
  assert.ok(out.includes(`<div class="${TABLE_SCROLL_CLASS}"><table id="a">`));
  assert.ok(out.includes(`<div class="${TABLE_SCROLL_CLASS}"><TABLE class="b">`));
});

test('a nested table is left alone — it scrolls with the one around it', () => {
  const out = wrapTables('<table><tr><td><table><tr><td>x</td></tr></table></td></tr></table>');
  assert.equal(out.match(new RegExp(TABLE_SCROLL_CLASS, 'g')).length, 1);
  assert.ok(out.startsWith(`<div class="${TABLE_SCROLL_CLASS}"><table>`));
  // The inner table is still where it was, unwrapped.
  assert.ok(out.includes('<td><table><tr><td>x</td></tr></table></td>'));
});

test('a table inside a script is not rewritten', () => {
  // Several calculators assemble their results table as a string. Editing that
  // string is the build reaching into a venture's JavaScript; the runtime half
  // covers those tables instead.
  const source = '<script>el.innerHTML = `<table><tr><td>${n}</td></tr></table>`;</script>';
  assert.equal(wrapTables(source), source);
});

test('a table inside a comment, a style or a textarea is not rewritten', () => {
  for (const source of [
    '<!-- <table><tr><td>old markup</td></tr></table> -->',
    '<style>/* <table> */ table{width:100%}</style>',
    '<textarea><table><tr><td>pasted</td></tr></table></textarea>',
  ]) {
    assert.equal(wrapTables(source), source, source.slice(0, 20));
  }
});

test('markup around the skipped region is still wrapped', () => {
  const out = wrapTables('<script>var s="<table>";</script><table id="real"></table>');
  assert.equal(out.match(new RegExp(TABLE_SCROLL_CLASS, 'g')).length, 1);
  assert.ok(out.includes(`<div class="${TABLE_SCROLL_CLASS}"><table id="real">`));
  assert.ok(out.includes('var s="<table>";'));
});

test('a page with no table is returned unchanged, by identity', () => {
  const source = page('<p>no tables here</p>');
  assert.equal(wrapTables(source), source);
  assert.equal(injectReflow(source), source);
});

test('an unbalanced closing tag does not lose the rest of the document', () => {
  const out = wrapTables('</table><table id="b"></table><p>tail</p>');
  assert.ok(out.includes('<p>tail</p>'));
  assert.ok(out.includes(`<div class="${TABLE_SCROLL_CLASS}"><table id="b">`));
});

test('the pass is idempotent — running it twice changes nothing', () => {
  const once = injectReflow(page('<table><tr><td>1</td></tr></table>'));
  assert.notEqual(once, page('<table><tr><td>1</td></tr></table>'));
  assert.equal(injectReflow(once), once);
});

test('a fragment with no body is left alone', () => {
  const source = '<table><tr><td>1</td></tr></table>';
  assert.equal(injectReflow(source), source);
});

test('non-strings are returned as given', () => {
  for (const value of [null, undefined, 7, {}]) {
    assert.equal(injectReflow(value), value);
    assert.equal(wrapTables(value), value);
  }
});

test('the stylesheet makes the wrapper scroll and print whole', () => {
  assert.match(REFLOW_CSS, new RegExp(`\\.${TABLE_SCROLL_CLASS}\\{overflow-x:auto`));
  // A scroll container clips at the paper edge, and the customer's proposal is
  // printed from these pages.
  assert.match(REFLOW_CSS, /@media print\{[^}]*overflow-x:visible/);
});

test('a <pre> scrolls on screen and wraps on paper', () => {
  // Cause (3). The screen rule mirrors the table's: scroll the block, not the
  // page, so an install command stays copyable as the one line it was written
  // as. `vendor-change-watch` was 649px inside a 360px window on this.
  assert.match(REFLOW_CSS, /:where\(pre\)\{overflow-x:auto/);
  // Zero specificity, so a venture that styled its own <pre> still wins —
  // the same contract every other relaxation in this file signs.
  assert.ok(
    !/(^|[^:(\w])pre\{/.test(REFLOW_CSS.replace(/:where\(pre\)/g, '')),
    'the <pre> rule must only appear inside :where()',
  );
  // Paper cannot scroll, so the trade inverts: wrap rather than crop at the
  // edge of the sheet. `pre-wrap` still preserves every space and newline.
  const print = REFLOW_CSS.slice(REFLOW_CSS.indexOf('@media print{:where(pre)'));
  assert.match(print, /^@media print\{:where\(pre\)\{[^}]*white-space:pre-wrap/);
});

test('the min-width relaxations are zero-specificity and phone-only', () => {
  const narrow = REFLOW_CSS.slice(REFLOW_CSS.indexOf('@media (max-width:640px)'));
  assert.ok(narrow.includes('min-width:0'), 'the relaxation is inside the narrow-viewport query');
  // Every selector that relaxes a minimum is wrapped in :where(), so a rule a
  // venture wrote always wins. The 372 clipped result labels this file
  // documents are what happens when one of them is not.
  for (const line of narrow.split('\n')) {
    if (!line.includes('min-width:0')) continue;
    assert.match(line.trim(), /^:where\(/, `not zero-specificity: ${line.trim()}`);
  }
  // Never the leaf boxes whose own minimum is what keeps a definition list's
  // term column open.
  assert.ok(!/:where\([^)]*\bdt\b/.test(narrow));
  assert.ok(!/:where\(\*\)/.test(narrow), 'the blunt rule was measured and was worse than the bug');
});

test('headings may break a long word, and only where one would overflow', () => {
  // Cause (4): `vs-securityheaders.html` was 365px inside a 360px window, the
  // whole 5px coming from an <h1> naming a bare domain.
  assert.match(REFLOW_CSS, /:where\(h1,h2,h3,h4,h5,h6\)\{overflow-wrap:break-word\}/);

  // `anywhere` also shrinks min-content width, which resizes the heading's
  // flex/grid parent on every page. `break-word` does not, which is the whole
  // reason it is the one chosen.
  assert.ok(
    !/overflow-wrap:\s*anywhere/.test(REFLOW_CSS),
    'break-word is deliberate: anywhere would change layout everywhere to fix one page',
  );

  // Zero specificity, so a venture that set its own heading wrapping keeps it.
  const rule = REFLOW_CSS.split('\n').find((line) => /^\s*[^\s/*].*overflow-wrap:break-word/.test(line));
  assert.match(rule.trim(), /^:where\(/);

  // Not inside the narrow-viewport query: a token too long for the line is too
  // long at any width.
  const narrow = REFLOW_CSS.slice(REFLOW_CSS.indexOf('@media (max-width:640px)'));
  const narrowBlockEnd = narrow.indexOf('\n}');
  assert.ok(
    !narrow.slice(0, narrowBlockEnd).includes('overflow-wrap:break-word'),
    'heading wrapping must apply at every viewport, not only on a phone',
  );
});

test('inline code may break a long unbreakable flag or hostname, in body copy too', () => {
  // Cause (4) again: openapi-breaking-change-check/vs-oasdiff.html was 364px
  // inside a 360px window, the whole 4px coming from an inline
  // <code>--fail-on-breaking</code> in a <p>, not a heading and not a table.
  assert.match(REFLOW_CSS, /:where\(code\)\{overflow-wrap:break-word\}/);

  // Zero specificity, same reasoning as the heading rule: a venture that set
  // its own wrapping on a <code> element keeps it.
  const rule = REFLOW_CSS.split('\n').find((line) => /^\s*[^\s/*].*code.*overflow-wrap:break-word/.test(line));
  assert.match(rule.trim(), /^:where\(/);

  // Not inside the narrow-viewport query, for the same reason as headings: an
  // unbreakable token is too long at any width.
  const narrow = REFLOW_CSS.slice(REFLOW_CSS.indexOf('@media (max-width:640px)'));
  const narrowBlockEnd = narrow.indexOf('\n}');
  assert.ok(
    !narrow.slice(0, narrowBlockEnd).includes('code'),
    'code wrapping must apply at every viewport, not only on a phone',
  );
});

test('the runtime wrap skips a table that is already boxed', () => {
  // It is spliced into a function body in the built chrome script, so it has to
  // be ES5 statements and it has to test the class before wrapping — otherwise
  // every keystroke would add another div.
  assert.ok(WRAP_TABLES_JS.includes(TABLE_SCROLL_CLASS));
  assert.ok(WRAP_TABLES_JS.includes("p.closest('table')"), 'nested tables are skipped');
  assert.ok(!/\b(const|let|=>)\b/.test(WRAP_TABLES_JS), 'must stay ES5');
});

test('the runtime wrap boxes every table, including the first in the document', () => {
  // Run the spliced body against a minimal DOM. The loop counts down so that
  // inserting a box cannot shift the tables still to visit; an off-by-one in
  // its bound silently leaves the first table on the page unwrapped.
  const boxed = [];
  const mk = () => {
    const parent = {
      className: '',
      insertBefore(box) { boxed.push(box); },
    };
    return { parentElement: parent };
  };
  const tables = [mk(), mk(), mk()];
  const document = {
    getElementsByTagName: () => tables,
    createElement: () => ({ className: '', appendChild() {} }),
  };
  new Function('document', WRAP_TABLES_JS)(document);
  assert.equal(boxed.length, 3);
});

test('the scroll shadow is on the scrolling box, and form controls cap at the viewport', () => {
  assert.match(REFLOW_CSS, new RegExp(`\\.${TABLE_SCROLL_CLASS}\\[data-pf-scrollable\\]\\{box-shadow:inset -12px 0 8px -8px rgba\\(0,0,0,\\.28\\)\\}`));
  assert.match(REFLOW_CSS, /:where\(input,select,textarea\)\{min-width:0;max-width:100%\}/);
});
