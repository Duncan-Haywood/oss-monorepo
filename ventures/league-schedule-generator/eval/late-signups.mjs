// Late sign-ups (teams.mjs addLateSignups): players who join after teams were announced, placed onto
// those teams. Compared on invented lists (ratings 1-5, ~40% tagged F, ~20% also G):
//  - "least-filled": each late player, strongest first, to the smallest team, ties to the lowest total
//    (the rule the self-hosted page's free-agent placement uses);
//  - shipped, nobody announced moves (maxMoves 0), and with up to 2 announced players allowed to move;
//  - a full redraft of everyone (what an organiser gives up by not reshuffling).
// Small cases also against the exhaustive search with the same pins.
// Run: node eval/late-signups.mjs > eval/late-signups.txt
import { parsePlayers, parseTeamsCsv, balanceTeams, addLateSignups, checkTeams } from "../teams.mjs";

function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const tagOf = (r) => `${r() < 0.4 ? "F" : "M"}${r() < 0.2 ? " G" : ""}`;

// Returns its spread and whether it broke the size or tag rule the shipped search keeps (each tag's
// count per team within one, judged only where the shipped search kept it too).
function leastFilled(parsed, before) {
  const teams = before.teams.map((T) => ({ n: T.players.length, total: T.players.reduce((s, p) => s + p.rating, 0), tags: T.players.flatMap((p) => p.tags) }));
  const late = [...parsed.players].sort((a, b) => b.rating - a.rating);
  for (const p of late) {
    let b = 0;
    teams.forEach((T, t) => { if (T.n < teams[b].n || (T.n === teams[b].n && T.total < teams[b].total)) b = t; });
    teams[b].n++; teams[b].total += p.rating; teams[b].tags.push(...p.tags);
  }
  const tot = teams.map((T) => T.total);
  const ns = teams.map((T) => T.n);
  let broke = Math.max(...ns) - Math.min(...ns) > 1;
  for (const tg of new Set(teams.flatMap((T) => T.tags))) {
    const c = teams.map((T) => T.tags.filter((x) => x === tg).length);
    if (Math.max(...c) - Math.min(...c) > 1) broke = true;
  }
  return { spread: Math.max(...tot) - Math.min(...tot), broke };
}

const r = rng(20261119);
console.log("Announced teams drafted by balanceTeams from a first list, then late players join.");
console.log("Spreads are strongest minus weakest team total (lower is better); means over cases.");
console.log("");
console.log("least-filled breaks = cases where it left a team over size or a tag (F, M, G) split by 2+ while the shipped");
console.log("placement (0 moves) kept every rule. anneal=exh = annealing alone (exhaustive fallback off) equals the exhaustive");
console.log("search with the same pins, of the cases the exhaustive search finished (n <= 16 only).");
console.log("");
console.log("n  k  late  cases  least-filled(mean)  least-filled-breaks  shipped-0(mean)  shipped-0-on-lf-clean(mean, lf mean)  shipped-2(mean)  redraft(mean)  anneal=exh  faults  moved-2(mean)  ms-0(max)");
for (const [n, k, late, cases, exact] of [[9, 3, 3, 40, true], [12, 3, 3, 40, true], [12, 4, 4, 40, true], [40, 4, 4, 30, false], [80, 8, 8, 20, false], [160, 16, 12, 10, false]]) {
  let lf = 0, lfBreaks = 0, clean = 0, cleanS0 = 0, cleanLf = 0, s0 = 0, s2 = 0, rd = 0, atEx = 0, exCases = 0, faults = 0, mv = 0, msMax = 0;
  for (let c = 0; c < cases; c++) {
    const first = Array.from({ length: n }, (_, i) => `P${i},${1 + Math.floor(r() * 5)},${tagOf(r)}`);
    const draft = balanceTeams(parsePlayers(first.join("\n")), k, { seed: c + 1 });
    const csv = ["Team,Player,Rating,Tag", ...draft.teams.flatMap((T) => T.players.map((p) => `${T.name},${p.name},${p.rating},${p.tag}`))].join("\n");
    const before = parseTeamsCsv(csv);
    const lateLines = Array.from({ length: late }, (_, i) => `L${i},${1 + Math.floor(r() * 5)},${tagOf(r)}`);
    const box = parsePlayers(lateLines.join("\n"));
    const L = leastFilled(box, before);
    lf += L.spread;
    const t0 = performance.now();
    const a = addLateSignups(box, before, { seed: 1 });
    msMax = Math.max(msMax, performance.now() - t0);
    if (L.broke && !a.broken.length) lfBreaks++;
    if (!L.broke) { clean++; cleanS0 += a.spread; cleanLf += L.spread; }
    const b = addLateSignups(box, before, { seed: 1, maxMoves: 2 });
    s0 += a.spread; s2 += b.spread; mv += b.moved.length;
    for (const x of [a, b]) faults += checkTeams(x.parsed, x, x.before).filter((f) => !(x.broken.length && /^Tag |differ/.test(f))).length;
    rd += balanceTeams(parsePlayers([...first, ...lateLines].join("\n")), k, { seed: 1 }).spread;
    if (exact) {
      const ex = addLateSignups(box, before, { seed: 1, iterations: 0, restarts: 1, exactNodes: 1e8 });
      const bare = addLateSignups(box, before, { seed: 1, exactUpTo: 0 });
      if (ex.exhaustive && !ex.broken.length) { exCases++; if (Math.abs(ex.spread - bare.spread) < 1e-9 && !bare.broken.length) atEx++; }
    }
  }
  const m = (x) => (x / cases).toFixed(2);
  const cm = (x) => (clean ? (x / clean).toFixed(2) : "-");
  console.log(`${n} ${k}  ${late}  ${cases}  ${m(lf)}  ${lfBreaks}  ${m(s0)}  ${cm(cleanS0)} vs ${cm(cleanLf)} (${clean})  ${m(s2)}  ${m(rd)}  ${exact ? `${atEx}/${exCases}` : "-"}  ${faults}  ${m(mv)}  ${Math.round(msMax)}`);
}
