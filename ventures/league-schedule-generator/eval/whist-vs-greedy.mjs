// Whist designs against the greedy Americano search, same players, courts and (default) rounds.
// For each size: rounds, games per player, repeat partnerships, pairs who never partner, and the
// spread of how often a pair meets as opponents (a whist design: every pair exactly twice).
// Usage: node eval/whist-vs-greedy.mjs > eval/whist-vs-greedy.txt
import { americano, americanoStats, validateAmericano } from "../calc.mjs";
const row = (label, P, plan) => {
  const n = P.length, st = americanoStats(P, plan);
  let lo = Infinity, hi = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { lo = Math.min(lo, plan.opponent[i][j]); hi = Math.max(hi, plan.opponent[i][j]); }
  const ok = validateAmericano(P, plan).length === 0 ? "valid" : "INVALID";
  return `${label.padEnd(7)} rounds ${String(plan.rounds.length).padStart(2)}  games ${Math.min(...st.games)}-${Math.max(...st.games)}  repeat partners ${String(st.repeatPartners).padStart(2)}  never partner ${String(st.unmetPartners).padStart(3)}  opponents ${lo}-${hi}  ${ok}`;
};
console.log("players courts | method | ...  (default round count each; whist row only when a design is used)");
for (const courtsRule of ["full", 3]) {
  console.log(`\n== courts: ${courtsRule === "full" ? "floor(n/4), every seat filled" : "3"} ==`);
  for (let n = 4; n <= 48; n++) {
    const P = Array.from({ length: n }, (_, i) => `P${i}`);
    const courts = courtsRule === "full" ? Math.max(1, Math.floor(n / 4)) : courtsRule;
    const w = americano(P, { courts });
    const g = americano(P, { courts, whist: false });
    // greedy on the whist's round count, so the comparison is like for like
    const g2 = w.design ? americano(P, { courts, rounds: w.rounds.length, whist: false }) : null;
    const wFull = w.whistHint ? americano(P, { courts, rounds: w.whistHint.rounds }) : null;
    const gFull = wFull ? americano(P, { courts, rounds: w.whistHint.rounds, whist: false }) : null;
    console.log(`${String(n).padStart(2)} players ${String(courts).padStart(2)} courts`);
    if (w.design) console.log(`  ${row("whist", P, w)}  (${w.design.near ? "near-whist " : ""}design ${w.design.size}, ${w.design.ghosts} ghost${w.design.ghosts === 1 ? "" : "s"}${w.design.packed ? ", packed" : ""})`);
    console.log(`  ${row("greedy", P, g)}`);
    if (g2 && g2.rounds.length !== g.rounds.length) console.log(`  ${row("greedy=", P, g2)}  (greedy on the whist's round count)`);
    if (wFull && wFull.design) {
      console.log(`  ${row("whole", P, wFull)}  (whole design asked for: design ${wFull.design.size}, packed)`);
      console.log(`  ${row("greedy=", P, gFull)}  (greedy on the same round count)`);
    }
  }
}

// A short night: the first 6 or 8 rounds. Most social nights stop well before the full cycle.
// "default" is americano() as shipped: below the whole design it keeps the better of the design's
// first rounds and the greedy search, so it can only tie or beat "greedy" here.
console.log("\n== short nights: a court for every four players, first R rounds; max times one pair meets as opponents, and repeat partners ==");
for (const R of [6, 8]) for (const n of [12, 16, 20, 24, 28]) {
  const P = Array.from({ length: n }, (_, i) => `P${i}`);
  const courts = n / 4;
  const cells = [];
  for (const whist of [true, false]) {
    let maxOpp = 0, rep = 0, pairs3 = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const plan = americano(P, { courts, rounds: R, seed, whist });
      rep += americanoStats(P, plan).repeatPartners;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { maxOpp = Math.max(maxOpp, plan.opponent[i][j]); if (plan.opponent[i][j] >= 3) pairs3++; }
    }
    cells.push(`${whist ? "default" : "greedy"} max opponent meets ${maxOpp}, pairs meeting 3+ times ${(pairs3 / 20).toFixed(1)} a night, repeat partners ${(rep / 20).toFixed(1)}`);
  }
  console.log(`${String(n).padStart(2)} players, ${R} rounds (20 seeds): ${cells.join(" | ")}`);
}
