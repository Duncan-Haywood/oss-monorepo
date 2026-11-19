// Pre-registered (this header committed before the script first ran on the data): the shipped short-spells search
// (update-rate.mjs `spellsResult`, the function behind CLI `--spells` and the page's box; SHORT_SPELLS z01, m 3.5,
// unchanged) on a SECOND PROVIDER'S series. README "Short sparse spells on the CLI and page" left open: "a fresh real
// check on another provider's documented schedule changes, spells nobody has read".
//
// The series: The New York Times' covid-19-data, us-states.csv (cumulative cases per state per day; NYT's own
// collection from state and county health departments, independent of JHU CSSE's). Not one NYT state series has been
// read by this venture before this header: the file's header line (date,state,fips,cases,deaths) is all that was
// looked at. A day with no row between a state's first and last rows is filled with the day before (counted and
// printed). One row a day, a day the state did not publish repeating the day before, as in the JHU rounds.
//
// The labels: the same documented state schedule changes as eval/update-rate-covid-schedules.mjs (JHU's README,
// "Irregular Update Schedules"). A state health department's schedule is the state's, not the aggregator's, so the
// same dates should show in NYT's series if the search reads schedules and not one provider's quirks. NYT's
// collection may differ (it sometimes took county figures on days the state was silent), so this can fail.
//
// Disclosure: on JHU's series the search already found Alaska's and South Dakota's spells (K1) and Arkansas's (K2),
// and missed Nebraska's documented Wednesdays-only spell (2021-08-11..2021-09-25) altogether. Those JHU verdicts were
// read; NYT's were not.
//
// N1 (bar): the four documented short spells of FEWER publishing days that end in a documented return to the old
//     schedule (Alaska 2021-08-02, South Dakota 2021-08-16, Nebraska 2021-09-25, Arkansas 2021-07-24). Hit = a
//     reported spell whose last day falls within +-10 days of the return date (the K1 rule). Pass: at least 3 of 4.
// N2 (bar): unexplained spells. Over the 35 states of the JHU K2 list (27 primary + 8 'more often'), a spell is
//     EXPLAINED when either end is within +-10 days of any documented event (PRIMARY or SECONDARY) for that state.
//     On JHU, by this same rule, 1 of 8 spells is unexplained (Washington 2021-07-03..2022-01-01). Pass: at most 3
//     unexplained spells on NYT. (The rule is loose; the README's own reading of each spell stays descriptive.)
// N3 (descriptive): agreement between providers: each JHU K2 spell, does NYT report a spell overlapping it by at
//     least half the shorter of the two; and each NYT spell, the same against JHU's.
// Pass N1 and N2: the README says the opt-in line replicates on a second provider. Fail: it says which part failed
// and why it might. Either way nothing the CLI or the page prints by default changes (the line stays an opt-in).
// usage: sh eval/nyt-states-fetch.sh nyt-data && node eval/update-rate-spells-nyt.mjs nyt-data > eval/update-rate-spells-nyt.out.txt
import { spellsResult } from '../update-rate.mjs';
import { PRIMARY, SECONDARY } from './update-rate-covid-schedules.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const TOL = 10;
export const RETURNS = [
  ['Alaska', '2021-08-02'], ['South Dakota', '2021-08-16'], ['Nebraska', '2021-09-25'], ['Arkansas', '2021-07-24'],
].map(([state, date]) => ({ state, date }));
// JHU K2 spells (eval/update-rate-sparse-spells.out.txt), for N3.
export const JHU_SPELLS = [
  ['Alabama', '2022-03-01', '2022-07-08'], ['Alaska', '2021-06-08', '2021-07-29'],
  ['District of Columbia', '2022-03-02', '2022-07-06'], ['Idaho', '2021-03-28', '2021-09-05'],
  ['Kentucky', '2022-03-05', '2022-03-31'], ['South Dakota', '2021-07-03', '2021-08-10'],
  ['Washington', '2021-07-03', '2022-01-01'], ['Arkansas', '2021-06-21', '2021-07-20'],
].map(([state, from, to]) => ({ state, from, to }));
export const STATES = [...new Set([...PRIMARY.map((e) => e.state), ...SECONDARY.filter((e) => e.direction === 'more often').map((e) => e.state)])];

const DAY = 86400000;
const t = (d) => Date.parse(`${d}T00:00:00Z`);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
export const daysApart = (a, b) => Math.abs(t(a) - t(b)) / DAY;

