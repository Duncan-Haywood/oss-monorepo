// Whist base rounds on Z_v (v = 4k+1) fixed by an involutive multiplier m (m*m = 1 mod v, m != +-1).
//
//   cc -O2 -o /tmp/whist-involution eval/whist-involution.c
//   /tmp/whist-involution <v> <m> [seed] [seconds] [b]   # one JSON line, eval/whist-starter.txt format
//
// Why: at 57 the plain cyclic searches (eval/whist-starter.c, whist-anneal.c, whist-orbits.c) found
// nothing in ~6 CPU-hours, the -1 multiplier is ruled out (patterned starters need v = 1 or 5 mod 12),
// and an order-3 multiplier cannot work (14 tables are not a multiple of 3 and no whist table is fixed
// by a 3-cycle). Z57* has two more involutions, 20 and 37. A base round that multiplication by m maps
// to itself has its difference multiset fixed by m, which halves the free choices.
//
// State: 14 tables [a,b,x,y] (a&b vs x&y) over the nonzero points. Invariance is built in at the start
// and kept by every move: a move swaps points p<->q and m*p<->m*q together, a permutation that commutes
// with m, so the layout stays m-invariant. Cost = sum over classes d of (partners(d)-1)^2 +
// (opponents(d)-2)^2; 0 is a whist base round. Simulated annealing with restarts.
//
// b (only when m has more than two fixed points) = number of self-mapped tables holding two fixed points
// and one swapped pair; the rest of the fixed points sit four to a table.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <time.h>

static int v, m, K, T;
static int tab[32][4];
static int where[128];           // point -> table*4+slot
static unsigned long long rng = 88172645463325252ULL;
static unsigned long long rnd(void) { rng ^= rng << 13; rng ^= rng >> 7; rng ^= rng << 17; return rng; }
static double urand(void) { return (rnd() >> 11) * (1.0 / 9007199254740992.0); }
static int cls(int a, int b) { int d = ((a - b) % v + v) % v; return d <= v / 2 ? d : v - d; }
static int mul(int x) { return (int)((long long)x * m % v); }

static int cost(void) {
  int P[64] = {0}, O[64] = {0};
  for (int t = 0; t < T; t++) {
    int *q = tab[t];
    P[cls(q[0], q[1])]++; P[cls(q[2], q[3])]++;
    O[cls(q[0], q[2])]++; O[cls(q[0], q[3])]++; O[cls(q[1], q[2])]++; O[cls(q[1], q[3])]++;
  }
  int c = 0;
  for (int d = 1; d <= K; d++) c += (P[d] - 1) * (P[d] - 1) + (O[d] - 2) * (O[d] - 2);
  return c;
}

static void reindex(void) { for (int t = 0; t < T; t++) for (int s = 0; s < 4; s++) where[tab[t][s]] = t * 4 + s; }

static void shuffle(int *a, int n) { for (int i = n - 1; i > 0; i--) { int j = rnd() % (i + 1); int t = a[i]; a[i] = a[j]; a[j] = t; } }

// a random m-invariant layout
static int build(int bwant) {
  int fixed[128], nf = 0, reps[128], nr = 0, seen[128] = {0};
  for (int x = 1; x < v; x++) {
    if (seen[x]) continue;
    int y = mul(x);
    seen[x] = seen[y] = 1;
    if (y == x) fixed[nf++] = x; else reps[nr++] = x;
  }
  shuffle(fixed, nf); shuffle(reps, nr);
  int t = 0, fi = 0, ri = 0;
  int b = nf == 2 ? 1 : bwant;
  if ((nf - 2 * b) % 4 || nf - 2 * b < 0) return 0;
  for (int i = 0; i < b; i++) {          // {f1,f2} vs {x,mx}
    int x = reps[ri++];
    tab[t][0] = fixed[fi++]; tab[t][1] = fixed[fi++]; tab[t][2] = x; tab[t][3] = mul(x); t++;
  }
  while (fi < nf) { for (int s = 0; s < 4; s++) tab[t][s] = fixed[fi++]; t++; }
  int left = nr - ri, tleft = T - t;
  // c self tables of two orbits, p pairs of tables of four orbits: 2c + 4p = left, c + 2p = tleft
  if (left != 2 * tleft) return 0;
  int maxp = tleft / 2, p = rnd() % (maxp + 1), c = tleft - 2 * p;
  for (int i = 0; i < c; i++) {
    int x = reps[ri++], y = reps[ri++], kind = rnd() % 3;
    if (kind == 0) { tab[t][0] = x; tab[t][1] = mul(x); tab[t][2] = y; tab[t][3] = mul(y); }
    else if (kind == 1) { tab[t][0] = x; tab[t][1] = y; tab[t][2] = mul(x); tab[t][3] = mul(y); }
    else { tab[t][0] = x; tab[t][1] = mul(y); tab[t][2] = mul(x); tab[t][3] = y; }
    t++;
  }
  for (int i = 0; i < p; i++) {
    for (int s = 0; s < 4; s++) { int x = reps[ri++]; if (rnd() & 1) x = mul(x); tab[t][s] = x; tab[t + 1][s] = mul(x); }
    t += 2;
  }
  reindex();
  return 1;
}

