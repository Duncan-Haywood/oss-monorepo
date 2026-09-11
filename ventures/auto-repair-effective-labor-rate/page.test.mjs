import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ALL_INPUT_IDS, NUMERIC_IDS } from './calc.mjs';

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const markup = page('index.html');
const guide = page('what-is-my-effective-labor-rate.html');
const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const script = /<script type="module">([\s\S]*?)<\/script>/.exec(markup)[1];

/** The `value="…"` defaults the form ships, which are the worked example. */
const defaults = Object.fromEntries(
  [...markup.matchAll(/<input id="([^"]+)"[^>]*value="([^"]*)"/g)].map((m) => [m[1], m[2]]),
);

test('the calculator page is usable without a build step and says what it is not', () => {
  assert.match(markup, /Effective Labor Rate Calculator/);
  assert.match(markup, /calculateEffectiveLaborRate/);
  assert.match(markup, /<script type="application\/ld\+json">/);
  assert.match(markup, /No warranty/);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /Do not keep anonymous local usage counts/);
  assert.match(markup, /href="LICENSE"/);
  assert.match(markup, /what-is-my-effective-labor-rate\.html/);
  // The disclaimer has to disclaim the things this tool looks like it is doing.
  // It handles payroll, warranty reimbursement and a profit-and-loss statement,
  // so the usual "not financial advice" line is not the whole set.
  assert.match(markup, /tax, accounting, insurance, employment/);
  assert.match(markup, /what warranty work to accept/);
  assert.match(markup, /paid or classified/);
});

test('every input the arithmetic reads exists on the form', () => {
  // `readForm` maps over ALL_INPUT_IDS and calls `el(id).value`, so a field
  // named in calc.mjs but absent from the page throws on the first submit —
  // the button stops working while the page looks perfectly healthy.
  for (const id of ALL_INPUT_IDS) {
    assert.ok(ids.has(id), `calc.mjs reads #${id} but the form has no such input`);
  }
});

test('every form input is one the arithmetic knows about', () => {
  const known = new Set([...ALL_INPUT_IDS, 'usageOptOut']);
  const formInputs = [...markup.matchAll(/<input id="([^"]+)"/g)].map((m) => m[1]);
  for (const id of formInputs) {
    assert.ok(known.has(id), `the form has #${id} and calc.mjs never reads it`);
  }
});

test('every input carries a visible label, not just a placeholder', () => {
  // The catalogue-wide axe sweep on 2026-09-06 found 48 critical `label`
  // violations across three live products — number inputs announced to a
  // screen reader as "edit, number" and nothing else. Every input here is
  // wrapped in its own <label>, which is what makes the accessible name.
  const labelled = [...markup.matchAll(/<label[^>]*>[^<]*<input id="([^"]+)"/g)].map((m) => m[1]);
  for (const id of ALL_INPUT_IDS) {
    assert.ok(labelled.includes(id), `#${id} is not wrapped in a <label>, so it has no accessible name`);
  }
});

test('every output slot the script writes exists in the markup', () => {
  for (const id of ['resultBody', 'exampleNote', 'scenarioStatus', 'saveScenario', 'forgetScenario', 'usageOptOut']) {
    assert.ok(ids.has(id), `missing #${id}`);
  }
});

test('every value interpolated into the result panel is escaped', () => {
  // The panel is built as a string and assigned with innerHTML, which is the
  // pattern 201 of the 249 tools here use. That is only safe while every
  // interpolation goes through escapeHtml, so this asserts the shape rather
  // than trusting a reading. Bare `${` interpolations are allowed only for
  // arithmetic that cannot produce a character with meaning in markup.
  // Only interpolations that actually land in markup are in scope. A helper
  // string built with `${money2(x)}` and then passed through escapeHtml at the
  // point of insertion is safe, so the unit checked here is the *line*: any
  // line that opens an HTML tag must escape everything it interpolates.
  const markupInterpolations = (body) =>
    body
      .split('\n')
      .filter((line) => /<[a-zA-Z/]/.test(line))
      .flatMap((line) => [...line.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1].trim()));

  const renderBody = /function render\(r\)[\s\S]*?\n    \}/.exec(script)[0];
  const interpolations = markupInterpolations(renderBody);
  assert.ok(interpolations.length > 5, 'the scan found almost nothing — the regex has gone stale');
  // Helpers that escape everything they interpolate, checked by their own
  // assertions below, plus `heroClass`, which is one of two string literals.
  const escapingHelpers = new Set([
    'renderGap(r)',
    'renderErrors(r.errors)',
    'required',
    'heroClass',
    "r.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')",
  ]);
  // The one bare interpolation allowed: a percentage clamped to 0-100 and
  // rendered by toFixed, which can only produce digits and a dot.
  const numericOnly = /^Math\.max\(0, Math\.min\(100, share\)\)\.toFixed\(1\)$/;
  for (const expression of interpolations) {
    assert.ok(
      expression.includes('escapeHtml(') || numericOnly.test(expression) || escapingHelpers.has(expression),
      `unescaped interpolation in render(): ${expression}`,
    );
  }
  // `renderGap` and `renderErrors` are trusted above, so hold them to the rule.
  for (const helper of ['renderGap', 'renderErrors']) {
    const body = new RegExp(`function ${helper}\\([\\s\\S]*?\\n    \\}`).exec(script)[0];
    for (const expression of markupInterpolations(body)) {
      assert.ok(
        expression.includes('escapeHtml(') || numericOnly.test(expression) || escapingHelpers.has(expression),
        `unescaped interpolation in ${helper}(): ${expression}`,
      );
    }
  }
  assert.match(script, /const escapeHtml =/);
});

