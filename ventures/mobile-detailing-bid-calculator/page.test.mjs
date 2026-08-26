import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBid, defaults } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

// Walk the document the way a browser does so an unclosed raw-text element
// really does swallow everything after it. A sibling calculator shipped dead
// that way while its unit tests stayed green by importing calc.mjs directly.
const RAW_TEXT_ELEMENTS = ['textarea', 'script', 'style'];
function parseRawText(source) {
  const RAW = /<(textarea|script|style)\b[^>]*>/i;
  let rest = source;
  let markup = '';
  const scripts = [];
  for (;;) {
    const open = rest.match(RAW);
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
    scripts,
    scriptSource: scripts.join('\n'),
    declaredIds: new Set([...markup.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1])),
  };
}

const { markup, scriptSource, declaredIds, unclosed } = derive(html);

test('every raw-text element is closed', () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed; everything after it is swallowed as text`);
  for (const tag of RAW_TEXT_ELEMENTS) {
    const opened = (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
    const closed = (html.match(new RegExp(`</${tag}\\s*>`, 'gi')) || []).length;
    assert.equal(opened, closed, `<${tag}> is opened ${opened}x but closed ${closed}x`);
  }
});

test('the module script survives parsing and would actually execute', () => {
  assert.match(markup, /<script type="module">/, 'the app script tag is missing or was swallowed');
  assert.match(scriptSource, /calculateBid/, 'the app script did not parse as a script element');
  assert.match(scriptSource, /from '\.\/calc\.mjs'/, 'the calculation module is not imported');
  assert.match(scriptSource, /from '\.\/usage\.mjs'/, 'the usage module is not imported');
});

test('every element the script reaches for exists in the markup', () => {
  const wanted = new Set([
    ...[...scriptSource.matchAll(/getElementById\(\s*'([\w-]+)'\s*\)/g)].map((m) => m[1]),
    ...[...scriptSource.matchAll(/\bfield\(\s*'([\w-]+)'\s*\)/g)].map((m) => m[1]),
  ]);
  assert.ok(wanted.size > 0, 'no element lookups found; the script probably did not parse');
  const missing = [...wanted].filter((id) => !declaredIds.has(id));
  assert.deepEqual(missing, [], `script queries ids that no element declares: ${missing.join(', ')}`);
});

test('the structural guards actually fail on a swallowed document', () => {
  const broken = html.replace('</style>', '');
  assert.notEqual(broken, html, 'index.html no longer contains </style>; this case needs updating');
  const d = derive(broken);
  assert.equal(d.unclosed, 'style', 'an unclosed <style> was not detected');
  assert.doesNotMatch(d.markup, /<script type="module">/, 'the app script is still visible as markup after being swallowed');
  assert.doesNotMatch(d.scriptSource, /calculateBid/, 'swallowed script text was still collected as executable script');
  assert.ok(
    d.declaredIds.size < declaredIds.size,
    `ids are being read from the raw file, not the parse: ${d.declaredIds.size} of ${declaredIds.size} still visible after the document was swallowed`,
  );
});

test('an unclosed module script is caught the same way', () => {
  const at = html.lastIndexOf('</script>');
  assert.ok(at > 0, 'index.html has no </script>; this case needs updating');
  const d = derive(html.slice(0, at) + html.slice(at + '</script>'.length));
  assert.equal(d.unclosed, 'script');
});

test('the guards pass on the unmodified page (control)', () => {
  const d = derive(html);
  assert.equal(d.unclosed, null);
  assert.match(d.scriptSource, /calculateBid/);
  assert.ok(d.declaredIds.size > 0);
});

test('the form exposes every default the calculator reads, including whole-stop hours', () => {
  const required = [
    'targetPrice', 'laborHours', 'travelHours', 'setupHours', 'cleanupHours',
    'travelMiles', 'vehicleRate', 'wage', 'burdenPercent', 'supplies',
    'overhead', 'paymentRate', 'targetMargin',
  ];
  assert.deepEqual(Object.keys(defaults), required);
  for (const id of required) {
    assert.ok(declaredIds.has(id), `missing #${id} for a default the calculator reads`);
  }
  for (const id of ['totalHours', 'laborCost', 'effectiveRate', 'copyLink', 'reset', 'usageOptOut']) {
    assert.ok(declaredIds.has(id), `missing result or action #${id}`);
  }
});

test('share and persist read Object.keys(defaults), so a new field cannot drop off the link', () => {
  assert.match(scriptSource, /const ids = Object\.keys\(defaults\)/, 'the page keeps its own field list instead of defaults');
  assert.match(scriptSource, /location\.hash/, 'the bid must ride in the fragment, not the query string');
  assert.ok(!/`\?\$\{/.test(scriptSource), 'the bid link must not be built with a query string');
});

test('the default $180 example stays in the black when wage is skipped', () => {
  const result = calculateBid(defaults);
  assert.equal(result.totalHours, 4.25);
  assert.equal(result.laborCost, 0);
  assert.ok(result.contribution > 0, 'skipping wage should not hide a loss on the worked example');
});
