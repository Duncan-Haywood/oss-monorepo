// One elimination step of orient.mjs minPlusStep, in WebAssembly (README "minPlusStep in
// WebAssembly"). Build: sh wasm/build.sh (clang 18, wasm32, SIMD128). The JS version in orient.mjs is
// the reference; orient.test.mjs checks both give the same table.
//
// The new table N has bits [x bits not yet eliminated (lx)] [y bits met so far (ly)]; the old table T
// has [x bit being eliminated, then the lx bits] [the first ly0 y bits] (the JS loop's base). For
// each z, N[z] = min(T[2 zz] + both - d, T[2 zz + 1] + d) with zz = z mod 2^(lx + ly0).
typedef int i32;
#define CAP (1 << 18)
static i32 Ti[CAP], Ni[CAP];
static double Tf[CAP], Nf[CAP];

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
__attribute__((export_name("in_i32"))) void in_i32(i32 k) { for (i32 x = 0; x < 1 << k; x++) Ti[PERM(x)] = Pi[x]; }
__attribute__((export_name("in_f64"))) void in_f64(i32 k) { for (i32 x = 0; x < 1 << k; x++) Tf[PERM(x)] = Pf[x]; }
__attribute__((export_name("out_i32"))) void out_i32(i32 k, i32 swap, i32 tm) {
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

__attribute__((export_name("step_i32")))
void step_i32(i32 swap, i32 lx, i32 ly, i32 ly0, i32 e0, i32 f0, i32 m0, i32 e1, i32 f1, i32 m1) {
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
