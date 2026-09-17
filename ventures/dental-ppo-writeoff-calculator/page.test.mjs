import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, 'index.html'), 'utf8');
const guide = readFileSync(join(here, 'what-is-my-effective-reimbursement-rate.html'), 'utf8');
const readme = readFileSync(join(here, 'README.md'), 'utf8');
const calc = readFileSync(join(here, 'calc.mjs'), 'utf8');

const vsPage = readFileSync(join(here, 'vs-ppo-fee-negotiators.html'), 'utf8');

const PAGES = [
  ['index.html', page],
  ['what-is-my-effective-reimbursement-rate.html', guide],
  ['vs-ppo-fee-negotiators.html', vsPage],
];

test('both pages carry the no-warranty clause', () => {
  for (const [name, html] of PAGES) {
    assert.match(html, /No warranty\./, `${name} has no no-warranty clause`);
    assert.match(html, /accept no liability/, `${name} does not disclaim liability`);
  }
});

test('both pages say what the tool is not advice about', () => {
  for (const [name, html] of PAGES) {
    for (const word of ['legal', 'tax', 'accounting', 'insurance', 'contract']) {
      assert.ok(html.includes(word), `${name} does not disclaim ${word} advice`);
    }
  }
});

test('the guide carries the not-affiliated trademark line, because it names carriers', () => {
  assert.match(guide, /No affiliation with, endorsement by, or sponsorship from any named company/);
  // The calculator page ships carrier names in its worked example too.
  assert.match(page, /Delta|Cigna|MetLife/);
  assert.match(readme, /No affiliation with, endorsement by, or sponsorship/);
});

test('worked-example figures are labelled illustrations rather than benchmarks', () => {
  assert.match(guide, /An illustration, not a benchmark/);
  assert.ok(
    !/industry average|typical practice pays|benchmark rate/i.test(guide),
    'the guide states a benchmark it cannot support',
  );
});

