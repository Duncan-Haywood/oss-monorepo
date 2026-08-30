// What this gate has to get right is not "does it find a dark colour" — it is
// the boundary between deciding and declining. Every false positive here costs
// a contributor an afternoon proving a page is fine; every false negative is a
// page shipped unreadable. Both directions are asserted.
//
// The four fixtures marked REGRESSION are the shapes that actually shipped to
// `main` and were caught by a browser run on 2026-08-30, transcribed down to
// the declarations that mattered. Their measured ratios are pinned against
// axe-core's, which is the only independent check this file has.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AA_NORMAL, UA_LINK, auditHtml, auditVentures, blend, contrast, luminance, parseHex, rules,
} from './ink.mjs';

const page = (css, body = '<p><a href="./x.html">a link</a></p>') =>
  `<!doctype html><html><head><style>${css}</style></head><body>${body}</body></html>`;

const ratios = (html) => auditHtml(html).findings.map((f) => f.ratio);
const selectors = (html) => auditHtml(html).findings.map((f) => f.selector);

test('parseHex expands the three-digit form', () => {
  assert.deepEqual(parseHex('#abc'), parseHex('#aabbcc'));
  assert.deepEqual(parseHex('#B35E2E'), [179, 94, 46]);
  assert.throws(() => parseHex('rebeccapurple'));
  assert.throws(() => parseHex('rgb(1,2,3)'));
});

test('luminance and contrast match the values WCAG defines', () => {
  assert.equal(luminance([0, 0, 0]), 0);
  assert.equal(luminance([255, 255, 255]), 1);
  // The extremes of the scale, and the threshold pair the spec is written around.
  assert.equal(contrast('#000000', '#ffffff'), 21);
  assert.equal(contrast('#ffffff', '#ffffff'), 1);
  // Order must not matter: the ratio is defined on the lighter of the two.
  assert.equal(contrast('#000000', '#ffffff'), contrast('#ffffff', '#000000'));
});

test('blend composites toward the background as alpha falls', () => {
  assert.equal(blend('#000000', '#ffffff', 1), '#000000');
  assert.equal(blend('#000000', '#ffffff', 0), '#ffffff');
  assert.equal(blend('#000000', '#ffffff', 0.5), '#808080');
});

test('rules keeps screen media queries and drops print ones', () => {
  const parsed = rules('a{color:#111} @media(max-width:700px){a{color:#222}} @media print{a{color:#333}}');
  assert.deepEqual(parsed.map((r) => r.decls.color), ['#111', '#222']);
});

test('rules splits a comma-separated selector into one record each', () => {
  const parsed = rules('.note, footer { opacity: .86; }');
  assert.deepEqual(parsed.map((r) => r.selector), ['.note', 'footer']);
});

// --- the three things it decides -------------------------------------------

test('REGRESSION: a page-wide link colour just under the threshold fails', () => {
  // music-lesson-break-even/how-to-price-music-lessons.html, as it shipped.
  const html = page(':root{color:#17211b;background:#f5f1e8}a{color:#ad613d}');
  assert.deepEqual(ratios(html), [4.09]);
  assert.deepEqual(selectors(html), ['a']);
});

test('REGRESSION: 4.49:1 fails and 4.61:1 passes, either side of one fix', () => {
  // translator-project-quote, whose accent missed by six hundredths of a ratio.
  const at = (c) => ratios(page(`:root{color:#18212b;background:#f5f1e8;--accent:${c}}a{color:var(--accent)}`));
  assert.deepEqual(at('#b64f2d'), [4.49]);
  assert.deepEqual(at('#b34e2c'), []);
});

test('REGRESSION: a container opacity fades a link below the threshold', () => {
  // medical-courier-route-margin as it shipped: the same #b35e2e measures
  // 4.2:1 on the page and 3.31:1 in the footer, because opacity composites the
  // whole subtree. Both the blended colour and the ratio below are the figures
  // axe-core reported in the browser, so this is a cross-engine pin and not
  // just this file agreeing with itself.
  const shipped = page(
    ':root{color:#17212b;background:#f2f5f3}a{color:#b35e2e}footer{opacity:.85}',
    '<footer><a href="./x.html">Use the calculator</a></footer>',
  );
  const found = auditHtml(shipped).findings;
  assert.deepEqual(found.map((f) => f.selector), ['a', 'footer a']);
  assert.equal(found[0].ratio, 4.2);
  assert.equal(found[1].effective, '#bc754c');
  assert.equal(found[1].ratio, 3.31);

  // The fix darkens the accent; the footer link then clears the bar too, which
  // is the half that says removing the fade was not the only thing needed.
  const fixed = page(
    ':root{color:#17212b;background:#f2f5f3}a{color:#a9592b}footer{color:#4c5b57}',
    '<footer><a href="./x.html">Use the calculator</a></footer>',
  );
  assert.deepEqual(auditHtml(fixed).findings, []);
  assert.ok(contrast('#a9592b', '#f2f5f3') > AA_NORMAL);
});

