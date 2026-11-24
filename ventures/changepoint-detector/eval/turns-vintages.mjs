// The composite's turns called on real published vintages (FRED-MD, 1999-08 to 2021-10) against the same replay on
// today's revised data: how much do revisions cost the pseudo-real-time replays?
//
// Open item (README "Turns called in pseudo-real time", "... under P3", "Composite weights set in real time"):
// every replay so far cut today's revised data at each month, and "real vintages (ALFRED) when its host answers"
// stayed open: alfred.stlouisfed.org and the Philadelphia Fed's real-time data set refuse this session's proxy.
// FRED-MD's monthly vintages hold three of the four components as each month published them (payrolls PAYEMS,
// real personal income less transfers W875RX1, industrial production INDPRO; data/fredmd-vintages/, read through
// eval/fredmd-vintages.mjs). Real manufacturing and trade sales is in FRED-MD too but not in the copy this session
// can reach, so both arms here use the three, and the comparison is like for like.
//
// Pre-registered 2026-11-24, written and committed before this script was first run. Seen beforehand: the
// vintage files' own checks (every row rebuilds; the 2021-10 vintage's monthly growth is within a median 0.006 to
// 0.027 points of today's file from 1990 on, eval/fredmd-vintages.mjs), and the three earlier replays on revised
// data with four components. No composite has been built from the vintages, and the three-component composite
// has not been run in any replay.
//
// Cut-offs: each vintage month V from 1999-08 to 2021-10 (267). At V the user holds data to E = V - 2 (the
// replays' 2-month release lag; payrolls and production are out to V - 1, income to V - 1 or V - 2), taken as:
//   V (candidate) real vintages: for each component the newest vintage published by V (vintageAsOf, rules in
//     eval/fredmd-vintages.mjs), cut to 1967-01..E;
//   P (baseline) pseudo-real time: today's files (data/us-payems.csv, us-w875rx1.csv, us-indpro.csv), 1967-01..E.
// Both build compositeIndex(parts, { scale: 'sd' }) with the standard deviations over every month to E (all a user
// had) and turningPoints(index, { frequency: 'monthly', bigMove: 0.05, minPhase: 3 }): the shipped `--turns
// --columns` monthly defaults (P3 since README "P3 and the heavy-late warning together").
// Scored turns: NBER's six turns after the first cut-off's data (USREC): peaks 2001-03, 2007-12, 2020-02; troughs
// 2001-11, 2009-06, 2020-04. Call = the first cut-off whose composite has a turn of the same kind within 3 months
// of NBER's month, and every later cut-off too; delay = V - NBER month. All six have NBER announcement months
// (ANNOUNCED in eval/turns-realtime.mjs).
// False episodes: a dated (kind, month) at any cut-off with month 1997-01 or later and no NBER turn of that kind
// within 6 months, grouped as in eval/turns-realtime.mjs (same kind within 6 months is one episode); printed for
// months 1970 on as well, no bar.
//
// Expectation written down beforehand: revisions should cost a few months somewhere. The 2007-12 peak is the
// likeliest: payrolls as first published grew into early 2008 and were cut by later benchmarks. 2001 is the
// other candidate (income and production were revised down). 2020 moved too far to be missed in either arm.
//
// Bars, on arm V against arm P:
//   V1 arm V calls all six turns;
//   V2 arm V's median delay is at most 2 months over arm P's, and no turn is called more than 6 months later in V;
//   V3 arm V's false episodes (months 1997 on) are at most arm P's plus 1;
//   V4 arm V is before NBER's announcement on at least (arm P's count - 1) of the six.
// What it decides: no flag or default in the CLI rests on the replays (their own bars failed or shipped nothing
// beyond module options), so nothing in the CLI changes either way. If V1-V4 pass, the README says the
// pseudo-real-time replays are a fair stand-in for real time on this composite, by this measure, with the
// numbers; if any fails, it says by how much revisions moved which turn, and the replays' delays are marked as
// optimistic by that amount. Printed, no bar: both arms under P6 and MAD weights; the shipped four-component
// composite's pseudo-real-time calls on the same cut-offs; each vintage's weights.
//
// usage: node eval/turns-vintages.mjs > eval/turns-vintages.out.txt
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { turningPoints } from '../turning-points.mjs';
import { compositeIndex } from '../composite-index.mjs';
import { usrecTurns } from './turns-payems.mjs';
import { ANNOUNCED } from './turns-realtime.mjs';
import { readVintages, vintageAsOf, monthIndex, monthLabel } from './fredmd-vintages.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const FROM = '1967-01', FIRST = '1999-08', LAST = '2021-10', LAG = 2, NEAR = 3, FAR = 6, BIG = 0.05;
export const FALSE_FROM = '1997-01';
export const PARTS = ['PAYEMS', 'W875RX1', 'INDPRO'];
const FILES = { PAYEMS: 'us-payems.csv', W875RX1: 'us-w875rx1.csv', INDPRO: 'us-indpro.csv', CMRMTSPL: 'us-cmrmtspl.csv' };
const LAGGED = { PAYEMS: false, W875RX1: true, INDPRO: false };