/** Map state -> { dates, values, filled }: one row a calendar day, gaps carried forward. */
export function readNyt(file) {
  const lines = readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const head = lines[0].split(',');
  const di = head.indexOf('date'), si = head.indexOf('state'), ci = head.indexOf('cases');
  const rows = new Map();
  for (const line of lines.slice(1)) {
    const f = line.split(',');
    if (!rows.has(f[si])) rows.set(f[si], new Map());
    rows.get(f[si]).set(f[di], Number(f[ci]));
  }
  const by = new Map();
  for (const [st, m] of rows) {
    const ds = [...m.keys()].sort();
    const dates = [], values = []; let filled = 0;
    for (let ms = t(ds[0]); ms <= t(ds[ds.length - 1]); ms += DAY) {
      const d = iso(ms);
      if (m.has(d)) values.push(m.get(d)); else { values.push(values[values.length - 1]); filled++; }
      dates.push(d);
    }
    by.set(st, { dates, values, filled });
  }
  return by;
}

export function explained(state, s) {
  const evs = [...PRIMARY, ...SECONDARY].filter((e) => e.state === state);
  return evs.find((e) => daysApart(e.date, s.fromLabel) <= TOL || daysApart(e.date, s.toLabel) <= TOL) || null;
}
const overlap = (a0, a1, b0, b1) => Math.max(0, (Math.min(t(a1), t(b1)) - Math.max(t(a0), t(b0))) / DAY + 1);
export function agrees(a, b) {
  const la = (t(a.to) - t(a.from)) / DAY + 1, lb = (t(b.to) - t(b.from)) / DAY + 1;
  return overlap(a.from, a.to, b.from, b.to) >= 0.5 * Math.min(la, lb);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const t0 = Date.now();
  const by = readNyt(join(process.argv[2] || 'nyt-data', 'us-states.csv'));
  const res = new Map();
  for (const st of STATES) {
    const x = by.get(st);
    if (!x) { console.log(`${st}: not in the file`); continue; }
    res.set(st, spellsResult(x.values, x.dates));
  }
  const pct = (v) => `${(100 * v).toFixed(0)}%`;
  const fmt = (s) => `${s.fromLabel}..${s.toLabel} (${s.steps} days, ${s.kind}) ${pct(s.shareInside)} inside, ${pct(s.shareOutside)} around, gain ${s.gain.toFixed(1)}`;

  console.log('N1: a spell ending within +-10 days of a documented return after a short spell of fewer days');
  let hits = 0;
  for (const e of RETURNS) {
    const r = res.get(e.state), hit = r && !r.refused && r.spells.find((s) => daysApart(s.toLabel, e.date) <= TOL);
    if (hit) hits++;
    console.log(`  ${e.state.padEnd(14)} return ${e.date}: ${hit ? `HIT ${fmt(hit)}` : `missed${r && r.spells?.length ? ` (spells ${r.spells.map((s) => `${s.fromLabel}..${s.toLabel}`).join(', ')})` : ''}`}`);
  }
  const N1 = hits >= 3;
  console.log(`N1 ${hits} of ${RETURNS.length} (bar >= 3): ${N1 ? 'pass' : 'FAIL'}`);

  console.log('\nN2: every spell on the 35 states, with the documented event that explains it (either end within +-10 days)');
  let unexplained = 0, total = 0; const nytSpells = [];
  for (const st of STATES) {
    const x = by.get(st), r = res.get(st);
    if (!r) continue;
    if (r.refused) { console.log(`  ${st}: refused (${r.refused})`); continue; }
    for (const s of r.spells) {
      total++; const e = explained(st, s); if (!e) unexplained++;
      nytSpells.push({ state: st, from: s.fromLabel, to: s.toLabel });
      console.log(`  ${st.padEnd(21)} ${fmt(s)} -> ${e ? `${e.date} ${e.what}` : 'UNEXPLAINED'}`);
    }
    if (x.filled) console.log(`  (${st}: ${x.filled} missing days carried forward, n ${x.values.length})`);
  }
  const N2 = unexplained <= 3;
  console.log(`N2 ${unexplained} unexplained of ${total} spells (bar <= 3): ${N2 ? 'pass' : 'FAIL'}`);

  console.log('\nN3 (descriptive): agreement with JHU\'s K2 spells (overlap >= half the shorter)');
  let jInN = 0;
  for (const j of JHU_SPELLS) {
    const m = nytSpells.find((n) => n.state === j.state && agrees(j, n)); if (m) jInN++;
    console.log(`  JHU ${j.state.padEnd(21)} ${j.from}..${j.to}: ${m ? `NYT ${m.from}..${m.to}` : 'no NYT spell'}`);
  }
  let nInJ = 0;
  for (const n of nytSpells) if (JHU_SPELLS.some((j) => j.state === n.state && agrees(j, n))) nInJ++;
  console.log(`  ${jInN} of ${JHU_SPELLS.length} JHU spells seen in NYT; ${nInJ} of ${nytSpells.length} NYT spells seen in JHU`);
  console.log(`\nVerdict: ${N1 && N2 ? 'PASS (N1 and N2): the opt-in line replicates on a second provider' : 'FAIL'}`);
  console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
