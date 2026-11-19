// Pre-registered (this header committed before the script first ran on the data): the shipped weekday spell score
// (update-rate.mjs `spellsResult` with its default SHORT_SPELLS = { score: 'weekdays', arm: 'A', beta: 4, mult: 2.5 },
// the setting behind CLI `--spells` and the page's box since README "Short spells scored on the weekdays that differ")
// on The New York Times' state series, the fresh-provider check that failed the earlier 'dow' search (README "Short
// spells on a second provider": N1 2 of 4, N2 5 of 9). That README section's last line asked for exactly this:
// "that rerun as a fresh pre-registered check".
//
// The data: NYT covid-19-data us-states.csv, fetched by eval/nyt-states-fetch.sh and not committed; read and filled
// exactly as eval/update-rate-spells-nyt.mjs does (readNyt, imported). The labels, the 35 states, the +-10 day rule
// and the "explained" rule are that script's, imported unchanged.
//
// Disclosure, what is already known before this script runs: (a) the 'dow' search's NYT verdicts and the post hoc
// reading of them (eval/update-rate-spells-nyt.out.txt, ...-nyt-why.out.txt) were read: South Dakota and Arkansas
// hit; Alaska's spell is cut at both edges by the default update-rate line (2021-06-04, 2021-08-01), so the search
// has nothing left inside and the edge restatement dates it; Nebraska's documented Wednesdays-only spell is in
// neither provider's series; Nebraska 2022-05-06..10-30 is a real schedule change on both providers that the JHU
// README does not list, so it counts as unexplained under the rule. (b) On JHU's series the weekday score reports the
// same eight spells as 'dow' (edges within 11 days). (c) What the weekday score reports on any NYT state has NOT
// been looked at. The default update-rate line, and so the edge spells, does not depend on the score.
//
// So the original N1 (search only) is expected to fail on Alaska and Nebraska whatever the score does; it is
// reported for comparison, not a bar. The bars are:
// W1 (bar): the line a user reads (search spells plus the edge spells it prints, i.e. edges not overlapping a search
//     spell) dates each of the four documented returns when a spell's last day is within +-10 days of the return.
//     Pass: at least 3 of 4. Given (a), this mostly asks whether the weekday score keeps South Dakota and Arkansas.
// W2 (bar): unexplained SEARCH spells over the 35 states (the original N2 rule and bar). Pass: at most 3.
//     (The 'dow' search had 5 of 9; one of them, Nebraska 2022, is known real, see (a).)
// W3 (descriptive): everything the line prints, search and edge spells, explained or not.
// W4 (descriptive): per state, the weekday score's spells beside the 'dow' search's on the same NYT series, and the
//     N3 agreement with JHU's K2 spells (Kentucky's JHU spell taken to 2022-04-05, as the weekday score reports it).
// Pass W1 and W2: README says the weekday score replicates on a second provider where the 'dow' search did not;
// the line stays an opt-in either way (one provider, labels reused from JHU). Fail: README says which bar and why it
// might, read afterwards and marked post hoc. Nothing in update-rate.mjs changes on either outcome.
// usage: sh eval/nyt-states-fetch.sh nyt-data && node eval/update-rate-spells-weekdays-nyt.mjs nyt-data > eval/update-rate-spells-weekdays-nyt.out.txt
import { spellsResult, SHORT_SPELLS } from '../update-rate.mjs';
import { readNyt, explained, agrees, daysApart, RETURNS, STATES, JHU_SPELLS, TOL } from './update-rate-spells-nyt.mjs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const JHU_SPELLS_WEEKDAYS = JHU_SPELLS.map((s) => (s.state === 'Kentucky' ? { ...s, to: '2022-04-05' } : s));

/** Search spells plus the edge spells the line prints (those not overlapping a search spell), each tagged. */
export function lineSpells(r) {
  if (!r || r.refused) return [];
  const edges = (r.edgeSpells || []).filter((e) => !r.spells.some((s) => s.from <= e.to && e.from <= s.to));
  return [...r.spells.map((s) => ({ ...s, source: 'search' })), ...edges.map((e) => ({ ...e, source: 'edge' }))];
}

