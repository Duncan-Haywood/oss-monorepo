// One elimination step of orient.mjs minPlusStep, in WebAssembly (README "minPlusStep in
// WebAssembly"). Build: sh wasm/build.sh (clang 18, wasm32, SIMD128). The JS version in orient.mjs is
// the reference; orient.test.mjs checks both give the same table.
//
// The new table N has bits [x bits not yet eliminated (lx)] [y bits met so far (ly)]; the old table T
// has [x bit being eliminated, then the lx bits] [the first ly0 y bits] (the JS loop's base). For
// each z, N[z] = min(T[2 zz] + both - d, T[2 zz + 1] + d) with zz = z mod 2^(lx + ly0).
typedef int i32;
#include <wasm_simd128.h>
#define CAP (1 << 18)
static i32 Ti[CAP], Ni[CAP];
static double Tf[CAP], Nf[CAP];
// Whole-break tables run as int16 when they fit (README "Whole-break tables in int16"): eight SIMD
// lanes instead of four, and every value is exact, so the table is the int32 loop's bit for bit. A
// step adds at most 2 to an entry and a programme has at most 16 steps, so an input whose largest
// entry is under NARROW_MAX cannot overflow; a larger one (none of orient.mjs's callers) keeps int32.
typedef short i16;
#define NARROW_MAX 30000
static i16 Ts[CAP], Ns[CAP];
static i32 narrow;

// the step's input and output tables (2^16 entries at most: 16 matches) and the two lookups that
// move a host choice's bits to their places in the table (orient.mjs perm: low 6 bits, then the rest)
#define IO (1 << 16)
static i32 Pi[IO];
static double Pf[IO];
static i32 LUT[64 + 1024];
__attribute__((export_name("io"))) i32 io(void) { return IO; }
__attribute__((export_name("pi"))) i32 *pi(void) { return Pi; }
__attribute__((export_name("pf"))) double *pf(void) { return Pf; }
__attribute__((export_name("lut"))) i32 *lut(void) { return LUT; }
#define PERM(v) (LUT[(v) & 63] | LUT[64 + ((v) >> 6)])
__attribute__((export_name("in_i32"))) void in_i32(i32 k) {
  i32 lo = 0, hi = 0;
  for (i32 x = 0; x < 1 << k; x++) { const i32 v = Pi[x]; lo = v < lo ? v : lo; hi = v > hi ? v : hi; }
  narrow = lo > -NARROW_MAX && hi < NARROW_MAX;
  if (narrow) for (i32 x = 0; x < 1 << k; x++) Ts[PERM(x)] = (i16)Pi[x];
  else for (i32 x = 0; x < 1 << k; x++) Ti[PERM(x)] = Pi[x];
}
// The symmetric step (README "Half the table: flipping every host"): a whole-break table
// with f[x] = f[~x] goes in with one of the next round's host bits fixed at 0, so that match's two
// edges become unary costs on the input (m0, m1: the A host bit each of its teams meets, 0 for
// none; the team breaks when that bit equals f0, f1), and the step runs on one fewer y bit.
__attribute__((export_name("in_i32u"))) void in_i32u(i32 k, i32 m0, i32 f0, i32 m1, i32 f1) {
  i32 lo = 0, hi = 0;
  for (i32 x = 0; x < 1 << k; x++) { const i32 v = Pi[x]; lo = v < lo ? v : lo; hi = v > hi ? v : hi; }
  narrow = lo > -NARROW_MAX && hi < NARROW_MAX - 2;
  // the cost of bit m is 1 when (x & m != 0) == f: with s = f ? 0 : m, that is ((x & m) ^ s) == m
  // for m != 0; an absent edge (m = 0) adds nothing
  const i32 s0 = f0 ? 0 : m0, s1 = f1 ? 0 : m1, e0 = m0 != 0, e1 = m1 != 0;
#define U(x) ((e0 & (((x) & m0) == (m0 ^ s0))) + (e1 & (((x) & m1) == (m1 ^ s1))))
  if (narrow) for (i32 x = 0; x < 1 << k; x++) Ts[PERM(x)] = (i16)(Pi[x] + U(x));
  else for (i32 x = 0; x < 1 << k; x++) Ti[PERM(x)] = Pi[x] + U(x);
#undef U
}
// ...and comes out at full width: y with the fixed bit (hb) set reads ~y's entry (the table is
// symmetric), and the step's table holds the other k - 1 bits (the lookups place those).
__attribute__((export_name("out_i32s"))) void out_i32s(i32 k, i32 swap, i32 tm, i32 hb) {
  const i32 full = (1 << k) - 1, half = hb;
  if (narrow) { const i16 *S = swap ? Ns : Ts; for (i32 y = 0; y < 1 << k; y++) { const i32 v = y & half ? ~y & full : y; Pi[y] = S[PERM(v) & tm]; } return; }
  const i32 *T = swap ? Ni : Ti;
  for (i32 y = 0; y < 1 << k; y++) { const i32 v = y & half ? ~y & full : y; Pi[y] = T[PERM(v) & tm]; }
}
__attribute__((export_name("narrowed"))) i32 narrowed(void) { return narrow; }
__attribute__((export_name("in_f64"))) void in_f64(i32 k) { for (i32 x = 0; x < 1 << k; x++) Tf[PERM(x)] = Pf[x]; }
__attribute__((export_name("out_i32"))) void out_i32(i32 k, i32 swap, i32 tm) {
  if (narrow) { const i16 *S = swap ? Ns : Ts; for (i32 y = 0; y < 1 << k; y++) Pi[y] = S[PERM(y) & tm]; return; }
  const i32 *T = swap ? Ni : Ti;
  for (i32 y = 0; y < 1 << k; y++) Pi[y] = T[PERM(y) & tm];
}
__attribute__((export_name("out_f64"))) void out_f64(i32 k, i32 swap, i32 tm) {
  const double *T = swap ? Nf : Tf;
  for (i32 y = 0; y < 1 << k; y++) Pf[y] = T[PERM(y) & tm];
}