test('the sponsor link is present and points at the right account', () => {
  assert.match(page, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(readme, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/);
});

test('the privacy line is on the page and in the README', () => {
  assert.match(page, /runs entirely in your browser/);
  assert.match(page, /Nothing is uploaded/);
  assert.match(readme, /No patient-level information is an input/);
});

test('no patient data is asked for anywhere', () => {
  for (const [name, html] of PAGES) {
    for (const term of ['patient name', 'date of birth', 'member id', 'subscriber id', 'chart number']) {
      assert.ok(!html.toLowerCase().includes(term), `${name} asks for ${term}`);
    }
  }
});

test('there is deliberately no shareable link', () => {
  // This page holds a month of a practice's production, payroll and overhead.
  // The rest of the catalogue ships share links; this one must not, and the
  // absence is asserted rather than left to reviewer memory.
  for (const forbidden of ['location.hash', 'URLSearchParams', 'history.replaceState', 'navigator.clipboard']) {
    assert.ok(!page.includes(forbidden), `the page uses ${forbidden}, which would put practice figures in a URL`);
  }
});

test('usage counting is present and switchable off', () => {
  assert.match(page, /recordUsage\(/);
  assert.match(page, /id="optOut"/);
  assert.match(page, /Do not count my use of this tool/);
});

test('every input carries an accessible name', () => {
  // The catalogue's first full axe run found 48 `label` violations across three
  // live products, all of them table inputs announced as "edit, number". The
  // script-built plan rows are exactly that shape, so the aria-label is the
  // thing that must not regress.
  assert.match(page, /input\.setAttribute\('aria-label'/);
  const labelledIds = [...page.matchAll(/<label for="([a-zA-Z]+)"/g)].map((m) => m[1]);
  for (const id of ['selfPayProduction', 'chairHours', 'providerCompensation', 'practiceOverhead', 'feeScheduleIncrease']) {
    assert.ok(labelledIds.includes(id), `${id} has no <label for>`);
  }
});

test('the result panel announces itself to assistive technology', () => {
  assert.match(page, /id="result"[^>]*aria-live="polite"/);
});

test('the page recomputes live, not on submit only', () => {
  // The defect this asserts against shipped once already, in a sibling venture:
  // a page that repriced on submit alone showed the operator one figure while
  // the form held another. There is no share link here, but a stale panel above
  // an edited form is the same lie told to one reader instead of two.
  assert.match(page, /addEventListener\('input'/);
});

test('the worked-example caveat retires on the first edit', () => {
  assert.match(page, /showingExample = false/);
  assert.match(page, /id="exampleNote"/);
});

test('the notes are statements about the figures, never instructions', () => {
  // The tool cannot know a practice's market, its patients, or the terms of any
  // agreement. Recommendation phrasing on figures it cannot verify is where
  // arithmetic becomes advice.
  const notesBlock = page.slice(page.indexOf('function notesFor'), page.indexOf('function recompute'));
  for (const phrase of ['you should', 'we recommend', 'drop this plan', 'renegotiate', 'raise your fees', 'terminate']) {
    assert.ok(
      !notesBlock.toLowerCase().includes(phrase),
      `the notes tell the reader to "${phrase}"`,
    );
  }
});

test('the page states that dropping a plan does not recover the write-off', () => {
  assert.match(page, /Removing a contract removes its production as well as its write-off/);
  assert.match(guide, /removes the write-off and the production together/);
  assert.match(readme, /does not recover its write-off/);
});

test('the allocation assumption is disclosed to the reader, not only to the code', () => {
  assert.match(guide, /in proportion to gross production/);
  assert.match(calc, /allocated between plans in proportion to gross production/);
});

test('the two pages link to each other', () => {
  assert.match(page, /href="\.\/what-is-my-effective-reimbursement-rate\.html"/);
  assert.match(guide, /href="\.\/"/);
});

test('both pages declare a canonical url and a description', () => {
  for (const [name, html] of PAGES) {
    assert.match(html, /<link rel="canonical"/, `${name} has no canonical`);
    assert.match(html, /<meta name="description"/, `${name} has no description`);
    assert.match(html, /<title>[^<]{20,}<\/title>/, `${name} has no useful title`);
  }
});

test('the calculator page carries SoftwareApplication data and the guide carries the FAQ', () => {
  assert.match(page, /"@type":"SoftwareApplication"/);
  assert.match(page, /"price":"0"/);
  // The FAQPage belongs on the guide, not here: `platform/pages/faq-visible`
  // requires every authored question and answer to be rendered visibly on the
  // page that declares it, and the guide is where this venture renders them.
  // Declaring it on the calculator would be a structured-data claim the
  // calculator does not back up.
  assert.ok(!page.includes('"@type":"FAQPage"'), 'the FAQ must live on the page that renders it');
  assert.match(guide, /"@type":"FAQPage"/);
});

test('every FAQ answer in the structured data is rendered visibly on the guide', () => {
  const entries = [...guide.matchAll(/"name":"([^"]+\?)","acceptedAnswer":\{"@type":"Answer","text":"((?:[^"\\]|\\.)*)"\}/g)];
  assert.ok(entries.length >= 6, 'fewer FAQ entries than the discoverability checklist expects');
  const decode = (s) => JSON.parse(`"${s}"`);
  const strip = (s) =>
    s
      .replace(/&mdash;/g, '—')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&');
  const body = strip(guide);
  for (const [, question, answer] of entries) {
    assert.ok(body.includes(`<h3>${strip(question)}</h3>`), `"${question}" is not rendered as a heading`);
    assert.ok(body.includes(decode(answer)), `the answer to "${question}" is not visible on the page`);
  }
});

test('the page is responsive and declares a viewport', () => {
  assert.match(page, /<meta name="viewport"/);
  assert.match(page, /@media \(max-width: 820px\)/);
});

test('the dark result panel does not leave links at the browser default colour', () => {
  // Measured defect in a sibling venture: a panel painting its own dark fill but
  // no link colour renders links at 1.1:1 against it.
  assert.match(page, /\.result a \{ color: inherit/);
});

test('the plan table scrolls rather than forcing the page sideways on a phone', () => {
  assert.match(page, /\.plan-table-wrap \{ overflow-x: auto/);
  assert.match(page, /class="plan-table-wrap"/);
});

test('the negotiator comparison page names no specific company', () => {
  // It compares against an industry role (PPO fee-schedule negotiation
  // services generally), not one named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying the not-affiliated trademark line.
  for (const bannedName of ['PPO Guardian', 'PPOPartner', 'PPO Negotiation Solutions', 'PPO Profits', 'PPO Advisors']) {
    assert.ok(!vsPage.includes(bannedName), `names a specific negotiation company: ${bannedName}`);
  }
  assert.match(vsPage, /does not name, endorse, or compare against any specific negotiation company/);
});

test('the negotiator comparison page never promises a negotiation outcome', () => {
  // "cannot promise"/"cannot ... guarantee" disclaim an outcome; an
  // unqualified "will get you" or "guaranteed" would assert one.
  assert.ok(!/will get you a (better|higher)/i.test(vsPage), 'the page implies a negotiation outcome it cannot back up');
  assert.ok(!/guaranteed (increase|result|rate)/i.test(vsPage), 'the page implies a guaranteed outcome');
  assert.match(vsPage, /cannot promise any carrier will move/);
  assert.match(vsPage, /cannot predict or guarantee the outcome/);
});

test('the negotiator comparison page distinguishes rate from write-off dollars', () => {
  assert.match(vsPage, /ranks every plan by write-off dollars/);
  assert.match(vsPage, /not the same plan/);
});

test('every FAQ answer on the negotiator comparison page is rendered visibly', () => {
  const entries = [...vsPage.matchAll(/"name":"([^"]+\?)","acceptedAnswer":\{"@type":"Answer","text":"((?:[^"\\]|\\.)*)"\}/g)];
  assert.ok(entries.length >= 4, 'fewer FAQ entries than expected');
  const decode = (s) => JSON.parse(`"${s}"`);
  const strip = (s) =>
    s
      .replace(/&mdash;/g, '—')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&');
  const body = strip(vsPage);
  for (const [, question, answer] of entries) {
    assert.ok(body.includes(`<h3>${strip(question)}</h3>`), `"${question}" is not rendered as a heading`);
    assert.ok(body.includes(decode(answer)), `the answer to "${question}" is not visible on the page`);
  }
});

test('the negotiator comparison page links back to the calculator', () => {
  assert.match(vsPage, /href="\.\/"/);
  assert.match(page, /href="\.\/vs-ppo-fee-negotiators\.html"/);
});
