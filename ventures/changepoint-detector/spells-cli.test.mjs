// README "Short sparse spells on the CLI and page": the opt-in shortSpells pass as --spells and the page's box.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { main } from './cli.mjs';
import { analyze } from './engine.mjs';
import { spellsResult, spellsLine, SPELLS_MAX_POINTS } from './update-rate.mjs';
import { changeReportHtml } from './report.mjs';

const run = async (argv, input = '') => {
  let s = '';
  const code = await main(argv, { stdin: Readable.from([input]), out: (t) => { s += t; } });
  return { code, s };
};
const rows = readFileSync(new URL('./data/covid-schedules.csv', import.meta.url), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split(','));
const stateCsv = (st) => 'date,cases\n' + rows.filter((r) => r[1] === st).map((r) => `${r[0]},${r[2]}`).join('\n');
const SD = stateCsv('South Dakota');

test('--spells dates South Dakota\'s Wednesdays-only spell (README K1) in the text output', async () => {
  const { code, s } = await run(['--spells', '--no-agreed'], SD);
  assert.equal(code, 0);
  assert.match(s, /Short spells of fewer updates: one spell .*2021-07-03 to 2021-08-10 \(39 steps\): the value repeated on 85% of steps inside, against 32% before and after, read weekday by weekday/);
  const off = await run(['--no-agreed'], SD);
  assert.doesNotMatch(off.s, /Short spells/, 'off unless asked');
});

test('--spells --json carries the spell with its labels; an undated series is refused, not guessed', async () => {
  const r = JSON.parse((await run(['--spells', '--json'], SD)).s);
  assert.deepEqual(r.shortSpells.spells.map((x) => [x.fromLabel, x.toLabel, x.kind]), [['2021-07-03', '2021-08-10', 'dow']]);
  const undated = 'v\n' + Array.from({ length: 80 }, (_, i) => Math.floor(i / 3)).join('\n');
  const u = JSON.parse((await run(['--spells', '--json'], undated)).s);
  assert.match(u.shortSpells.refused, /date on every row/);
  assert.match(u.spellsWarning, /not searched/);
});

test('--spells with --consensus appends the same line', async () => {
  const { s } = await run(['--spells', '--consensus'], SD);
  assert.match(s, /Short spells of fewer updates: one spell .*2021-07-03 to 2021-08-10/);
});

test('none found is said plainly (Minnesota); too long a series is refused', () => {
  const mn = rows.filter((r) => r[1] === 'Minnesota');
  const res = spellsResult(mn.map((r) => +r[2]), mn.map((r) => r[0]));
  assert.deepEqual(res.spells, []);
  assert.match(spellsLine(res), /none found/);
  const n = SPELLS_MAX_POINTS + 1;
  assert.match(spellsResult(new Array(n).fill(1), new Array(n).fill('2020-01-01')).refused, /above the 4000/);
  assert.equal(spellsLine(null), null);
});

test('the page has the box, passes it to analyze, and shows the line; the printed report carries it', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /<input id="spells" type="checkbox">/);
  assert.match(html, /spells: \$\("#spells"\)\.checked/);
  assert.match(html, /"updateRateWarning", "spellsWarning", "clumpingWarning"/);
  const r = analyze({ csv: SD, spells: true });
  assert.match(r.spellsWarning, /2021-07-03 to 2021-08-10/);
  assert.equal(analyze({ csv: SD }).spellsWarning, undefined);
  assert.match(changeReportHtml(r), /Short spells of fewer updates/);
});
