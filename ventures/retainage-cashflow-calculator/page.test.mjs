import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const article = readFileSync(new URL('./should-i-take-partial-retainage-now.html', import.meta.url), 'utf8');

test('the worksheet exposes the partial-offer compare and counts it once', () => {
  assert.match(page, /comparePartialReleaseOffer/);
  assert.match(page, /id="partialReleaseCompare"/);
  assert.match(page, /id="partialOffer"/);
  assert.match(page, /id="waitDays"/);
  assert.match(page, /id="partialReleaseVerdict"|id="partialReleaseNote"/);
  assert.match(page, /retainage-cashflow:partial-release-compared/);
  assert.match(page, /should-i-take-partial-retainage-now\.html/);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /releaseSchedule/);
  assert.match(page, /id="releaseSection"/);
  assert.match(page, /id="share"/);
  assert.match(page, /retainage-cashflow:link-copies/);
  assert.match(page, /compareRetainageRates/);
  assert.match(page, /id="rateSection"/);
  assert.match(page, /id="typicalHoldDays"/);
  assert.match(page, /What bid keeps the same cash coming in\?/);
  assert.match(page, /retainage-cashflow:rate-compared/);
  assert.match(page, /from '\.\/usage\.mjs'/);
  assert.match(page, /doNotTrack/);
  assert.match(page, /globalPrivacyControl/);
  const headerBlock = page.slice(page.indexOf('id="partialReleaseTable"'));
  const headers = [...headerBlock.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(headers, [
    'Path',
    'Cash from retainage',
    'Added carrying',
    'Net after carrying',
    'Vs waiting',
  ]);
});

test('the partial-retainage article answers the search question and points back', () => {
  assert.match(article, /partial retainage check now/i);
  assert.match(article, /href="\.\/#partialReleaseCompare"/);
  assert.match(article, /\$9,802\.74/);
  assert.match(article, /No warranty/);
  assert.match(article, /Best-effort hosting, no SLA/);
});

// Dependency-free structural checks. An unclosed textarea/script/style can
// swallow the rest of the worksheet without a browser error, and a regex
// over the raw file would still pass.
const RAW_TEXT_ELEMENTS = ['textarea', 'script', 'style'];

function parseRawText(source) {
  const rawOpen = /<(textarea|script|style)\b[^>]*>/i;
  let rest = source;
  let markup = '';
  const scripts = [];
  for (;;) {
    const open = rest.match(rawOpen);
    if (!open) return { markup: markup + rest, scripts, unclosed: null };
    const tag = open[1].toLowerCase();
    const contentStart = open.index + open[0].length;
    markup += rest.slice(0, contentStart);
    const closer = new RegExp(`</${tag}\\s*>`, 'i').exec(rest.slice(contentStart));
    if (!closer) return { markup, scripts, unclosed: tag };
    if (tag === 'script') scripts.push(rest.slice(contentStart, contentStart + closer.index));
    markup += closer[0];
    rest = rest.slice(contentStart + closer.index + closer[0].length);
  }
}

function derive(source) {
  const { markup, scripts, unclosed } = parseRawText(source);
  return {
    markup,
    unclosed,
    scriptSource: scripts.join('\n'),
    declaredIds: new Set([...markup.matchAll(/\bid="([\w-]+)"/g)].map((match) => match[1])),
  };
}

const { markup, scriptSource, declaredIds, unclosed } = derive(page);

test('every raw-text element is closed', () => {
  assert.equal(unclosed, null, `<${unclosed}> swallows the remainder of the page`);
  for (const tag of RAW_TEXT_ELEMENTS) {
    const opened = (page.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
    const closed = (page.match(new RegExp(`</${tag}\\s*>`, 'gi')) || []).length;
    assert.equal(opened, closed, `<${tag}> is opened ${opened}x but closed ${closed}x`);
  }
});

test('the module script survives parsing and would execute', () => {
  assert.match(markup, /<script type="module">/);
  assert.match(scriptSource, /from '\.\/calc\.mjs'/);
  assert.match(scriptSource, /parseInputs/);
  assert.match(scriptSource, /computeAll/);
  assert.match(scriptSource, /followUpDraft/);
});

test('every element the script queries exists in parsed markup', () => {
  const queried = new Set([
    ...scriptSource.matchAll(/\$\(\s*'([\w-]+)'\s*\)/g),
    ...scriptSource.matchAll(/getElementById\(\s*'([\w-]+)'\s*\)/g),
  ].map((match) => match[1]));
  assert.ok(queried.size > 0);
  assert.deepEqual([...queried].filter((id) => !declaredIds.has(id)), []);
});

test('the primary journey, disclaimer, and privacy note are rendered markup', () => {
  for (const id of [
    'form', 'contractValue', 'retainagePct', 'paidToDate', 'daysOutstanding',
    'annualCarryingRatePct', 'output', 'retainage', 'unpaid', 'carrying',
    'total', 'draftSection', 'draft', 'copy', 'usage', 'errors',
  ]) {
    assert.ok(declaredIds.has(id), `#${id} is missing`);
  }
  assert.match(markup, /No warranty/);
  assert.match(markup, /never uploaded/i);
});

test('a rejected worksheet hides every result section instead of leaving the last valid worksheet on screen', () => {
  // Before this fix, calculate() only wrote #errors when showErrors was true
  // (submit only, never live typing) and never touched #output,
  // #scenarioSection, #releaseSection, #rateSection, or #draftSection on an
  // invalid worksheet -- so clearing a required field while typing left the
  // *last valid* cash snapshot, delay scenarios, release schedule, rate
  // comparison, and downloadable report all showing, with no indication any
  // of it was stale and download/copy buttons still handing out the old
  // figures.
  const calcMatch = scriptSource.match(/function calculate\([\s\S]*?\{([\s\S]*?)\n {6}\$\('errors'\)\.textContent='';/);
  assert.ok(calcMatch, 'calculate() error branch not found');
  const body = calcMatch[1];
  assert.match(body, /classList\.add\('hidden'\)/, 'invalid worksheet does not hide the stale result sections');
  for (const id of ['output', 'scenarioSection', 'releaseSection', 'rateSection', 'draftSection']) {
    assert.match(body, new RegExp(`'${id}'`), `#${id} is not among the sections hidden on a rejected worksheet`);
  }
});

test('the structural guards actually fail on a swallowed document', () => {
  const broken = page.replace('</style>', '');
  assert.notEqual(broken, page, 'index.html no longer contains </style>');
  const d = derive(broken);
  assert.equal(d.unclosed, 'style');
  assert.doesNotMatch(d.markup, /<script type="module">/);
  assert.doesNotMatch(d.scriptSource, /parseInputs/);
  assert.ok(d.declaredIds.size < declaredIds.size);
});
