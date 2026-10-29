import { test } from 'node:test';
import assert from 'node:assert/strict';
import { num, moe, obsText, acronyms, flagBadges, classBadge, esc, vintageLine, emptyState, missingReason, NOT_AVAILABLE, CLASS_LABELS } from './format.mjs';

test('null, undefined and NaN render "Not available", never 0', () => {
  for (const v of [null, undefined, NaN, '12', Infinity]) assert.equal(num(v), NOT_AVAILABLE);
  assert.equal(obsText(null), NOT_AVAILABLE);
  assert.equal(obsText({ e: null, moe: 5, flags: [] }), NOT_AVAILABLE);
  assert.equal(num(0), '0', 'a real zero is shown as zero');
  assert.equal(obsText({ e: 0, moe: null, flags: [] }), '0');
});

test('numbers group thousands; percent unit adds %; MOE renders ±', () => {
  assert.equal(num(1234567), '1,234,567');
  assert.equal(num(12.345, { digits: 1, unit: 'percent' }), '12.3%');
  assert.equal(moe({ e: 1234, moe: 210 }), '± 210');
  assert.equal(moe({ e: 1234, moe: null }), '');
  assert.equal(obsText({ e: 1234, moe: 210, flags: [] }), '1,234 ± 210');
});

test('acronyms expand on first use only, per expander', () => {
  const ax = acronyms();
  assert.equal(ax('ACS data'), 'American Community Survey (ACS) data');
  assert.equal(ax('more ACS'), 'more ACS');
  assert.equal(ax('GSS and NSFG by FIPS'), 'General Social Survey (GSS) and National Survey of Family Growth (NSFG) by Federal Information Processing Standards (FIPS)');
  assert.equal(ax('GSS'), 'GSS');
  const fresh = acronyms();
  assert.equal(fresh('ACS'), 'American Community Survey (ACS)');
  assert.equal(acronyms()('The American Community Survey (ACS) says'), 'The American Community Survey (ACS) says', 'no double expansion');
  assert.equal(acronyms()('BACSX'), 'BACSX', 'word boundaries respected');
});

test('badges escape and label every class and flag', () => {
  assert.match(classBadge('unvalidated_hypothesis'), /Unvalidated hypothesis/);
  assert.equal(Object.keys(CLASS_LABELS).length, 6);
  const f = flagBadges(['suppressed_small_sample', 'exploratory_sample', 'not_ingested', 'vintage_mismatch']);
  assert.match(f, /Insufficient sample/);
  assert.match(f, /Exploratory/);
  assert.match(f, /Not ingested/);
  assert.match(f, /Vintage mismatch/);
  assert.match(f, /flag-warn/);
  assert.equal(flagBadges(undefined), '');
  assert.equal(esc('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
  assert.ok(!flagBadges(['<script>']).includes('<script>'));
});

test('vintage line comes from the data, with a stated fallback', () => {
  assert.equal(vintageLine({ vintage_label: 'L', source_ids: [] }, null), 'L');
  const sources = { sources: [{ id: 's1', title: 'Survey one', reference_period: 'p1' }, { id: 's2', title: 'Census two' }] };
  assert.equal(vintageLine({ source_ids: ['s1', 's2'] }, sources), 'Survey one (p1) · Census two');
  assert.equal(vintageLine({ missing: true }, { missing: true }), 'Data vintage not loaded yet');
});

test('empty states explain and point to Methodology; missing reasons follow flags', () => {
  const e = emptyState('us/county_observations.json');
  assert.match(e, /Not available yet/);
  assert.match(e, /#methodology/);
  assert.match(e, /no estimate is substituted/);
  assert.match(emptyState('geo/state_99.json'), /map outlines/);
  assert.equal(missingReason({ e: null, flags: ['not_ingested'] }), 'Source not imported yet');
  assert.equal(missingReason({ e: null, flags: ['suppressed_small_sample'] }), 'Insufficient sample');
  assert.equal(missingReason(null), 'No observation in the published file');
});
