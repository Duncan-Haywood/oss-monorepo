// Descriptive, run after round two's verdict (eval/update-rate-range.out.txt): the shipped update-rate
// description (update-rate.mjs, UPDATE_RATE) on real series. There is no labelled truth for "began
// updating less often", so nothing here decides anything; it shows where the description speaks and
// what it says. Missing values are kept as missing (never a repeat), not carried forward, because a
// carried-forward gap would itself read as a repeat.
// Series: every one-dimensional TCPD series (ds and heldout) and Florida frozen orange juice prices.
// usage: sh eval/tcpd-fetch.sh tcpd-data && node eval/update-rate-real.mjs tcpd-data > eval/update-rate-real.out.txt
import { updateRateChanges } from '../update-rate.mjs';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const pct = (v) => `${(100 * v).toFixed(0)}%`;
export function describe(name, values, labels) {
  const u = updateRateChanges(values);
  const head = `${name.padEnd(26)} n ${String(values.length).padStart(5)}  repeats ${String(u.repeats).padStart(4)} (${pct(u.repeats / Math.max(1, u.steps)).padStart(4)})`;
  if (!u.changes.length) return { u, text: `${head}  no change of update rate${u.repeats < u.setting.minRepeats ? ' (under 10 repeats: not run)' : ''}` };
  const L = (i) => labels[i] ?? i;
  const parts = u.stretches.map((s) => `${L(s.from)}..${L(s.to)} ${pct(s.share)}`).join(' | ');
  const ch = u.changes.map((c) => `${L(c.index)} [${L(c.from)}..${L(c.to)}] ${c.direction}${c.rounding ? ` (rounding: tick ${+c.tick.toPrecision(6)})` : ''}`).join('; ');
  return { u, text: `${head}  ${u.changes.length} change(s): ${ch}\n${''.padEnd(28)}stretches: ${parts}` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const DIR = process.argv[2] || 'tcpd-data';
  const ann = JSON.parse(readFileSync(join(DIR, 'annotations.json'), 'utf8'));
  let fired = 0, ran = 0, total = 0;
  console.log('TCPD, one-dimensional series (labels are row indexes)');
  for (const sub of ['ds', 'heldout']) {
    const dir = join(DIR, sub);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
      const name = f.replace(/\.json$/, '');
      if (!ann[name]) continue;
      const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (j.n_dim !== 1) continue;
      const values = j.series[0].raw.map((v) => (v == null || !Number.isFinite(Number(v)) ? NaN : Number(v)));
      const { u, text } = describe(`${name}${sub === 'heldout' ? ' (held out)' : ''}`, values, values.map((_, i) => i));
      total++; if (u.repeats >= u.setting.minRepeats) ran++; if (u.changes.length) fired++;
      console.log(text);
    }
  }
  console.log(`TCPD: ${total} series, run on ${ran} (10+ repeats), a change of update rate on ${fired}.`);
  const rows = readFileSync(new URL('../data/frozen-juice.csv', import.meta.url), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split(','));
  console.log('\nFlorida frozen orange juice, monthly price (data/frozen-juice.csv)');
  console.log(describe('frozen juice', rows.map((r) => Number(r[1])), rows.map((r) => r[0])).text);
}