test('the tool writes no shared link and reads no URL state', () => {
  // Deliberate. A month of labor sales, payroll and fixed expenses is more than
  // should ever ride in a URL that could be logged by a proxy or pasted into a
  // chat app, so this venture has local storage and no share feature at all.
  assert.doesNotMatch(script, /location\.hash|URLSearchParams|encodeBid|history\.replaceState/);
});

test('the whole month can be saved locally, and forgotten again', () => {
  assert.match(script, /localStorage\.setItem\(SCENARIO_KEY, JSON\.stringify\(readForm\(\)\)\)/);
  assert.match(script, /localStorage\.removeItem\(SCENARIO_KEY\)/);
  assert.match(script, /const SCENARIO_KEY = 'auto-repair-elr-scenario'/);
});

test('the page opens on the worked example rather than an empty panel', () => {
  // The onboarding story is: land, read a real number, then replace the figures
  // with your own. A first visit that showed only "fill in a month" hides the
  // one thing that makes the page explain itself.
  assert.match(script, /paint\(calculateEffectiveLaborRate\(readForm\(\)\)\)/);
  assert.match(markup, /not yours yet/, 'the example must not read as the visitor’s own month');
});

test('a restored month is the visitor s own, not labelled as the example', () => {
  assert.match(script, /showingExample = false;/);
  assert.match(script, /el\('exampleNote'\)\.hidden = !showingExample/);
});

test('the worked example the form ships with actually computes', async () => {
  const { calculateEffectiveLaborRate } = await import('./calc.mjs');
  const result = calculateEffectiveLaborRate(defaults);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.ok(result.effectiveLaborRate > 0);
  // The example has to demonstrate the thing the page is about, or the first
  // impression is a shop with no gap and the point is lost.
  assert.ok(result.totalBillingGap > 0, 'the shipped example must show a real gap');
  assert.ok(result.requiredPostedRate > result.requiredEffectiveRate);
});

test('the figures in the guide copy are the ones the calculator produces', async () => {
  const { calculateEffectiveLaborRate } = await import('./calc.mjs');
  const r = calculateEffectiveLaborRate(defaults);
  // Every number quoted in the SEO page is a claim about this tool's output. If
  // the arithmetic moves and the copy does not, the page starts lying to the
  // search result that brought someone to it.
  assert.match(guide, new RegExp(`\\$${r.effectiveLaborRate.toFixed(2)}`));
  assert.match(guide, new RegExp(`\\$${Math.round(r.totalBillingGap).toLocaleString('en-US')}`));
  assert.match(guide, new RegExp(`\\$${r.costPerBilledHour.toFixed(2)}`));
  assert.match(guide, new RegExp(`\\$${r.requiredEffectiveRate.toFixed(2)}`));
  assert.match(guide, new RegExp(`\\$${r.requiredPostedRate.toFixed(2)}`));
  assert.match(guide, new RegExp(`${r.technicianEfficiency.toFixed(0)}% efficiency`));
});

test('the guide page answers the search question and carries its own clause', () => {
  assert.match(guide, /What is my effective labor rate\?/i);
  assert.match(guide, /No warranty/);
  assert.match(guide, /<link rel="canonical"/);
  assert.match(guide, /application\/ld\+json/);
  assert.match(guide, /href="\.\/"/, 'the guide must link back to the tool');
});