function revised(name) {
  const m = new Map();
  for (const l of readFileSync(join(ROOT, 'data', FILES[name]), 'utf8').trim().split('\n').slice(1)) {
    const [k, v] = l.split(',');
    m.set(k, Number(v));
  }
  return m;
}

function window(map, from, to) {
  const out = [];
  for (let k = monthIndex(from); k <= monthIndex(to); k++) {
    const v = map.get(monthLabel(k));
    if (!(v > 0)) throw new Error(`no value for ${monthLabel(k)}`);
    out.push(v);
  }
  return out;
}

const fromRow = (r, from, to) => { const a = monthIndex(from) - monthIndex(r.first); return r.values.slice(a, a + monthIndex(to) - monthIndex(from) + 1); };

// parts at each cut-off: arm 'V' (vintages), 'P' (today's files, the three), 'P4' (today's files, the shipped four)
export function cutoffs(arm) {
  const out = [];
  const rev = arm === 'V' ? null : Object.fromEntries((arm === 'P4' ? [...PARTS, 'CMRMTSPL'] : PARTS).map((p) => [p, revised(p)]));
  for (let V = monthIndex(FIRST); V <= monthIndex(LAST); V++) {
    const pub = monthLabel(V), E = monthLabel(V - LAG);
    let parts, used = null;
    if (arm === 'V') {
      used = PARTS.map((p) => vintageAsOf(readVintages(p), pub, LAGGED[p], FROM));
      if (used.some((r) => !r || monthIndex(r.last) < V - LAG)) throw new Error(`vintage ${pub}: a component ends before ${E}`);
      parts = used.map((r) => fromRow(r, FROM, E));
    } else parts = Object.values(rev).map((m) => window(m, FROM, E));
    out.push({ pub, E, parts, used: used && used.map((r) => r.last) });
  }
  return out;
}

export function replay(arm, { minPhase = 3, scale = 'sd' } = {}) {
  return cutoffs(arm).map((c) => {
    const comp = compositeIndex(c.parts, { scale });
    const tp = turningPoints(comp.index, { frequency: 'monthly', bigMove: BIG, minPhase });
    return { ...c, parts: undefined, weights: comp.weights, turns: tp.turns.map((t) => ({ kind: t.kind, k: monthIndex(FROM) + t.i })) };
  });
}

export const NBER = () => usrecTurns().filter((t) => t.month > monthLabel(monthIndex(FIRST) - LAG) && t.month <= monthLabel(monthIndex(LAST) - LAG))
  .map((t) => ({ kind: t.kind, month: t.month, k: monthIndex(t.month) }));

export function score(cuts) {
  const nber = NBER(), all = usrecTurns().map((t) => ({ kind: t.kind, k: monthIndex(t.month) }));
  const has = (c, kind, k) => c.turns.some((x) => x.kind === kind && Math.abs(x.k - k) <= NEAR);
  const calls = nber.map((t) => {
    let call = null;
    for (let j = cuts.length - 1; j >= 0 && monthIndex(cuts[j].E) >= t.k; j--) { if (has(cuts[j], t.kind, t.k)) call = j; else break; }
    const pub = call === null ? null : cuts[call].pub;
    const ann = ANNOUNCED[t.month] ?? null;
    return { month: t.month, kind: t.kind, callMonth: pub, delay: pub === null ? null : monthIndex(pub) - t.k, ann, before: ann && pub ? pub < ann : null };
  });
  const episodesFrom = (from) => {
    const alarms = new Map();
    cuts.forEach((c, j) => { for (const x of c.turns) {
      if (x.k < monthIndex(from)) continue;
      if (all.some((t) => t.kind === x.kind && Math.abs(t.k - x.k) <= FAR)) continue;
      const key = `${x.kind} ${x.k}`;
      if (!alarms.has(key)) alarms.set(key, { kind: x.kind, k: x.k, first: j, last: j, cuts: 0 });
      const a = alarms.get(key); a.last = j; a.cuts++;
    } });
    const eps = [];
    for (const a of [...alarms.values()].sort((p, q) => p.kind.localeCompare(q.kind) || p.k - q.k)) {
      const e = eps.find((e) => e.kind === a.kind && Math.abs(e.hi - a.k) <= FAR);
      if (e) { e.hi = Math.max(e.hi, a.k); e.months.push(a.k); e.first = Math.min(e.first, a.first); e.last = Math.max(e.last, a.last); e.cuts += a.cuts; }
      else eps.push({ kind: a.kind, lo: a.k, hi: a.k, months: [a.k], first: a.first, last: a.last, cuts: a.cuts });
    }
    return eps.sort((p, q) => p.lo - q.lo).map((e) => ({ ...e, months: e.months.map(monthLabel), shownFrom: cuts[e.first].pub, shownTo: cuts[e.last].pub }));
  };
  const ds = calls.map((c) => c.delay).filter((d) => d !== null).sort((a, b) => a - b);
  const median = ds.length ? (ds.length % 2 ? ds[(ds.length - 1) / 2] : (ds[ds.length / 2 - 1] + ds[ds.length / 2]) / 2) : null;
  return { calls, called: ds.length, median, before: calls.filter((c) => c.before).length, episodes: episodesFrom(FALSE_FROM), episodes1970: episodesFrom('1970-01') };
}

