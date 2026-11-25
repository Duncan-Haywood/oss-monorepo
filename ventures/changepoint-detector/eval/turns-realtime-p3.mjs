// The pseudo-real-time replay of README "Turns called in pseudo-real time", rerun under the 3-month phase minimum
// that monthly `--turns --columns` now uses by default (README "P3 and the heavy-late warning together", shipped the
// same day, after the first replay was registered). That README section names this as the next item.
//
// Pre-registered 2026-11-24, written and committed before this script was first run. Seen beforehand: the 6-month
// replay (median delay 7; 15 of 16 called, the 2001-03 peak lost once 2020 sets the weights; 7 of 12 before NBER;
// 4 retracted alarms; survival 65/74/85/90/100% by age group) and the full-sample P3 result on the same composite
// (16 of 16 NBER turns, 2 false: peak 2002-11, trough 2003-04). P3 has not been replayed.
//
// Same data, cut-offs, release lag (2 months), call rule, retracted-alarm rule and survival rule as
// eval/turns-realtime.mjs (its `analyse`), with turningPoints(index, { frequency: 'monthly', bigMove: 0.05,
// minPhase: 3 }). Primary arm: sds over every month to the cut-off. Printed, no bar: sds fixed to 2019-12.
//
// Expectation written down beforehand: P3 should call short contractions sooner but add retracted alarms (the
// full sample already shows the 2002-11/2003-04 pair, which will stand at every cut-off from about 2003 on and so
// counts as two episodes); the 2001 peak problem is the weights', so P3 is not expected to fix it.
//
// Bars (the first replay's bars, so the two rules are judged alike, plus one comparison):
//   Q1 at least 15 of the 16 NBER turns called and median delay at most 7 months (no slower than the 6-month rule);
//   Q2 called before NBER's announcement in at least 8 of the 12 announced turns (R2);
//   Q3 at most 6 retracted-alarm episodes, 1970-2026 (R3);
//   Q4 survival non-decreasing across the five age groups and age 12+ held in >= 90% (R4).
// Ships if Q1-Q4 pass: the note the first round planned, on monthly `--turns --columns` only (the default now
// uses P3): for the latest dated turn, months of data after it and the share of turns of that age group that held
// in this replay (`--json`: composite.latestTurn.age, .heldShare). If any bar fails, nothing ships and the table
// stays in the README beside the 6-month one.
//
// usage: node eval/turns-realtime-p3.mjs > eval/turns-realtime-p3.out.txt
import { pathToFileURL } from 'node:url';
import { replay, analyse, START, LAG, FAR, CENSOR } from './turns-realtime.mjs';

export const MIN_PHASE = 3;

export function run({ sdFixed = false } = {}) {
  const p3 = analyse(replay({ sdFixed, minPhase: MIN_PHASE }));
  const called = p3.calls.filter((c) => c.delay !== null).length;
  const Q1 = called >= 15 && p3.median <= 7;
  const Q2 = p3.before >= 8;
  const Q3 = p3.episodes.length <= 6;
  const Q4 = p3.R4;
  return { ...p3, called, Q1, Q2, Q3, Q4 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pct = (v) => v === null ? '-' : `${(100 * v).toFixed(1)}%`;
  const p6 = analyse(replay());
  for (const sdFixed of [false, true]) {
    const a = run({ sdFixed });
    const b = sdFixed ? analyse(replay({ sdFixed: true })) : p6;
    const L = a.label;
    console.log(sdFixed
      ? '\n\n=== printed, no bar: standard deviations fixed to 2019-12 for cut-offs after 2019-12 ==='
      : `Pseudo-real-time replay of \`--turns --columns\` under minPhase ${MIN_PHASE} (arm A composite, sds over every month to the cut-off, bigMove 0.05)`);
    console.log(`cut-offs ${START} to ${L[L.length - 1]}; release lag ${LAG} months; call = first cut-off held at every later one; 6-month delay beside it\n`);
    console.log('NBER turn  kind    called on data to  call month  delay(P3)  delay(P6)  NBER announced  call first?');
    a.calls.forEach((c, k) => console.log(`  ${c.month}  ${c.kind.padEnd(6)}  ${String(c.call).padEnd(17)}  ${String(c.callMonth).padEnd(10)}  ${String(c.delay).padStart(9)}  ${String(b.calls[k].delay).padStart(9)}  ${String(c.ann ?? '-').padEnd(14)}  ${c.before === null ? '-' : c.before ? 'yes' : 'no'}`));
    console.log(`\ncalled ${a.called} of ${a.calls.length}; median delay ${a.median} (6-month rule ${b.median}); before NBER in ${a.before} of ${a.announced} (6-month rule ${b.before})`);
    console.log(`\nretracted-alarm episodes (no NBER turn of the kind within ${FAR} months): ${a.episodes.length} (6-month rule ${b.episodes.length})`);
    for (const e of a.episodes) console.log(`  ${e.kind.padEnd(6)} ${e.months.map((i) => L[i]).join(',')}  shown on data to ${L[e.first]}..${L[e.last]} (${e.cuts} turn-cut-offs)`);
    console.log(`\nsurvival of a dated turn by months of data after it (cut-offs to ${CENSOR} months before the last):`);
    a.groups.forEach((g, k) => console.log(`  age ${String(g.lo).padStart(2)}-${g.hi === Infinity ? '  ' : String(g.hi).padStart(2)}  held ${String(g.held).padStart(4)} of ${String(g.n).padStart(4)}  ${pct(g.share)}  (6-month rule ${pct(b.groups[k].share)})`));
    console.log(`  age 12+ held ${pct(a.oldShare)}`);
    if (!sdFixed) {
      console.log(`\nQ1 >= 15 of 16 called and median delay <= 7: ${a.Q1 ? 'passes' : 'fails'} (${a.called}, ${a.median})`);
      console.log(`Q2 before NBER in >= 8 of 12: ${a.Q2 ? 'passes' : 'fails'} (${a.before})`);
      console.log(`Q3 retracted episodes <= 6: ${a.Q3 ? 'passes' : 'fails'} (${a.episodes.length})`);
      console.log(`Q4 survival non-decreasing by age group and 12+ >= 90%: ${a.Q4 ? 'passes' : 'fails'} (${a.groups.map((g) => pct(g.share)).join(', ')}; 12+ ${pct(a.oldShare)})`);
      console.log(`decision: ${a.Q1 && a.Q2 && a.Q3 && a.Q4 ? 'Q1-Q4 pass; the latest turn\'s age and held share ship on monthly --turns --columns' : 'a bar fails; nothing ships'}`);
    }
  }
}
