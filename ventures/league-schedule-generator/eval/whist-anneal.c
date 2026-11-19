/* Simulated annealing for whist base rounds, for the sizes eval/whist-search.c's backtracking did not
 * reach in 20 CPU-minutes (48, 52, 57, 60; eval/whist-multiplier.mjs says why no multiplier helps).
 * Points Z_v (0 sits out) for n = 4k+1, Z_v + infinity (-1) for n = 4k, as in eval/whist-search.c;
 * for n = 4k+2 a near-whist base round on Z_n (eval/near-whist-search.mjs's conditions).
 * State: a permutation of the points; table t is perm[4t..4t+3] = [a,b,x,y], a&b vs x&y.
 * Cost: over the h = (v-1)/2 difference classes {d, -d}, |partner count - 1| + |opponent count - 2|
 * (pairs with infinity count for nothing). Cost 0 is a whist base round. Moves swap two points in
 * different tables or different seats; Metropolis acceptance, geometric cooling, restart on a stall.
 * Prints one JSON line like eval/whist-search-c.txt; exit 0 when found.
 *   cc -O2 -o whist-anneal eval/whist-anneal.c -lm && ./whist-anneal 48 600 1   (n, seconds, seed)
 *   optional: start temperature, floor temperature, moves without a new best before a restart;
 *   WHIST_VERBOSE=1 prints each restart's best cost to stderr. */
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#define INF (-1)
static int n, v, h, k, npts, near, perm[80], pc[64], oc[64];
static unsigned long long rs;
static unsigned long long rnd(void) { rs ^= rs << 13; rs ^= rs >> 7; rs ^= rs << 17; return rs; }
static double urand(void) { return (rnd() >> 11) * (1.0 / 9007199254740992.0); }
static int cls(int a, int b) { int d = ((a - b) % v + v) % v; return d <= h ? d : v - d; }
/* Whist: every class partners once, opposes twice. Near-whist (n = 4k+2 on Z_n, two sit out; see
 * eval/near-whist-search.mjs): classes 1..h-1 partner once and oppose at most twice; the class
 * h = n/2 never partners and opposes once. */
static int pcost(int d, int c) { return near && d == h ? 2 * c : abs(c - 1); }
static int ocost(int d, int c) { return near ? (d == h ? abs(c - 1) : (c > 2 ? c - 2 : 0)) : abs(c - 2); }
static int cost;
/* Add (s = +1) or remove (s = -1) table t's differences, keeping `cost` current. */
static void tab(int t, int s) {
  if (t >= k) return; /* near-whist: the last two positions sit out */
  int *q = perm + 4 * t;
  static const int P[2][2] = {{0, 1}, {2, 3}}, O[4][2] = {{0, 2}, {0, 3}, {1, 2}, {1, 3}};
  for (int i = 0; i < 2; i++) {
    int a = q[P[i][0]], b = q[P[i][1]];
    if (a == INF || b == INF) continue;
    int c = cls(a, b); cost -= pcost(c, pc[c]); pc[c] += s; cost += pcost(c, pc[c]);
  }
  for (int i = 0; i < 4; i++) {
    int a = q[O[i][0]], b = q[O[i][1]];
    if (a == INF || b == INF) continue;
    int c = cls(a, b); cost -= ocost(c, oc[c]); oc[c] += s; cost += ocost(c, oc[c]);
  }
}
static void reset(void) {
  memset(pc, 0, sizeof pc); memset(oc, 0, sizeof oc); cost = 0;
  for (int c = 1; c <= h; c++) cost += pcost(c, 0) + ocost(c, 0);
  for (int t = 0; t < k; t++) tab(t, 1);
}
/* Tabu search (WHIST_TABU=tenure): each step makes the best swap between two tables whose points
 * were not moved in the last `tenure` steps (a tabu move is allowed when it reaches a new best). */
