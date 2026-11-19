// Develop eval/whist-orbits.c result lines into full rounds and check them with whist.mjs's
// checkWhist (every pair partners exactly once and opposes exactly twice), pair by pair.
// Usage: node eval/whist-orbits-check.mjs eval/whist-orbits.txt   (prints n, structure, ok/FAILS)
import { readFileSync } from "node:fs";
import { checkWhist } from "../whist.mjs";
import { developOrbits } from "../whist-orbits.mjs";

let bad = 0;
for (const line of readFileSync(process.argv[2], "utf8").split("\n")) {
  if (!line.startsWith("{")) continue;
  const r = JSON.parse(line);
  if (!r.bases) continue;
  const rounds = developOrbits(r);
  const ok = rounds.length === (r.n % 4 === 0 ? r.n - 1 : r.n) && checkWhist(r.n, rounds);
  if (!ok) bad++;
  console.log(r.n, r.structure, r.structure === "levels" ? `${r.levels}x${r.mod}` : `${r.p}x|${r.q} r=${r.r}`, ok ? "ok" : "FAILS");
}
process.exit(bad ? 1 : 0);