__attribute__((export_name("cap"))) i32 cap(void) { return CAP; }
__attribute__((export_name("ti"))) i32 *ti(void) { return Ti; }
__attribute__((export_name("ni"))) i32 *ni(void) { return Ni; }
__attribute__((export_name("tf"))) double *tf(void) { return Tf; }
__attribute__((export_name("nf"))) double *nf(void) { return Nf; }

// The x part of z and the old y bits together are z's low lx + ly0 bits, so the old table's pair
// for z sits at 2 (z & (B - 1)), B = 2^(lx + ly0): the new table is blocks of B entries, each read
// from the same contiguous run of T. The break count d reads bits s0 = e0 + lx and s1 of z itself,
// so the inner loop has no per-hi part and clang vectorises every step, also the late ones where
// lx is 0 or 1 (a loop over hi then lo ran 1 or 2 entries an iteration there).
#define D(z) ((((z) >> s0 ^ f0) & m0) + (((z) >> s1 ^ f1) & m1))

// The int16 step with explicit SIMD: eight entries z0 .. z0 + 7 (z0 a multiple of 8) share every bit
// of z from bit 3 up, so each edge's break bit is a fixed lane pattern when it reads bit 0, 1 or 2
// and one splatted value otherwise. The old table's pairs are split into evens and odds by one
// shuffle each. Blocks under 8 entries (late steps) take the scalar loop.
static v128_t lanebit(i32 s, i32 f, i32 m) {
  if (!m) return wasm_i16x8_splat(0);
  return wasm_i16x8_make(((0 >> s) ^ f) & 1, ((1 >> s) ^ f) & 1, ((2 >> s) ^ f) & 1, ((3 >> s) ^ f) & 1,
                         ((4 >> s) ^ f) & 1, ((5 >> s) ^ f) & 1, ((6 >> s) ^ f) & 1, ((7 >> s) ^ f) & 1);
}
static void step_i16(i32 swap, i32 lx, i32 ly, i32 ly0, i32 e0, i32 f0, i32 m0, i32 e1, i32 f1, i32 m1) {
  const i16 *restrict T = swap ? Ns : Ts; i16 *restrict N = swap ? Ts : Ns;
  const i32 both = m0 + m1, s0 = e0 + lx, s1 = e1 + lx, B = 1 << (lx + ly0), S = 1 << (lx + ly);
  if (B < 8) {
    for (i32 b = 0; b < S; b += B) {
      i16 *restrict nb = N + b;
      for (i32 zz = 0; zz < B; zz++) {
        const i32 z = b | zz, d = D(z);
        const i32 c0 = T[2 * zz] + both - d, c1 = T[2 * zz + 1] + d;
        nb[zz] = (i16)(c0 < c1 ? c0 : c1);
      }
    }
    return;
  }
  // lanes that vary inside a group of eight: a fixed pattern; otherwise added per group below
  const i32 low0 = m0 && s0 < 3, low1 = m1 && s1 < 3;
  const v128_t fixed = wasm_i16x8_add(low0 ? lanebit(s0, f0, 1) : wasm_i16x8_splat(0), low1 ? lanebit(s1, f1, 1) : wasm_i16x8_splat(0));
  const v128_t vb = wasm_i16x8_splat((i16)both);
  for (i32 b = 0; b < S; b += B) {
    i16 *restrict nb = N + b;
    for (i32 zz = 0; zz < B; zz += 8) {
      const i32 z = b | zz;
      const i32 hiD = (m0 && !low0 ? ((z >> s0) ^ f0) & 1 : 0) + (m1 && !low1 ? ((z >> s1) ^ f1) & 1 : 0);
      const v128_t d = wasm_i16x8_add(fixed, wasm_i16x8_splat((i16)hiD));
      const v128_t v0 = wasm_v128_load(T + 2 * zz), v1 = wasm_v128_load(T + 2 * zz + 8);
      const v128_t ev = wasm_i16x8_shuffle(v0, v1, 0, 2, 4, 6, 8, 10, 12, 14);
      const v128_t od = wasm_i16x8_shuffle(v0, v1, 1, 3, 5, 7, 9, 11, 13, 15);
      const v128_t c0 = wasm_i16x8_sub(wasm_i16x8_add(ev, vb), d), c1 = wasm_i16x8_add(od, d);
      wasm_v128_store(nb + zz, wasm_i16x8_min(c0, c1));
    }
  }
}

