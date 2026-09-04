import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HIGHLIGHT_PROMISE,
  INVALID_MATCH_FLOOR,
  INVALID_MODULE_FILE,
  INVALID_STYLE_FILE,
  MATCH_FLOOR,
  NO_FIELD_LABEL,
  injectInvalidField,
  labelWords,
  messageSubject,
  normalizeLabel,
  pagePromisesHighlight,
  renderInvalidModule,
  renderInvalidStyle,
  scoreMatch,
} from './invalid.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VENTURES = path.join(HERE, '..', '..', 'ventures');

const page = (body, head = '') =>
  `<!doctype html><html><head><title>t</title>${head}</head><body>${body}</body></html>`;

const promising = page(
  `<div id="price" class="hero-number">$1</div><div id="priceLabel">${HIGHLIGHT_PROMISE}</div>`,
);

// ---------------------------------------------------------------------------
// Reading the message
// ---------------------------------------------------------------------------

test('normalizeLabel keeps the unit and drops the punctuation around it', () => {
  // A "%" leaves nothing behind; a "(sq ft)" is sometimes the only word the
  // label and the message share (see `deck-staining-bid-calculator`).
  assert.equal(normalizeLabel('Payroll burden (%)'), 'payroll burden');
  assert.equal(normalizeLabel('Walking surface (sq ft)'), 'walking surface sq ft');
  assert.equal(normalizeLabel('Hours / infill ft'), 'hours infill ft');
  assert.equal(normalizeLabel(null), '');
});

test('labelWords keeps only the words that carry identity', () => {
  assert.deepEqual(labelWords('Hours per post'), ['hour', 'post']);
  assert.deepEqual(labelWords('Overhead on direct cost (%)'), ['overhead', 'direct', 'cost']);
});

test('labelWords expands the abbreviations a form uses and a message does not', () => {
  // The real pair from `countertop-bid-calculator`: the label is "Finished top
  // sq ft" and the rejection is "Finished square feet must be at least 0".
  assert.deepEqual(labelWords('Finished top sq ft'), ['finished', 'top', 'square', 'feet']);
  assert.deepEqual(labelWords('Gutter lf'), ['gutter', 'linear', 'feet']);
  assert.deepEqual(labelWords('Walk gates'), ['walk', 'gate']);
  // `min` is left alone on purpose: "minutes" on one tool, "minimum" on the next.
  assert.deepEqual(labelWords('Min charge'), ['min', 'charge']);
});

test('folding a plural never re-admits a stop word', () => {
  // `singular('this')` is "thi", which is in no stop list.
  assert.deepEqual(labelWords('this is the cost'), ['cost']);
});

test('messageSubject strips the complaint and keeps the field', () => {
  assert.deepEqual(messageSubject('Crew hourly wage must be a number'), {
    scope: '', subject: 'Crew hourly wage',
  });
  assert.deepEqual(messageSubject('Linear feet must be at least 0'), {
    scope: '', subject: 'Linear feet',
  });
  assert.deepEqual(messageSubject('Return rate cannot exceed 100%'), {
    scope: '', subject: 'Return rate',
  });
});

test('messageSubject splits the row prefix a repeated-row calculator writes', () => {
  // The exact sentence `fence-bid-calculator` produced in Chromium when a run's
  // linear feet were set to -5.
  assert.deepEqual(messageSubject('Wood privacy, 6 ft: linear feet must be at least 0'), {
    scope: 'Wood privacy, 6 ft', subject: 'linear feet',
  });
});

test('messageSubject keeps a whole sentence that names no field', () => {
  const parsed = messageSubject('Add at least one fence run to price');
  assert.equal(parsed.subject, 'Add at least one fence run to price');
});

test('messageSubject is empty for an empty message', () => {
  assert.deepEqual(messageSubject(''), { scope: '', subject: '' });
  assert.deepEqual(messageSubject(undefined), { scope: '', subject: '' });
});

// ---------------------------------------------------------------------------
// Matching it to a field
// ---------------------------------------------------------------------------

test('scoreMatch puts the named field above every other field on the page', () => {
  const subject = messageSubject('Crew hourly wage must be a number').subject;
  const labels = [
    'Crew hourly wage',
    'Payroll burden (%)',
    'Overhead on direct cost (%)',
    'Target net margin (%)',
    'Permits, dump, travel, extras',
  ];
  const scores = labels.map((label) => scoreMatch(subject, label));
  assert.equal(Math.max(...scores), scores[0]);
  assert.ok(scores[0] >= MATCH_FLOOR, `expected a match, got ${scores[0]}`);
  assert.ok(scores.slice(1).every((score) => score < MATCH_FLOOR));
});

