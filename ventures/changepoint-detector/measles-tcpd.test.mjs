// The README's measles section (TCPD, eval/tcpd-measles.mjs) quotes figures from
// eval/tcpd-measles.out.txt; the data is not committed (tcpd-fetch.sh), so this pins the
// quoted figures to the committed output rather than rerunning the measurement.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const out = readFileSync(new URL('./eval/tcpd-measles.out.txt', import.meta.url), 'utf8');
const readme = readFileSync(new URL('./README.md', import.meta.url), 'utf8');
const section = readme.slice(readme.indexOf('## Measles: the consensus loses F1'));

test('the annotations: four of five marked no change, and no change scores 0.947', () => {
  assert.match(out, /So 4 of 5 marked no change\. Reporting nothing scores F1 0\.947/);
  assert.match(out, /Published scores equal to "zero" \(0\.947\): amoc, binseg, zero\./);
  assert.match(section, /four of TCPD's five annotators marked \*\*no change\*\*/);
});

test('the one agreed cut is week 693, one week after the 41,005-case peak', () => {
  assert.match(out, /1 cut at 693 \(1961\.3068\); F1 0\.643/);
  assert.match(out, /largest week is 692 \(1961\.2877, 41005 cases\)/);
  assert.match(out, /AR\(1\) widened\s+2 cuts, nearest 702/);
  assert.match(section, /week 693 \(April 1961\)/);
});

test('declared options and the two default trials match the README', () => {
  assert.match(out, /--period 52 \(the yearly season of weekly data\)\s+0 cuts\s+F1 0\.947/);
  assert.match(out, /--log\s+0 cuts\s+F1 0\.947/);
  assert.match(out, /--period 104 \(the two-year epidemic cycle\)\s+17 cuts\s+F1 0\.105/);
  for (const [r, after] of [[100, '0.699'], [30, '0.705'], [10, '0.673'], [3, '0.673']]) {
    assert.match(out, new RegExp(`R +${r}, held out \\(mean over all 7: 0\\.711 -> ${after.replace('.', '\\.')}\\)`));
  }
  assert.match(out, /calendar season: 11 series switched; F1 0\.750 -> 0\.773 \(mean \+0\.023\); better on 3, worse on 3, same on 5\./);
  assert.match(section, /better on 3 \(construction, seatbelts, measles\), worse on 3 \(jfk_passengers, lga_passengers, us_population\)/);
});
