import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MIN_AGE, DEFAULT_AGE_BAND, DEFAULT_PREFERENCES, TONES, SENTENCES, QUESTION_GROUPS, QUESTIONS_GUIDANCE,
  defaultPreferences, normalizePreferences, addPreference, removePreference, movePreference, preferencesText,
  charCount, lengthReport, LENGTH_NOTE, buildDrafts, clampAgeBand, settingsChecklist, settingsText, SETTINGS_NOTE,
  questionsText, normalizeToolkitState, fullText,
} from './toolkit.mjs';

test('default preferences cover the three tiers and are copies, not the frozen defaults', () => {
  const p = defaultPreferences();
  assert.ok(p.must.length && p.nice.length && p.discover.length);
  p.must.push('x');
  assert.ok(!DEFAULT_PREFERENCES.must.includes('x'));
});

test('add, remove and move preferences are pure and ignore junk', () => {
  const p = defaultPreferences();
  const added = addPreference(p, 'nice', '  Loves hiking  ');
  assert.equal(added.nice.at(-1), 'Loves hiking');
  assert.equal(p.nice.length + 1, added.nice.length, 'input not mutated');
  assert.deepEqual(addPreference(added, 'nice', 'loves HIKING').nice, added.nice, 'case-insensitive duplicate ignored');
  assert.deepEqual(addPreference(p, 'nice', '   '), p, 'blank ignored');
  assert.deepEqual(addPreference(p, 'bogus', 'x'), p, 'unknown tier ignored');
  const removed = removePreference(added, 'nice', added.nice.length - 1);
  assert.deepEqual(removed.nice, p.nice);
  const moved = movePreference(p, 'must', 0, 'discover');
  assert.equal(moved.must.length, p.must.length - 1);
  assert.equal(moved.discover.at(-1), p.must[0]);
  assert.deepEqual(movePreference(p, 'must', 99, 'nice'), p, 'missing index is a no-op');
});

test('normalizePreferences falls back to defaults per tier and keeps an emptied tier empty', () => {
  assert.deepEqual(normalizePreferences(null), defaultPreferences());
  const n = normalizePreferences({ must: [], nice: ['a', 3, ''] });
  assert.deepEqual(n.must, []);
  assert.deepEqual(n.nice, ['a']);
  assert.deepEqual(n.discover, defaultPreferences().discover);
});

test('preferencesText lists every tier', () => {
  const t = preferencesText({ must: ['A'], nice: [], discover: ['C'] });
  assert.match(t, /Must-have:\n {2}- A/);
  assert.match(t, /Nice-to-have:\n {2}\(none\)/);
  assert.match(t, /Discover in conversation:\n {2}- C/);
});

test('the SPEC §7F example sentences are in the bank verbatim', () => {
  const plain = SENTENCES.map((s) => s.plain);
  assert.ok(plain.includes('Practicing Catholic, dating for marriage, hoping for a large family, God willing.'));
  assert.ok(plain.includes("I'd love to provide for a family-centered home and prioritize children over luxury."));
  for (const s of SENTENCES) for (const t of TONES) assert.ok(s[t], `${s.id} has a ${t} variant`);
});

test('charCount counts code points, so emoji and accents count once', () => {
  assert.equal(charCount('abc'), 3);
  assert.equal(charCount('🙏🏼'), 2); // base + skin-tone modifier, as most counters show
  assert.equal(charCount('é'), 1);
  assert.equal(charCount(null), 0);
});

test('lengthReport compares with round bands and the note says to check the app', () => {
  const r = lengthReport('x'.repeat(200));
  assert.deepEqual(r.map((b) => b.fits), [false, true, true]);
  assert.equal(r[0].over, 50);
  assert.match(LENGTH_NOTE, /check your app/i);
});

test('buildDrafts assembles only chosen and own sentences in the chosen tone', () => {
  assert.deepEqual(buildDrafts({}), []);
  const d = buildDrafts({ chosen: ['faith-marriage', 'family-home', 'respect'], custom: ['i live in boulder'], tone: 'plain' });
  assert.ok(d.length >= 2 && d.length <= 3);
  const full = d.find((x) => x.id === 'full');
  assert.ok(full);
  assert.ok(full.text.startsWith('Practicing Catholic, dating for marriage'));
  assert.ok(full.text.endsWith('I live in boulder.'), 'own sentence capitalised and punctuated');
  assert.equal(full.count, charCount(full.text));
  // Nothing outside the bank and the user's text appears.
  const allowed = [...SENTENCES.map((s) => s.plain), 'I live in boulder.'];
  let rest = full.text;
  for (const a of allowed) rest = rest.split(a).join('');
  assert.equal(rest.trim(), '');
  // Drafts are distinct.
  assert.equal(new Set(d.map((x) => x.text)).size, d.length);
});