test('scoreMatch is not fooled by the shorter label that shares a word', () => {
  // The failure this weighting exists to prevent: recall alone makes "Hours"
  // a perfect match for "hours per post", because every word of the subject
  // that matters appears in it.
  const subject = messageSubject('hours per post must be at least 0').subject;
  assert.ok(scoreMatch(subject, 'Hours / post') > scoreMatch(subject, 'Hours'));
  assert.ok(scoreMatch(subject, 'Hours / post') > scoreMatch(subject, 'Hours / walk gate'));
});

test('scoreMatch tolerates the wording drift between calc.mjs and the form', () => {
  // Real pairs: the message names the quantity, the label names the input.
  const pairs = [
    ['Target margin must be less than 100%', 'Target net margin (%)'],
    ['Payroll burden must be at least 0', 'Payroll burden (%)'],
    ['linear feet must be at least 0', 'Linear feet'],
    ['Post spacing must be greater than zero', 'Post spacing (ft)'],
  ];
  for (const [message, label] of pairs) {
    const score = scoreMatch(messageSubject(message).subject, label);
    assert.ok(score >= MATCH_FLOOR, `${message} vs ${label} scored ${score}`);
  }
});

test('scoreMatch clears the floor on the two drifts measured in the browser', () => {
  // countertop-bid-calculator: the form abbreviates what the sentence spells.
  // deck-staining-bid-calculator: the unit is the only word they share.
  const cases = [
    ['Finished square feet must be at least 0', 'Finished top sq ft'],
    ['Deck square feet must be at least 0', 'Walking surface (sq ft)'],
  ];
  for (const [message, label] of cases) {
    const score = scoreMatch(messageSubject(message).subject, label);
    assert.ok(score >= MATCH_FLOOR, `${message} vs ${label} scored ${score}`);
  }
});

test('a message about the form as a whole matches no field', () => {
  const subject = messageSubject('Add at least one fence run to price').subject;
  const labels = ['Linear feet', 'Corners', 'Walk gates', 'Crew hourly wage', 'Post spacing (ft)'];
  for (const label of labels) {
    assert.ok(scoreMatch(subject, label) < MATCH_FLOOR, `${label} scored too high`);
  }
});

test('scoreMatch is zero when there is nothing to compare', () => {
  assert.equal(scoreMatch('', 'Linear feet'), 0);
  assert.equal(scoreMatch('Linear feet', ''), 0);
  assert.equal(scoreMatch('the of per', 'Linear feet'), 0);
});

// ---------------------------------------------------------------------------
// The injection
// ---------------------------------------------------------------------------

test('pagePromisesHighlight gates on the sentence the family prints', () => {
  assert.equal(pagePromisesHighlight(promising), true);
  assert.equal(pagePromisesHighlight(page('<p>no promise here</p>')), false);
  assert.equal(pagePromisesHighlight(null), false);
});

test('injectInvalidField adds the script and the stylesheet exactly once', () => {
  const once = injectInvalidField(promising);
  assert.ok(once.includes(`src="./${INVALID_MODULE_FILE}"`));
  assert.ok(once.includes(`href="./${INVALID_STYLE_FILE}"`));
  assert.equal(once.split(INVALID_MODULE_FILE).length - 1, 1);
  assert.equal(injectInvalidField(once), once, 'the pass must be safe to run twice');
});

test('injectInvalidField honours the path back to the site root', () => {
  const out = injectInvalidField(promising, '../../');
  assert.ok(out.includes(`src="../../${INVALID_MODULE_FILE}"`));
  assert.ok(out.includes(`href="../../${INVALID_STYLE_FILE}"`));
});

test('injectInvalidField leaves a page that promises nothing alone', () => {
  const plain = page('<form><input id="a" type="number"></form>');
  assert.equal(injectInvalidField(plain), plain);
});

test('injectInvalidField leaves markup it cannot attach to alone', () => {
  assert.equal(injectInvalidField(`<div>${HIGHLIGHT_PROMISE}</div>`), `<div>${HIGHLIGHT_PROMISE}</div>`);
  assert.equal(injectInvalidField(42), 42);
});

test('a page with no head still gets the stylesheet, ahead of the script', () => {
  const out = injectInvalidField(`<body><p>${HIGHLIGHT_PROMISE}</p></body>`);
  assert.ok(out.indexOf(INVALID_STYLE_FILE) < out.indexOf(INVALID_MODULE_FILE));
});

test('the script tag is the last thing before </body>', () => {
  // It runs after the venture's own deferred module, which is what builds the
  // form it reads. Earlier and there would be no fields to match against.
  const out = injectInvalidField(promising);
  assert.match(out, new RegExp(`${INVALID_MODULE_FILE}[^]*</script>\\s*</body>`));
});

// ---------------------------------------------------------------------------
// The shipped runtime
// ---------------------------------------------------------------------------