static void swapPts(int p, int q) {
  int wp = where[p], wq = where[q];
  tab[wp >> 2][wp & 3] = q; tab[wq >> 2][wq & 3] = p; where[p] = wq; where[q] = wp;
}
static void move(int p, int q) {           // sigma = (p q)(mp mq), commutes with m
  int mp = mul(p), mq = mul(q);
  swapPts(p, q);
  if (mp == q) return;                      // sigma = (p mp): one transposition
  if (mp == p && mq == q) return;          // both fixed: one transposition
  swapPts(mp, mq);                          // (main never pairs a fixed point with a moved one)
}

int main(int argc, char **argv) {
  if (argc < 3) { fprintf(stderr, "usage: whist-involution v m [seed] [seconds] [b]\n"); return 1; }
  v = atoi(argv[1]); m = atoi(argv[2]);
  unsigned long long seed = argc > 3 ? strtoull(argv[3], 0, 10) : 1;
  double secs = argc > 4 ? atof(argv[4]) : 60;
  int bwant = argc > 5 ? atoi(argv[5]) : 1;
  rng ^= seed * 0x9E3779B97F4A7C15ULL; for (int i = 0; i < 20; i++) rnd();
  K = v / 2; T = (v - 1) / 4;
  if ((long long)m * m % v != 1 || m == 1 || m == v - 1) { fprintf(stderr, "m must be an involution other than +-1\n"); return 1; }
  int mov[128], nm = 0;                     // every nonzero point; fixed points trade only with fixed points
  for (int x = 1; x < v; x++) mov[nm++] = x;
  clock_t start = clock();
  long long steps = 0; int restarts = 0, best = 1 << 30;
  while ((double)(clock() - start) / CLOCKS_PER_SEC < secs) {
    if (!build(bwant)) { fprintf(stderr, "no layout for this b\n"); return 1; }
    restarts++;
    int c = cost();
    double temp = 2.0;
    for (long long it = 0; it < 3000000 && c; it++) {
      int p = mov[rnd() % nm], q = mov[rnd() % nm];
      if (p == q) continue;
      int fp = mul(p) == p, fq = mul(q) == q;
      if (fp != fq) continue;               // a fixed point may only trade with a fixed point
      move(p, q);
      int c2 = cost();
      if (c2 <= c || urand() < exp((c - c2) / temp)) c = c2;
      else move(p, q);                      // sigma is an involution: applying it again undoes it
      temp *= 0.999998; if (temp < 0.15) temp = 0.15;
      steps++;
    }
    if (c < best) best = c;
    if (c == 0) {
      double ms = 1000.0 * (clock() - start) / CLOCKS_PER_SEC;
      printf("{\"n\":%d,\"mods\":[%d],\"kind\":\"whist\",\"ms\":%.0f,\"method\":\"multiplier %d anneal (C)\",\"seed\":%llu,\"restarts\":%d,\"steps\":%lld,\"tables\":[", v, v, ms, m, seed, restarts, steps);
      for (int t = 0; t < T; t++) printf("%s[%d,%d,%d,%d]", t ? "," : "", tab[t][0], tab[t][1], tab[t][2], tab[t][3]);
      printf("]}\n");
      return 0;
    }
  }
  printf("{\"n\":%d,\"mods\":[%d],\"kind\":\"whist\",\"ms\":%.0f,\"method\":\"multiplier %d anneal (C)\",\"seed\":%llu,\"restarts\":%d,\"steps\":%lld,\"best\":%d,\"tables\":null}\n", v, v, secs * 1000, m, seed, restarts, steps, best);
  return 0;
}