static int swapdelta(int i, int j) {
  int ti = i / 4, tj = j / 4, old = cost, x, d;
  tab(ti, -1); tab(tj, -1);
  x = perm[i]; perm[i] = perm[j]; perm[j] = x;
  tab(ti, 1); tab(tj, 1);
  d = cost - old;
  tab(ti, -1); tab(tj, -1);
  x = perm[i]; perm[i] = perm[j]; perm[j] = x;
  tab(ti, 1); tab(tj, 1);
  return d;
}
static clock_t g_t0; static double g_secs;
static int tabuRun(int tenure, long steps, long *moves) {
  static long last[80];
  for (int i = 0; i < npts; i++) last[i] = -1000000;
  int best = cost;
  for (long s = 0; s < steps; s++) {
    int bd = 1 << 30, bi = -1, bj = -1, ties = 0;
    for (int i = 0; i < npts; i++) for (int j = (i / 4 + 1) * 4; j < npts; j++) {
      int d = swapdelta(i, j);
      int tabu = s - last[i] < tenure || s - last[j] < tenure;
      if (tabu && cost + d >= best) continue;
      if (d < bd) { bd = d; bi = i; bj = j; ties = 1; }
      else if (d == bd && rnd() % ++ties == 0) { bi = i; bj = j; }
    }
    (*moves)++;
    if ((s & 1023) == 0 && (double)(clock() - g_t0) / CLOCKS_PER_SEC >= g_secs) return 0;
    if (bi < 0) continue;
    int ti = bi / 4, tj = bj / 4, x;
    tab(ti, -1); tab(tj, -1);
    x = perm[bi]; perm[bi] = perm[bj]; perm[bj] = x;
    tab(ti, 1); tab(tj, 1);
    last[bi] = last[bj] = s;
    if (cost < best) best = cost;
    if (cost == 0) return 1;
  }
  return 0;
}
int main(int argc, char **argv) {
  if (argc < 2) { fprintf(stderr, "usage: whist-anneal n [seconds] [seed]\n"); return 2; }
  n = atoi(argv[1]); double secs = argc > 2 ? atof(argv[2]) : 60;
  unsigned long long seed = argc > 3 ? strtoull(argv[3], 0, 10) : 1;
  rs = seed * 2654435761ULL + 88172645463325252ULL;
  double T0 = argc > 4 ? atof(argv[4]) : 2.0, Tmin = argc > 5 ? atof(argv[5]) : 0.15;
  long stall = argc > 6 ? atol(argv[6]) : 20000000L;
  int verbose = getenv("WHIST_VERBOSE") != NULL;
  int fourK1 = n % 4 == 1; near = n % 4 == 2; k = n / 4;
  v = fourK1 || near ? n : n - 1; h = near ? n / 2 : (v - 1) / 2;
  npts = 0;
  if (near) for (int i = 0; i < v; i++) perm[npts++] = i;
  else if (fourK1) for (int i = 1; i < v; i++) perm[npts++] = i;
  else if (n % 4 == 0) { perm[npts++] = INF; for (int i = 0; i < v; i++) perm[npts++] = i; }
  if (npts != 4 * k + (near ? 2 : 0) || n < 4) { fprintf(stderr, "n must not be 3 mod 4\n"); return 2; }
  clock_t t0 = clock(); g_t0 = t0; g_secs = secs;
  long restarts = 0, moves = 0;
  int found = 0;
  while (!found && (double)(clock() - t0) / CLOCKS_PER_SEC < secs) {
    restarts++;
    for (int i = npts - 1; i > 0; i--) { int j = rnd() % (i + 1), t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    reset();
    if (getenv("WHIST_TABU")) {
      if (tabuRun(atoi(getenv("WHIST_TABU")), stall, &moves)) { found = 1; break; }
      if (verbose) fprintf(stderr, "restart %ld (tabu)\n", restarts);
      continue;
    }
    double T = T0;
    int best = cost; long since = 0;
    while (1) {
      moves++;
      int i = rnd() % npts, j = rnd() % npts;
      int ti = i / 4, tj = j / 4;
      if (i == j) continue;
      int old = cost;
      tab(ti, -1); if (tj != ti) tab(tj, -1);
      int x = perm[i]; perm[i] = perm[j]; perm[j] = x;
      tab(ti, 1); if (tj != ti) tab(tj, 1);
      int delta = cost - old;
      if (delta > 0 && urand() >= exp(-delta / T)) {
        tab(ti, -1); if (tj != ti) tab(tj, -1);
        x = perm[i]; perm[i] = perm[j]; perm[j] = x;
        tab(ti, 1); if (tj != ti) tab(tj, 1);
      }
      if (cost == 0) { found = 1; break; }
      if (cost < best) { best = cost; since = 0; } else since++;
      T *= 0.999999; if (T < Tmin) T = Tmin;
      if (since > stall) { if (verbose) fprintf(stderr, "restart %ld best %d\n", restarts, best); break; }
      if ((moves & 0xFFFFF) == 0 && (double)(clock() - t0) / CLOCKS_PER_SEC >= secs) break;
    }
  }
  long ms = (long)((clock() - t0) * 1000 / CLOCKS_PER_SEC);
  printf("{\"n\":%d,\"mods\":[%d],%s\"ms\":%ld,\"method\":\"%s\",\"seed\":%llu,\"restarts\":%ld,\"moves\":%ld,\"tables\":", n, v, near ? "\"kind\":\"near\"," : "", ms, getenv("WHIST_TABU") ? "tabu (C)" : "anneal (C)", seed, restarts, moves);
  if (!found) { printf("null}\n"); return 1; }
  printf("[");
  for (int t = 0; t < k; t++) printf("%s[%d,%d,%d,%d]", t ? "," : "", perm[4 * t], perm[4 * t + 1], perm[4 * t + 2], perm[4 * t + 3]);
  printf("]}\n");
  return 0;
}