test('buildDrafts falls back to warm for an unknown tone and drops unknown ids', () => {
  const d = buildDrafts({ chosen: ['nope', 'commitment'], tone: 'sarcastic' });
  assert.equal(d[0].text, SENTENCES.find((s) => s.id === 'commitment').warm);
});

test('buildDrafts puts an opener first', () => {
  const d = buildDrafts({ chosen: ['commitment'], opener: 'teacher in Fort Collins', tone: 'plain' });
  assert.ok(d[0].text.startsWith('Teacher in Fort Collins. '));
});

test('age band defaults to 20 to 25 and never goes below 18', () => {
  assert.deepEqual(clampAgeBand(undefined), DEFAULT_AGE_BAND);
  assert.deepEqual(DEFAULT_AGE_BAND, { min: 20, max: 25 });
  assert.deepEqual(clampAgeBand({ min: 16, max: 17 }), { min: MIN_AGE, max: MIN_AGE });
  assert.deepEqual(clampAgeBand({ min: 30, max: 22 }), { min: 30, max: 30 });
  assert.deepEqual(clampAgeBand({ min: '21', max: '27.4' }), { min: 21, max: 27 });
  assert.deepEqual(clampAgeBand({ min: -5, max: 500 }), { min: 18, max: 99 });
});

test('settings checklist names the four SPEC items and says apps differ', () => {
  const items = settingsChecklist({ min: 15, max: 25 });
  assert.equal(items[0].label, 'Age range: 18 to 25');
  const labels = items.map((i) => i.label).join(' | ');
  for (const w of [/Catholic/, /wants children/, /marriage/]) assert.match(labels, w);
  assert.match(SETTINGS_NOTE, /differ by app and change/);
  const t = settingsText({ min: 20, max: 25 }, { religion: true });
  assert.match(t, /\[x\] Religion: Catholic/);
  assert.match(t, /\[ \] Age range: 20 to 25/);
});

test('every SPEC §7F question is present verbatim, each with follow-ups', () => {
  const spec = [
    'If money were no concern, how many children would you ideally want?',
    'If you had children, what role would you ideally want paid work to play?',
    'Would you prefer a large family and modest comforts, or a small family and much more luxury?',
    'What did you learn about marriage from the family you grew up in?',
    'Do you view marriage as a permanent commitment through difficult periods? What exceptions do you recognize?',
  ];
  const all = QUESTION_GROUPS.flatMap((g) => g.questions);
  for (const q of spec) assert.ok(all.some((x) => x.text === q && x.source === 'spec'), q);
  for (const q of all) assert.ok(q.followups.length >= 1, q.text);
});

test('guidance frames questions as mutual and forbids scoring a person', () => {
  const g = QUESTIONS_GUIDANCE.join(' ');
  assert.match(g, /mutual discovery over several conversations/);
  assert.match(g, /not an interview/);
  assert.match(g, /Never score/);
  const t = questionsText();
  assert.match(t, /How to use these:/);
  assert.match(t, /Never score/);
});

test('questionsText can be limited to selected questions', () => {
  const t = questionsText(['What did you learn about marriage from the family you grew up in?']);
  assert.match(t, /Marriage\n/);
  assert.doesNotMatch(t, /how many children/);
});

test('nothing in the toolkit takes, rates or scores another person', () => {
  const t = fullText({}).toLowerCase();
  // "score" may appear only inside the guidance that forbids it.
  const withoutRule = t.split('never score, rank or grade a person').join('');
  assert.doesNotMatch(withoutRule, /\bscor(e|es|ed|ing)\b|\brating\b|\bcompatibility score\b/);
});

test('normalizeToolkitState fills defaults and sanitises stored junk', () => {
  const s = normalizeToolkitState({ tone: 'x', chosen: ['faith-marriage', 'zzz'], custom: [1, 'ok'], ageBand: { min: 10, max: 12 } });
  assert.equal(s.tone, 'warm');
  assert.deepEqual(s.chosen, ['faith-marriage']);
  assert.deepEqual(s.custom, ['ok']);
  assert.deepEqual(s.ageBand, { min: 18, max: 18 });
  const d = normalizeToolkitState(undefined);
  assert.deepEqual(d.ageBand, { min: 20, max: 25 });
  assert.ok(d.chosen.length > 0);
});

test('fullText contains every section', () => {
  const t = fullText({});
  for (const h of ['My preferences', 'Profile drafts', 'Dating-app settings to look for', 'Questions to explore together']) assert.ok(t.includes(h), h);
});