export function evaluate(by) {
  const res = new Map(), dow = new Map();
  for (const st of STATES) {
    const x = by.get(st);
    if (!x) continue;
    res.set(st, spellsResult(x.values, x.dates));
    dow.set(st, spellsResult(x.values, x.dates, { score: 'dow' }));
  }
  const w1 = RETURNS.map((e) => ({ ...e, hit: lineSpells(res.get(e.state)).find((s) => daysApart(s.toLabel, e.date) <= TOL) || null }));
  const n1 = RETURNS.map((e) => ({ ...e, hit: (res.get(e.state)?.spells || []).find((s) => daysApart(s.toLabel, e.date) <= TOL) || null }));
  const search = [], line = [];
  for (const st of STATES) {
    const r = res.get(st);
    if (!r || r.refused) continue;
    for (const s of r.spells) search.push({ state: st, ...s, why: explained(st, s) });
    for (const s of lineSpells(r)) line.push({ state: st, ...s, why: explained(st, s) });
  }
  return { res, dow, w1, n1, search, line, W1: w1.filter((e) => e.hit).length, W2: search.filter((s) => !s.why).length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const t0 = Date.now();
  const by = readNyt(join(process.argv[2] || 'nyt-data', 'us-states.csv'));
  const { res, dow, w1, n1, search, line, W1, W2 } = evaluate(by);
  const pct = (v) => `${(100 * v).toFixed(0)}%`;
  const fmt = (s) => s.source === 'edge'
    ? `${s.fromLabel}..${s.toLabel} (${s.steps} days, edge) ${pct(s.shareInside)} inside, ${pct(s.shareBefore)} before, ${pct(s.shareAfter)} after`
    : `${s.fromLabel}..${s.toLabel} (${s.steps} days, ${s.kind}) ${pct(s.shareInside)} inside, ${pct(s.shareOutside)} around, gain ${s.gain.toFixed(1)}`;
  console.log(`Setting: ${JSON.stringify(SHORT_SPELLS)}`);
  console.log('\nW1: the line (search + printed edge spells) ends a spell within +-10 days of a documented return');
  for (const e of w1) console.log(`  ${e.state.padEnd(14)} return ${e.date}: ${e.hit ? `HIT ${fmt(e.hit)}` : 'missed'}`);
  console.log(`W1 ${W1} of ${w1.length} (bar >= 3): ${W1 >= 3 ? 'pass' : 'FAIL'}`);
  console.log(`  (original N1, search spells only, reported: ${n1.filter((e) => e.hit).length} of ${n1.length}; 'dow' had 2 of 4)`);

  console.log('\nW2: search spells on the 35 states, with the documented event that explains it (either end within +-10 days)');
  for (const s of search) console.log(`  ${s.state.padEnd(21)} ${fmt(s)}${s.kind === 'weekdays' ? ` [${s.weekdays}]` : ''} -> ${s.why ? `${s.why.date} ${s.why.what}` : 'UNEXPLAINED'}`);
  console.log(`W2 ${W2} unexplained of ${search.length} search spells (bar <= 3; 'dow' had 5 of 9): ${W2 <= 3 ? 'pass' : 'FAIL'}`);

  console.log('\nW3 (descriptive): everything the line prints');
  for (const s of line.filter((x) => x.source === 'edge')) console.log(`  edge ${s.state.padEnd(21)} ${fmt(s)} -> ${s.why ? `${s.why.date} ${s.why.what}` : 'UNEXPLAINED'}`);
  console.log(`  ${line.length} spells printed (${search.length} search, ${line.length - search.length} edge), ${line.filter((s) => !s.why).length} unexplained`);

  console.log('\nW4 (descriptive): weekday score beside the dow search, per state with a spell on either');
  for (const st of STATES) {
    const a = res.get(st), b = dow.get(st);
    if (!a || a.refused) continue;
    if (!a.spells.length && !b.spells.length) continue;
    const l = (r) => r.spells.map((s) => `${s.fromLabel}..${s.toLabel}`).join(', ') || '-';
    console.log(`  ${st.padEnd(21)} weekdays: ${l(a).padEnd(46)} dow: ${l(b)}`);
  }
  let jInN = 0;
  for (const j of JHU_SPELLS_WEEKDAYS) {
    const m = search.find((n) => n.state === j.state && agrees(j, { from: n.fromLabel, to: n.toLabel })); if (m) jInN++;
    console.log(`  JHU ${j.state.padEnd(21)} ${j.from}..${j.to}: ${m ? `NYT ${m.fromLabel}..${m.toLabel}` : 'no NYT spell'}`);
  }
  const nInJ = search.filter((n) => JHU_SPELLS_WEEKDAYS.some((j) => j.state === n.state && agrees(j, { from: n.fromLabel, to: n.toLabel }))).length;
  console.log(`  ${jInN} of ${JHU_SPELLS_WEEKDAYS.length} JHU spells seen in NYT; ${nInJ} of ${search.length} NYT spells seen in JHU`);
  console.log(`\nVerdict: ${W1 >= 3 && W2 <= 3 ? 'PASS (W1 and W2)' : `FAIL (${[W1 < 3 && 'W1', W2 > 3 && 'W2'].filter(Boolean).join(' and ')})`}`);
  console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