__attribute__((export_name("step_i32")))
void step_i32(i32 swap, i32 lx, i32 ly, i32 ly0, i32 e0, i32 f0, i32 m0, i32 e1, i32 f1, i32 m1) {
  if (narrow) { step_i16(swap, lx, ly, ly0, e0, f0, m0, e1, f1, m1); return; }
  const i32 *restrict T = swap ? Ni : Ti; i32 *restrict N = swap ? Ti : Ni;
  const i32 both = m0 + m1, s0 = e0 + lx, s1 = e1 + lx, B = 1 << (lx + ly0), S = 1 << (lx + ly);
  for (i32 b = 0; b < S; b += B) {
    i32 *restrict nb = N + b;
    for (i32 zz = 0; zz < B; zz++) {
      const i32 z = b | zz, d = D(z);
      const i32 c0 = T[2 * zz] + both - d, c1 = T[2 * zz + 1] + d;
      nb[zz] = c0 < c1 ? c0 : c1;
    }
  }
}

__attribute__((export_name("step_f64")))
void step_f64(i32 swap, i32 lx, i32 ly, i32 ly0, i32 e0, i32 f0, i32 m0, i32 e1, i32 f1, i32 m1) {
  const double *restrict T = swap ? Nf : Tf; double *restrict N = swap ? Tf : Nf;
  const i32 both = m0 + m1, s0 = e0 + lx, s1 = e1 + lx, B = 1 << (lx + ly0), S = 1 << (lx + ly);
  const double bd = both;
  for (i32 b = 0; b < S; b += B) {
    double *restrict nb = N + b;
    for (i32 zz = 0; zz < B; zz++) {
      const i32 z = b | zz;
      const double d = D(z);
      // (T + both) - d, the JS order, so the sums round the same
      const double c0 = (T[2 * zz] + bd) - d, c1 = T[2 * zz + 1] + d;
      nb[zz] = c0 < c1 ? c0 : c1;
    }
  }
}