test('REGRESSION: an unstyled link on a dark container gets the browser default', () => {
  // hvac-maintenance-contract-calculator: header is #123c3a with white text,
  // no rule reaches the link inside it, so a browser paints #0000ee at 1.28:1.
  const html = page(
    ':root{color:#17202a;background:#eef3f1}header{background:#123c3a;color:#fff}',
    '<header><p><a href="./guide.html">How much to charge</a></p></header>',
  );
  const [finding] = auditHtml(html).findings;
  assert.equal(finding.selector, 'header a');
  assert.equal(finding.color, UA_LINK);
  assert.equal(finding.ratio, 1.29);
  assert.match(finding.note, /browser default/);
});

test('a container with no link in it raises nothing', () => {
  const html = page(
    ':root{color:#17202a;background:#eef3f1}header{background:#123c3a;color:#fff}',
    '<header><p>No link here.</p></header><p><a href="./x.html">outside</a></p>',
  );
  assert.deepEqual(selectors(html), []);
});

test('a rule that does colour the container\'s links is honoured', () => {
  const html = page(
    ':root{color:#17202a;background:#eef3f1}header{background:#123c3a;color:#fff}header a{color:#b7f1c8}',
    '<header><p><a href="./guide.html">readable</a></p></header>',
  );
  assert.deepEqual(selectors(html), []);
});

// --- the things it must NOT decide ------------------------------------------

test('a bare class is never judged against the page background', () => {
  // `.positive` only ever renders inside a dark `.result` panel. The stylesheet
  // cannot say so, so this must stay silent rather than guess — the mistake
  // that produced 510 findings against axe-core's zero.
  const html = page(
    ':root{color:#17212b;background:#f2f5f3}.result{background:#173b2b;color:#f5fff8}.positive{color:#a9e8b5}',
    '<section class="result"><span class="positive">+$40</span></section>',
  );
  assert.deepEqual(auditHtml(html).findings, []);
  assert.equal(auditHtml(html).outOfScope, 3);
});

test('a link inside a named dark box is judged against that box', () => {
  const html = page(
    ':root{color:#17212b;background:#eeecf8}.verdict{background:#241a52;color:#f5f2ff}.verdict a{color:#c9bcff}',
    '<section class="verdict"><a href="./x.html">sell here</a></section>',
  );
  assert.deepEqual(auditHtml(html).findings, []);
});

test('a later opacity:1 undoes an earlier fade rather than being ignored', () => {
  // invoice-payment-terms-calculator writes `.note, footer{opacity:.86}` and
  // then `footer{opacity:1}`. Reading only the first invents a fade.
  const css = ':root{color:#20352d;background:#e8f0ed}a{color:#176b53}'
    + '.note, footer{opacity:.86}footer{opacity:1;color:#344640}';
  const html = page(css, '<footer><a href="./x.html">terms</a></footer>');
  assert.deepEqual(auditHtml(html).findings, []);
});

test('an unresolvable colour is declined, not passed', () => {
  const html = page(':root{color:#111;background:#fff}a{color:var(--nope)}');
  const { findings, declined, decided } = auditHtml(html);
  assert.deepEqual(findings, []);
  assert.equal(decided, 0);
  assert.equal(declined.length, 1);
  assert.match(declined[0].why, /unresolvable/);
});

test('color:inherit is neither decided nor counted as a decline', () => {
  const html = page(':root{color:#111;background:#fff}a{color:inherit}');
  const { declined, decided } = auditHtml(html);
  assert.equal(decided, 0);
  assert.deepEqual(declined, []);
});

test('a page with no stylesheet, or no background, is declined not passed', () => {
  const bare = auditHtml('<!doctype html><html><body><a href="./x">hi</a></body></html>');
  assert.equal(bare.decided, 0);
  assert.match(bare.declined[0].why, /no inline stylesheet/);

  const noBg = auditHtml(page(':root{color:#111}a{color:#777}'));
  assert.equal(noBg.decided, 0);
  assert.match(noBg.declined[0].why, /no resolvable page background/);
});

// --- the shipped tree -------------------------------------------------------

test('every venture page currently on this branch clears 4.5:1 on its links', () => {
  // No argument: the default resolves `ventures/` from this file, so the audit
  // reads the same tree whether the suite is run from the repository root or
  // from `platform/pages` -- which is the directory `portfolio-pages.yml` runs
  // it in, and where passing 'ventures' threw ENOENT.
  const { findings, decided, pages } = auditVentures();
  assert.deepEqual(findings, [], findings.map((f) =>
    `${f.label} ${f.selector}: ${f.color} on ${f.background} = ${f.ratio}:1`).join('\n'));
  // A gate that silently stopped reading every page would also report zero.
  assert.ok(pages > 400, `expected the whole portfolio, saw ${pages} page(s)`);
  assert.ok(decided > 300, `expected to decide most link colours, decided ${decided}`);
});