test('wide tables in the guide scroll in their own box, not the page', () => {
  // `platform/pages/sideways.mjs` fails a page that scrolls sideways on a
  // phone. A table is allowed to be wider than the screen only inside its own
  // overflow container.
  const tables = [...guide.matchAll(/<table[\s\S]*?<\/table>/g)];
  assert.ok(tables.length > 0);
  const wrapped = [...guide.matchAll(/<div class="scroll">[\s\S]*?<\/div>/g)];
  assert.equal(wrapped.length, tables.length, 'every table needs its own .scroll wrapper');
  assert.match(guide, /\.scroll \{ overflow-x: auto; \}/);
});

test('robots and sitemap let crawlers find every page', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /auto-repair-effective-labor-rate\/<\/loc>/);
  assert.match(sitemap, /what-is-my-effective-labor-rate\.html/);
  assert.match(sitemap, /vs-tekmetric\.html/);
});

test('every published page carries Open Graph tags', () => {
  for (const [name, html] of [['index.html', markup], ['what-is-my-effective-labor-rate.html', guide], ['vs-tekmetric.html', page('vs-tekmetric.html')]]) {
    assert.match(html, /property="og:title"/, `${name} has no og:title`);
    assert.match(html, /property="og:description"/, `${name} has no og:description`);
  }
});

test('index links to the Tekmetric comparison page, and the comparison page links back', () => {
  assert.match(markup, /href="vs-tekmetric\.html"/);
  const vsPage = page('vs-tekmetric.html');
  assert.match(vsPage, /No warranty/);
  assert.match(vsPage, /not\s+affiliated\s+with/i);
  assert.match(vsPage, /<link rel="canonical"/);
  assert.match(vsPage, /application\/ld\+json/);
  assert.match(vsPage, /href="\.\/"/, 'the comparison page must link back to the tool');
  // PRODUCT_PLAYBOOK.md 5f: a vs-<competitor> page names a trademark and must
  // say plainly it is not that product's page. Loosely matched to allow the
  // page's own voice, mirroring platform/pages/clauses.mjs's NOT_AFFILIATED.
  assert.match(vsPage, /Tekmetric/);
});

test('wide tables on the Tekmetric comparison page scroll in their own box, not the page', () => {
  const vsPage = page('vs-tekmetric.html');
  const tables = [...vsPage.matchAll(/<table[\s\S]*?<\/table>/g)];
  assert.ok(tables.length > 0);
  const wrapped = [...vsPage.matchAll(/<div class="scroll">[\s\S]*?<\/div>/g)];
  assert.equal(wrapped.length, tables.length, 'every table needs its own .scroll wrapper');
  assert.match(vsPage, /\.scroll \{ overflow-x: auto; \}/);
});

test('opening the page counts nothing and arms nothing', () => {
  // A usage count is an event about a feature being used. Loading a page is not
  // one, and counting it would turn an aggregate feature tally into a visit
  // log, which is not what the footer promises.
  const beforeFirstListener = script.slice(0, script.indexOf("addEventListener('submit'"));
  assert.doesNotMatch(beforeFirstListener, /recordUsage\(/);
  assert.doesNotMatch(script, /fetch\(|XMLHttpRequest|navigator\.sendBeacon/);
});

test('the opt-out is honoured on every counted event', () => {
  const calls = [...script.matchAll(/recordUsage\([^)]*\)/g)].map((m) => m[0]);
  assert.ok(calls.length >= 2, 'expected the calculate and save events to be counted');
  for (const call of calls) {
    assert.match(call, /optedOut\(\)/, `recordUsage call ignores the opt-out: ${call}`);
  }
});

test('a rejected input is pointed at, not just described', () => {
  // `platform/pages/highlight.mjs` checks this across the catalogue: a list of
  // messages above the fold leaves the visitor hunting for which of twelve
  // boxes it means.
  assert.match(script, /setAttribute\('aria-invalid', 'true'\)/);
  assert.match(script, /removeAttribute\('aria-invalid'\)/);
  assert.match(script, /\.focus\(/);
  assert.match(markup, /input\[aria-invalid="true"\]/, 'invalid inputs need a visible style too');
});

test('the form ships a default for every required field', () => {
  // A blank required field is an error by design, so a form that shipped one
  // would open on a list of errors rather than on the worked example.
  for (const id of NUMERIC_IDS) {
    assert.ok(id in defaults, `#${id} ships no default value`);
    assert.notEqual(defaults[id], '', `#${id} ships an empty default`);
  }
});

test('index links one hop to the shop-rate-calculator sibling', () => {
  assert.match(markup, /href="\.\.\/shop-rate-calculator\//);
});

test('index links one hop to a second sibling', () => {
  assert.match(markup, /href="\.\.\/hvac-maintenance-contract-calculator\//);
});
