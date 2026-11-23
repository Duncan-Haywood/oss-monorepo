// League schedule generator, rng.mjs: Seeded randomness: one small generator every search shares, so a seed gives the same season everywhere.
// Split out of calc.mjs on 2026-11-23 (quality audit round 87); calc.mjs re-exports every public name.

// ---------------------------------------------------------------- seeded randomness

export function mulberry32(seed) {
  let a = seed >>> 0;
  const at = (x) => {
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rand = () => { a = (a + 0x6d2b79f5) >>> 0; return at(a); };
  // the value the next call will return, without drawing it (the annealer prices a move only as far
  // as the draw it would make lets it be accepted)
  rand.peek = () => at((a + 0x6d2b79f5) >>> 0);
  return rand;
}
