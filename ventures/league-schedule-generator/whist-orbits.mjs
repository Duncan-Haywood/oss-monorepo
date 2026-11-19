// Whist designs with more than one base round, for sizes no one-base-round cyclic design was found
// for (eval/whist-orbits.c searches them; eval/whist-orbits.txt has the runs, eval/whist-orbits-check.mjs
// re-checks every stored line pair by pair).
//
// structure "levels": players are (x, i) for x in Z_mod and level i < levels, stored as i*mod + x,
// plus a fixed player infinity (-1) when the size is 4k. Base round j is developed by adding g in
// Z_mod to x (levels stay put), so the design has levels*mod rounds.
// structure "semi": players are the elements (a, b) of Z_p x| Z_q, (a,b)(c,d) = (a + r^b c, b + d),
// stored as a + p*b; round g is g times the base round, every entry multiplied on the left.
//
// Returns rounds in whist.mjs's shape: { tables: [[a, b, x, y], ...], out: [...] }, players 0..n-1
// (infinity is n-1).
import { ORBIT_BASES } from "./whist-orbit-bases.mjs";

export function developOrbits(d) {
  const n = d.n;
  const rounds = [];
  const push = (tables) => {
    const seated = new Set(tables.flat());
    rounds.push({ tables, out: [...Array(n).keys()].filter((i) => !seated.has(i)) });
  };
  if (d.structure === "levels") {
    const m = d.mod;
    for (const base of d.bases) {
      for (let g = 0; g < m; g++) {
        push(base.map((t) => t.map((p) => (p === -1 ? n - 1 : Math.floor(p / m) * m + ((p % m) + g) % m))));
      }
    }
  } else if (d.structure === "semi") {
    const { p, q, r } = d;
    const pow = (b) => { let x = 1; for (let i = 0; i < b; i++) x = (x * r) % p; return x; };
    const mul = (x, y) => (((x % p) + pow(Math.floor(x / p)) * (y % p)) % p) + p * ((Math.floor(x / p) + Math.floor(y / p)) % q);
    for (const base of d.bases) for (let g = 0; g < p * q; g++) push(base.map((t) => t.map((e) => mul(g, e))));
  } else return null;
  return rounds;
}

/** The sizes stored here. */
export function orbitSizes() {
  return Object.keys(ORBIT_BASES).map(Number);
}

/** The developed design for m players from ORBIT_BASES, or null. */
export function orbitDesign(m) {
  const d = ORBIT_BASES[m];
  return d ? developOrbits({ n: m, ...d }) : null;
}