test('the module ships the tested matching functions, not a paraphrase', () => {
  const script = renderInvalidModule();
  for (const name of ['normalizeLabel', 'labelWords', 'messageSubject', 'scoreMatch', 'singular']) {
    assert.ok(script.includes(`var ${name} =`), `${name} is missing from the shipped module`);
  }
  assert.ok(script.includes(`var MATCH_FLOOR = ${MATCH_FLOOR};`));
  assert.ok(script.includes(`var INVALID_MATCH_FLOOR = ${INVALID_MATCH_FLOOR};`));
  // The abbreviation table has to cross into the browser with the functions
  // that read it; without it the shipped matcher is a different matcher.
  assert.ok(script.includes('var SYNONYMS = new Map('));
  assert.ok(script.includes('"sq"'), 'the abbreviation table did not ship');
});

test('native validity is a tie-breaker, never an answer on its own', () => {
  // The regression this guards: returning the page's single natively-invalid
  // control outright marked an unrelated out-of-range field for *every*
  // message, "Add at least one fence run to price" included. Reproduced in
  // Chromium on fence-bid-calculator before the rewrite.
  assert.ok(INVALID_MATCH_FLOOR < MATCH_FLOOR);
  const script = renderInvalidModule();
  assert.ok(script.includes('bestScore >= MATCH_FLOOR'));
  assert.ok(script.includes('broken.length === 1 && best === broken[0]'));
});

test('the shipped module is syntactically valid JavaScript', () => {
  // It is assembled from a template literal, so a stray backtick in a comment
  // inside it ends the string and the file stops parsing — which is what
  // happened while the usage counter was being added. `new Function` compiles
  // without running, which is all that can be checked outside a browser.
  assert.doesNotThrow(() => new Function(renderInvalidModule()));
});

test('the module never moves focus', () => {
  // The visitor is usually typing in the field that is wrong; taking focus
  // would eat the next keystroke. Asserted on the source because the failure
  // is silent and only reproducible mid-keystroke.
  const script = renderInvalidModule();
  assert.equal(script.includes('.focus()'), false);
});

test('the module is defensive about the page it lands on', () => {
  const script = renderInvalidModule();
  assert.ok(script.includes('catch'), 'a throw here would take the calculator with it');
  assert.ok(script.includes('aria-invalid'));
  assert.ok(script.includes(NO_FIELD_LABEL));
});

test('the counter honours the same opt-outs as the rest of the site', () => {
  const script = renderInvalidModule();
  assert.ok(script.includes("'portfolio-hub-usage'"), 'counts must land in the site-wide key');
  assert.ok(script.includes("'portfolio-hub-optout'"));
  assert.ok(script.includes('doNotTrack'));
  assert.ok(script.includes('globalPrivacyControl'));
  // The unattributable case is the maintenance signal; losing it would make a
  // matcher that has quietly stopped matching indistinguishable from a site
  // where nobody mistypes.
  assert.ok(script.includes('invalid_no_field'));
  assert.ok(script.includes('invalid_field_marked'));
});

test('the module ignores the site chrome the build injects', () => {
  // The shop-rates bar carries an input labelled "Crew hourly wage" — the exact
  // text a wage message matches. Marking it would point the contractor at the
  // wrong box on a band that is not the calculator.
  assert.ok(renderInvalidModule().includes("indexOf('pf-') === 0"));
});

test('the stylesheet marks without reflowing, and never prints', () => {
  const css = renderInvalidStyle();
  assert.ok(css.includes('.pf-invalid-field'));
  assert.ok(css.includes('outline'), 'an outline does not change layout; a border would');
  assert.ok(css.includes('@media print'));
  assert.ok(css.includes('prefers-color-scheme:dark'));
});

// ---------------------------------------------------------------------------
// The family this is for
// ---------------------------------------------------------------------------

test('every venture that promises a highlight is covered by the gate', async () => {
  const slugs = await fs.readdir(VENTURES, { withFileTypes: true });
  const promisers = [];
  for (const entry of slugs) {
    if (!entry.isDirectory()) continue;
    const file = path.join(VENTURES, entry.name, 'index.html');
    let html;
    try {
      html = await fs.readFile(file, 'utf8');
    } catch {
      continue;
    }
    if (pagePromisesHighlight(html)) promisers.push(entry.name);
  }
  // The promise is a copied line, so the count moves as calculators land. What
  // must hold is that the family is large and that the gate accepts all of it.
  assert.ok(promisers.length >= 100, `only ${promisers.length} pages promise a highlight`);
  for (const slug of promisers.slice(0, 5)) {
    const html = await fs.readFile(path.join(VENTURES, slug, 'index.html'), 'utf8');
    assert.notEqual(injectInvalidField(html), html, `${slug} would not receive the runtime`);
  }
});
