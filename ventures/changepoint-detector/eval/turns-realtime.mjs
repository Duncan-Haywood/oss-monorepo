// The shipped `--turns --columns` composite replayed month by month: how long after a turn the rule calls it for
// good, how that compares with NBER's announcements, how many turns it calls and later takes back, and how often
// a turn of a given age survives.
//
// Open item from README "A composite of NBER's monthly indicators dates every turn": "the composite in real time
// (each month's vintage as it was published, ALFRED, when its host answers) to measure how many months after
// NBER's announcement-free date the rule confirms a turn". ALFRED (alfred.stlouisfed.org) and the Philadelphia
// Fed's real-time data set were refused by this session's proxy (2026-11-24), so this round is pseudo-real-time:
// today's final vintage cut off at each month. Revisions are not in it; the 2001 GDP history (README "BBQ on FRED
// GDPC1") shows they can move a date, so real vintages remain the open item.
//
// Pre-registered 2026-11-24, written and committed before this script was first run. Seen beforehand: the
// full-sample result (arm A dates 16 of 16 NBER turns within 3 months, 0 false, weights 0.541/0.189/0.152/0.117
// with sds to 2019-12) and the GDPC1 lag readout (eval/turns-gdpc1-lag.out.txt). The replay itself has not been
// run on the composite.
//
// Data: arm A of eval/turns-composite.mjs (PAYEMS, W875RX1, INDPRO, CMRMTSPL), 1967-01 to 2026-07, final vintage.
// Replay: for each cut-off T from 1970-01 (36 months in) to 2026-07, build the composite on months 0..T with the
// standard deviations over every month to T (all a user had; primary), then turningPoints(index, { frequency:
// 'monthly', bigMove: 0.05 }), the shipped `--turns --columns` default. Printed, no bar: sds fixed to 2019-12
// for cut-offs after 2019-12, as the page example does.
// Release lag: data through month T is taken as known at the end of month T + 2 (real manufacturing and trade
// sales, the slowest of the four, comes out about two months after the month; payrolls after one). So a call
// made on data to T is dated T + 2.
//
// Call of an NBER turn: the first cut-off T such that the replay at T, and at every later cut-off, has a turn of
// the same kind within 3 months of the NBER month. Delay = T + 2 - the NBER month, in months.
// Retracted alarm: a (kind, month) dated at some cut-off whose month is 1970-01 or later, with no NBER turn of the
// same kind within 6 months, counted once per distinct episode (alarms of one kind within 6 months of each other
// are one episode). A false turn still standing at the last cut-off counts too (the full sample has none).
// Survival: every (cut-off T, dated turn) pair with T at least 24 months before the last cut-off; age = T - turn
// month; held = every cut-off after T has a turn of the same kind within 3 months of it. Ages grouped 0-5, 6-8,
// 9-11, 12-17, 18+.
// NBER announcement dates (NBER's "US Business Cycle Expansions and Contractions" table; nber.org refused from
// this container, so transcribed, not fetched) for the 12 turns 1980-01 to 2020-04, in ANNOUNCED below.
//
// Bars:
//   R1 median delay over the 16 NBER turns at most 9 months;
//   R2 the call month is before NBER's announcement month in at least 8 of the 12 announced turns;
//   R3 at most 6 retracted-alarm episodes, 1970-2026;
//   R4 survival rises with age group (non-decreasing across the five groups) and age 12+ is held in >= 90%.
// Ships if R1-R4 pass: the CLI's `--turns` text and the page's summary say, for the latest turn, how many months
// of data follow it and the share of turns of that age that held in this replay (`--json`: latest.age,
// latest.heldShare). Monthly only (the replay is monthly). If any bar fails, nothing ships; the table stays here.
//
// usage: node eval/turns-realtime.mjs > eval/turns-realtime.out.txt
import { pathToFileURL } from 'node:url';
import { turningPoints } from '../turning-points.mjs';
import { compositeIndex } from '../composite-index.mjs';
import { load, ARMS } from './turns-composite.mjs';

export const LAG = 2, START = '1970-01', NEAR = 3, FAR = 6, BIG = 0.05, CENSOR = 24;
export const AGE_GROUPS = [[0, 5], [6, 8], [9, 11], [12, 17], [18, Infinity]];
// NBER turn month -> announcement month
export const ANNOUNCED = {
  '1980-01': '1980-06', '1980-07': '1981-07', '1981-07': '1982-01', '1982-11': '1983-07',
  '1990-07': '1991-04', '1991-03': '1992-12', '2001-03': '2001-11', '2001-11': '2003-07',
  '2007-12': '2008-12', '2009-06': '2010-09', '2020-02': '2020-06', '2020-04': '2021-07',
};

