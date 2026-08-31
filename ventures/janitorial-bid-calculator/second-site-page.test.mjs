// Structural tests for second-site.html.
//
// Dependency-free (no jsdom) so CI stays `node --test`. Catches an unclosed
// raw-text element that would swallow the app script, and missing field IDs
// the module script reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./second-site.html', import.meta.url), 'utf8');
const RAW_TEXT_ELEMENTS = ['textarea', 'script', 'style'];

function parse(source) {
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

const { markup, scripts, unclosed } = parse(html);
const declaredIds = new Set([...markup.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]));
const scriptSource = scripts.join('\n');

test('every raw-text element is closed', () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed; everything after it is swallowed as text instead of parsed as markup`);
  for (const tag of RAW_TEXT_ELEMENTS) {
    const opened = (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
    const closed = (html.match(new RegExp(`</${tag}\\s*>`, 'gi')) || []).length;
    assert.equal(opened, closed, `<${tag}> is opened ${opened}x but closed ${closed}x`);
  }
});

test('the module script survives parsing and would actually execute', () => {
  assert.match(markup, /<script type="module">/, 'the app script tag is missing or was swallowed by an earlier element');
  assert.match(scriptSource, /compareSecondSite/, 'the app script did not parse as a script element');
  assert.match(scriptSource, /secondSiteNote/, 'copy-reply helper is not wired');
});

test('required inputs and outputs exist so the journey can run', () => {
  for (const id of [
    'officeSqFt', 'restroomSqFt', 'cleaningsPerWeek', 'hourlyWage',
    'driveMinutesOneWay', 'tripsPerWeek', 'extraVehicleMonthly',
    'offeredMonthly', 'price', 'walkAway', 'copySummary', 'usageOptOut',
  ]) {
    assert.ok(declaredIds.has(id), `missing #${id}`);
  }
});

test('the page states the no-warranty and no-SLA limits a hosted tool must show', () => {
  assert.match(html, /No warranty/);
  assert.match(html, /no SLA/i);
  assert.match(html, /Nothing leaves your browser/);
});

test('the first-building calculator still links here after concurrent index edits', () => {
  const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(index, /second-site\.html/);
});