export function run() {
  const V = score(replay('V')), P = score(replay('P'));
  const V1 = V.called === 6;
  const worse = V.calls.map((c, i) => (c.delay ?? Infinity) - (P.calls[i].delay ?? Infinity));
  const V2 = V.median !== null && P.median !== null && V.median - P.median <= 2 && worse.every((d) => d <= 6 || Number.isNaN(d));
  const V3 = V.episodes.length <= P.episodes.length + 1;
  const V4 = V.before >= P.before - 1;
  return { V, P, worse, V1, V2, V3, V4, pass: V1 && V2 && V3 && V4 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = run();
  const show = (name, a) => {
    console.log(`\n${name}: ${a.called} of 6 called, median delay ${a.median}, before NBER's announcement on ${a.before} of 6`);
    console.log('  NBER turn  kind    call month  delay  NBER announced  call first?');
    for (const c of a.calls) console.log(`  ${c.month}    ${c.kind.padEnd(6)}  ${String(c.callMonth).padEnd(10)}  ${String(c.delay).padStart(5)}  ${String(c.ann ?? '-').padEnd(14)}  ${c.before === null ? '-' : c.before ? 'yes' : 'no'}`);
    console.log(`  false episodes, turn months ${FALSE_FROM} on: ${a.episodes.length}`);
    for (const e of a.episodes) console.log(`    ${e.kind.padEnd(6)} ${e.months.join(',')}  shown at cut-offs ${e.shownFrom}..${e.shownTo} (${e.cuts} turn-cut-offs)`);
    console.log(`  (no bar) false episodes, turn months 1970 on: ${a.episodes1970.length}: ${a.episodes1970.map((e) => `${e.kind} ${e.months[0]} [${e.shownFrom}..${e.shownTo}]`).join('; ')}`);
  };
  console.log(`Composite turns on real FRED-MD vintages (V) and on today's revised data (P): PAYEMS, W875RX1, INDPRO, ${FROM} on,`);
  console.log(`vintages ${FIRST} to ${LAST} (data to two months before each), sd weights over every month, bigMove ${BIG}, 3-month phases`);
  show('V real vintages', r.V);
  show('P pseudo-real time (today\'s files)', r.P);
  console.log(`\nper-turn delay, V minus P: ${r.V.calls.map((c, i) => `${c.month} ${r.worse[i] >= 0 ? '+' : ''}${r.worse[i]}`).join(', ')}`);
  console.log(`V1 all six called on vintages: ${r.V1 ? 'passes' : 'fails'} (${r.V.called})`);
  console.log(`V2 median at most 2 over P's, no turn over 6 later: ${r.V2 ? 'passes' : 'fails'} (${r.V.median} vs ${r.P.median}; worst ${Math.max(...r.worse)})`);
  console.log(`V3 false episodes at most P's + 1: ${r.V3 ? 'passes' : 'fails'} (${r.V.episodes.length} vs ${r.P.episodes.length})`);
  console.log(`V4 before NBER on at least P's - 1: ${r.V4 ? 'passes' : 'fails'} (${r.V.before} vs ${r.P.before})`);
  console.log(`decision: ${r.pass ? 'V1-V4 pass: the pseudo-real-time replays are a fair stand-in on this composite' : 'a bar fails: the README marks the replays\' delays as optimistic by what revisions cost'}`);

  console.log('\n=== printed, no bar ===');
  for (const [lab, opt] of [['P6 sd', { minPhase: 6 }], ['P3 mad', { scale: 'mad' }], ['P6 mad', { minPhase: 6, scale: 'mad' }]]) {
    const v = score(replay('V', opt)), p = score(replay('P', opt));
    const d = (a) => a.calls.map((c) => c.delay).join(' ');
    console.log(`${lab.padEnd(7)} V: ${v.called}/6, delays ${d(v)}, median ${v.median}, before ${v.before}, false ${v.episodes.length} | P: ${p.called}/6, delays ${d(p)}, median ${p.median}, before ${p.before}, false ${p.episodes.length}`);
  }
  const p4 = score(replay('P4'));
  console.log(`shipped four (with CMRMTSPL), today's files, P3 sd: ${p4.called}/6, delays ${p4.calls.map((c) => c.delay).join(' ')}, median ${p4.median}, before ${p4.before}, false ${p4.episodes.length}`);
  const rv = replay('V');
  console.log('\nvintage weights (PAYEMS/W875RX1/INDPRO) and the vintage month each component came from, every 24th cut-off:');
  for (let j = 0; j < rv.length; j += 24) console.log(`  ${rv[j].pub}: ${rv[j].weights.map((w) => w.toFixed(3)).join('/')}  rows to ${rv[j].used.join(', ')}`);
  const last = rv[rv.length - 1];
  console.log(`  ${last.pub}: ${last.weights.map((w) => w.toFixed(3)).join('/')}  rows to ${last.used.join(', ')}`);
}