const monthIndex = (m) => { const [y, mo] = m.split('-').map(Number); return y * 12 + mo - 1; };
const monthLabel = (k) => `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`;

export function replay({ sdFixed = false, minPhase = null, scale = 'sd' } = {}) {
  const s = load();
  const parts = ARMS[0].parts.map((p) => s.values[p]);
  const sdTo = s.sdTo;
  const t0 = s.label.indexOf(START);
  const cuts = [];
  for (let T = t0; T < s.n; T++) {
    const cut = parts.map((x) => x.slice(0, T + 1));
    const hi = sdFixed && T + 1 > sdTo ? sdTo : T + 1;
    const c = compositeIndex(cut, { sdWindow: [1, hi], scale });
    cuts.push({ T, turns: turningPoints(c.index, { frequency: 'monthly', bigMove: BIG, ...(minPhase ? { minPhase } : {}) }).turns });
  }
  return { s, cuts };
}

export function analyse({ s, cuts }) {
  const last = cuts[cuts.length - 1].T;
  const has = (c, kind, i, near) => c.turns.some((x) => x.kind === kind && Math.abs(x.i - i) <= near);
  const calls = s.turns.map((t) => {
    let call = null;
    for (let j = cuts.length - 1; j >= 0 && cuts[j].T >= t.i; j--) { if (has(cuts[j], t.kind, t.i, NEAR)) call = cuts[j].T; else break; }
    const month = s.label[t.i];
    const delay = call === null ? null : call + LAG - t.i;
    const callMonth = call === null ? null : monthLabel(monthIndex(s.label[call]) + LAG);
    const ann = ANNOUNCED[month] ?? null;
    const annLag = ann ? monthIndex(ann) - monthIndex(month) : null;
    return { month, kind: t.kind, call: call === null ? null : s.label[call], callMonth, delay, ann, annLag, before: ann && callMonth ? callMonth < ann : null };
  });
  // retracted alarms
  const t0 = s.label.indexOf(START);
  const alarms = new Map();
  for (const c of cuts) for (const x of c.turns) {
    if (x.i < t0) continue;
    if (s.turns.some((t) => t.kind === x.kind && Math.abs(t.i - x.i) <= FAR)) continue;
    const key = `${x.kind} ${x.i}`;
    if (!alarms.has(key)) alarms.set(key, { kind: x.kind, i: x.i, first: c.T, last: c.T, cuts: 0 });
    const a = alarms.get(key); a.last = c.T; a.cuts++;
  }
  const sorted = [...alarms.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.i - b.i);
  const episodes = [];
  for (const a of sorted) {
    const e = episodes.find((e) => e.kind === a.kind && Math.abs(e.hi - a.i) <= FAR);
    if (e) { e.hi = Math.max(e.hi, a.i); e.months.push(a.i); e.first = Math.min(e.first, a.first); e.last = Math.max(e.last, a.last); e.cuts += a.cuts; }
    else episodes.push({ kind: a.kind, lo: a.i, hi: a.i, months: [a.i], first: a.first, last: a.last, cuts: a.cuts });
  }
  episodes.sort((a, b) => a.lo - b.lo);
  // survival by age
  const groups = AGE_GROUPS.map(([lo, hi]) => ({ lo, hi, n: 0, held: 0 }));
  const byAge = new Map();
  for (let j = 0; j < cuts.length; j++) {
    const c = cuts[j];
    if (c.T > last - CENSOR) break;
    for (const x of c.turns) {
      const age = c.T - x.i;
      let held = true;
      for (let k = j + 1; k < cuts.length; k++) if (!has(cuts[k], x.kind, x.i, NEAR)) { held = false; break; }
      const g = groups.find((g) => age >= g.lo && age <= g.hi);
      g.n++; if (held) g.held++;
      const b = byAge.get(age) ?? { n: 0, held: 0 }; b.n++; if (held) b.held++; byAge.set(age, b);
    }
  }
  for (const g of groups) g.share = g.n ? g.held / g.n : null;
  const ds = calls.map((c) => c.delay).filter((d) => d !== null).sort((a, b) => a - b);
  const median = ds.length % 2 ? ds[(ds.length - 1) / 2] : (ds[ds.length / 2 - 1] + ds[ds.length / 2]) / 2;
  const announced = calls.filter((c) => c.ann);
  const before = announced.filter((c) => c.before).length;
  const old = groups.filter((g) => g.lo >= 12);
  const oldShare = old.reduce((a, g) => a + g.held, 0) / old.reduce((a, g) => a + g.n, 0);
  const R1 = ds.length === s.turns.length && median <= 9;
  const R2 = before >= 8;
  const R3 = episodes.length <= 6;
  const R4 = groups.every((g, k) => k === 0 || g.share >= groups[k - 1].share) && oldShare >= 0.90;
  return { calls, median, before, announced: announced.length, episodes, groups, byAge, oldShare, R1, R2, R3, R4, label: s.label };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pct = (v) => v === null ? '-' : `${(100 * v).toFixed(1)}%`;
  for (const sdFixed of [false, true]) {
    const a = analyse(replay({ sdFixed }));
    const L = a.label;
    console.log(sdFixed
      ? '\n\n=== printed, no bar: standard deviations fixed to 2019-12 for cut-offs after 2019-12 ==='
      : 'Pseudo-real-time replay of `--turns --columns` (arm A composite, sds over every month to the cut-off, bigMove 0.05)');
    console.log(`cut-offs ${START} to ${L[L.length - 1]}; release lag ${LAG} months; call = first cut-off held at every later one\n`);
    console.log('NBER turn       kind    called on data to  call month  delay  NBER announced  NBER lag  call first?');
    for (const c of a.calls) console.log(`  ${c.month}       ${c.kind.padEnd(6)}  ${String(c.call).padEnd(17)}  ${String(c.callMonth).padEnd(10)}  ${String(c.delay).padStart(5)}  ${String(c.ann ?? '-').padEnd(14)}  ${String(c.annLag ?? '-').padStart(8)}  ${c.before === null ? '-' : c.before ? 'yes' : 'no'}`);
    const pk = a.calls.filter((c) => c.kind === 'peak').map((c) => c.delay).sort((x, y) => x - y);
    const tr = a.calls.filter((c) => c.kind === 'trough').map((c) => c.delay).sort((x, y) => x - y);
    console.log(`\nmedian delay ${a.median} months (peaks ${pk.join(' ')}; troughs ${tr.join(' ')})`);
    const annLags = a.calls.filter((c) => c.ann).map((c) => c.annLag).sort((x, y) => x - y);
    console.log(`NBER announcement lags on the 12: ${annLags.join(' ')}; called before NBER in ${a.before} of ${a.announced}`);
    console.log(`\nretracted-alarm episodes (no NBER turn of the kind within ${FAR} months): ${a.episodes.length}`);
    for (const e of a.episodes) console.log(`  ${e.kind.padEnd(6)} ${e.months.map((i) => L[i]).join(',')}  shown on data to ${L[e.first]}..${L[e.last]} (${e.cuts} turn-cut-offs)`);
    console.log(`\nsurvival of a dated turn by months of data after it (cut-offs to ${CENSOR} months before the last):`);
    for (const g of a.groups) console.log(`  age ${String(g.lo).padStart(2)}-${g.hi === Infinity ? '  ' : String(g.hi).padStart(2)}  held ${String(g.held).padStart(4)} of ${String(g.n).padStart(4)}  ${pct(g.share)}`);
    console.log(`  age 12+ held ${pct(a.oldShare)}`);
    const ages = [...a.byAge.keys()].filter((k) => k <= 18).sort((x, y) => x - y);
    console.log(`  by single month 0-18: ${ages.map((k) => `${k}:${pct(a.byAge.get(k).held / a.byAge.get(k).n)}(${a.byAge.get(k).n})`).join(' ')}`);
    if (!sdFixed) {
      console.log(`\nR1 median delay <= 9: ${a.R1 ? 'passes' : 'fails'} (${a.median})`);
      console.log(`R2 before NBER in >= 8 of 12: ${a.R2 ? 'passes' : 'fails'} (${a.before})`);
      console.log(`R3 retracted episodes <= 6: ${a.R3 ? 'passes' : 'fails'} (${a.episodes.length})`);
      console.log(`R4 survival non-decreasing by age group and 12+ >= 90%: ${a.R4 ? 'passes' : 'fails'} (${a.groups.map((g) => pct(g.share)).join(', ')}; 12+ ${pct(a.oldShare)})`);
      console.log(`decision: ${a.R1 && a.R2 && a.R3 && a.R4 ? 'R1-R4 pass; the latest turn\'s age and held share ship on --turns' : 'a bar fails; nothing ships'}`);
    }
  }
}
