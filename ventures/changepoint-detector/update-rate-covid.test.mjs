// README "A provider's own schedule changes" (eval/update-rate-covid-schedules.mjs, .out.txt).
// data/covid-schedules.csv holds six states' daily cumulative confirmed cases from JHU CSSE (CC BY 4.0), each
// state's county rows summed; the labels are the JHU README's "Irregular Update Schedules" lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { updateRateChanges } from './update-rate.mjs';
import { PRIMARY, SECONDARY, eventWindow, scoreEvent } from './eval/update-rate-covid-schedules.mjs';

const by = new Map();
for (const line of readFileSync(new URL('./data/covid-schedules.csv', import.meta.url), 'utf8').trim().split('\n').slice(1)) {
  const [d, st, v] = line.split(',');
  if (!by.has(st)) by.set(st, { dates: [], values: [] });
  by.get(st).dates.push(d); by.get(st).values.push(Number(v));
}
const ev = (st) => PRIMARY.find((e) => e.state === st);

test('the pre-registered event lists keep their sizes and directions', () => {
  assert.equal(PRIMARY.length, 27);
  assert.ok(PRIMARY.every((e) => e.direction === 'less often'));
  assert.equal(SECONDARY.length, 19);
});

for (const [st, at] of [['Minnesota', '2022-06-29'], ['Utah', '2022-03-31'], ['Vermont', '2022-05-18']]) {
  test(`${st}'s documented switch to weekly reporting is dated (${ev(st).date})`, () => {
    const s = by.get(st), u = updateRateChanges(s.values);
    const { hit } = scoreEvent(s, ev(st), u);
    assert.ok(hit, 'dated');
    assert.equal(s.dates[hit.index], at);
    assert.ok(hit.to - hit.from <= 15, `width ${hit.to - hit.from}`);
    assert.ok(hit.shareBefore < 0.35 && hit.shareAfter > 0.8, `${hit.shareBefore} -> ${hit.shareAfter}`);
  });
}

test('South Dakota: weekly in the record from mid-March 2022, two days before the README date window opens', () => {
  const s = by.get('South Dakota'), u = updateRateChanges(s.values);
  assert.equal(scoreEvent(s, ev('South Dakota'), u).hit, undefined);
  const [w0] = eventWindow(s.dates, ev('South Dakota'));
  const c = u.changes.find((x) => s.dates[x.index] === '2022-03-18');
  assert.ok(c && c.direction === 'less often' && c.to < w0 && w0 - c.to <= 3, JSON.stringify(c));
});

test('California: the county-built series never repeats in 2022, so the state schedule leaves no mark', () => {
  const s = by.get('California'), u = updateRateChanges(s.values);
  assert.ok(u.repeats / u.steps < 0.05);
  assert.equal(u.changes.filter((c) => s.dates[c.index] > '2021-01-01').length, 0);
});

test('Kentucky: the weekly stretch in the record starts in autumn 2022, not at the README date', () => {
  const s = by.get('Kentucky'), u = updateRateChanges(s.values);
  const last = u.changes.at(-1);
  assert.equal(last.direction, 'less often');
  assert.ok(s.dates[last.index] >= '2022-09-01' && s.dates[last.index] <= '2022-10-31', s.dates[last.index]);
});

test('the committed verdict: D1 and D2 pass', () => {
  const out = readFileSync(new URL('./eval/update-rate-covid-schedules.out.txt', import.meta.url), 'utf8');
  assert.match(out, /D1 dated 20 of 27 \(bar >= 19\): pass/);
  assert.match(out, /D2 median range width 13\.5 rows \(bar <= 60\): pass/);
});
