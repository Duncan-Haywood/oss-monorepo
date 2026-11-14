// Writes 3,000 random elections with this engine's IRV winner and Schulze ranking,
// for crosscheck/check.py to recount with an independent Python implementation:
//   node crosscheck/gen.mjs > /tmp/cases.json && python3 crosscheck/check.py /tmp/cases.json
import { parseBallots, irv, schulze } from "../ballots.mjs";
let s = 12345; const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const out = [];
for (let e = 0; e < 3000; e++) {
  const nc = 3 + Math.floor(rand() * 6), nb = 10 + Math.floor(rand() * 200);
  const names = Array.from({ length: nc }, (_, i) => "C" + i);
  const lines = [];
  for (let i = 0; i < nb; i++) { const o = names.slice().sort(() => rand() - 0.5).slice(0, 1 + Math.floor(rand() * nc)); lines.push(o.join(" > ")); }
  const p = parseBallots(lines.join("\n"));
  const r = irv(p); const sc = schulze(p);
  out.push({ ballots: lines, cands: p.candidates, irv: r.winner, byLot: r.rounds.some((x) => x.byLot), anyTie: r.rounds.some((x) => x.tie), schulze: sc.ranking });
}
process.stdout.write(JSON.stringify(out));
