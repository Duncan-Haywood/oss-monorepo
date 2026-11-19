// Develop eval/whist-orbits.c result lines into full rounds and check them with whist.mjs's
// checkWhist (every pair partners exactly once and opposes exactly twice), pair by pair.
// Usage: node eval/whist-orbits-check.mjs eval/whist-orbits.txt   (prints n, structure, ok/FAILS)
import { readFileSync } from "node:fs";
import { checkWhist } from "../whist.mjs";

// Players: "levels", (x, i) = i*mod + x for x in Z_mod and level i, plus infinity (-1) at size 4k;
// base round j is developed by adding g in Z_mod to x. "semi", (a, b) = a + p*b in Z_p x| Z_q with
// (a,b)(c,d) = (a + r^b c, b + d); round g is g times the base round (left multiplication).
export function developOrbits(d) {
  const n = d.n, rounds = [];
  const push = (tables) => {
    const seated = new Set(tables.flat());
    rounds.push({ tables, out: [...Array(n).keys()].filter((i) => !seated.has(i)) });
  };
  if (d.structure === "levels") {
    const m = d.mod;
    for (const base of d.bases) for (let g = 0; g < m; g++)
      push(base.map((t) => t.map((p) => (p === -1 ? n - 1 : Math.floor(p / m) * m + ((p % m) + g) % m))));
  } else {
    const { p, q, r } = d;
    const pow = (b) => { let x = 1; for (let i = 0; i < b; i++) x = (x * r) % p; return x; };
    const mul = (x, y) => (((x % p) + pow(Math.floor(x / p)) * (y % p)) % p) + p * ((Math.floor(x / p) + Math.floor(y / p)) % q);
    for (const base of d.bases) for (let g = 0; g < p * q; g++) push(base.map((t) => t.map((e) => mul(g, e))));
  }
  return rounds;
}

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
