/* Tabu search for whist designs with more than one base round, for the sizes the one-base-round
 * cyclic search (eval/whist-anneal.c) did not reach: 52 (Z51 + infinity) and 57 (Z57).
 *
 * Two structures that the cyclic search cannot see:
 *
 *   levels L m  -- players Z_m x {0..L-1} (plus infinity when n = L*m + 1 is 4k). There are L base
 *                  rounds, each developed by adding g in Z_m to the first coordinate, so L*m rounds.
 *                  A pair's class is what adding g keeps: {d, -d} for two players on one level,
 *                  (level i, level j, y - x) for two levels, the level for a pair with infinity.
 *                  Whist: every class partners once and opposes twice over the L base rounds.
 *                  For n = 4k+1 base round j seats everyone but (0, j), so each player sits out
 *                  exactly once. L = 1 is the cyclic search again.
 *   semi p q r  -- players are the elements of the group Z_p x| Z_q, (a,b)(c,d) = (a + r^b c, b + d)
 *                  with r of order q mod p (non-abelian; 57 = 19 x 3, r = 7). One base round seats
 *                  every element but the identity; round g is g times it (left multiplication).
 *                  The class of {x, y} is {x^-1 y, y^-1 x}, which left multiplication keeps.
 *
 * State: per base round a permutation of its seated players, four in a row a table [a,b,x,y]
 * (a&b vs x&y). Cost: sum over classes of |partner count - 1| + |opponent count - 2|. Each step
 * makes the best swap of two players at different tables of one base round, the two just moved
 * barred for `tenure` steps unless the swap reaches a new best; restart after `stall` steps.
 *
 *   cc -O2 -o whist-orbits eval/whist-orbits.c
 *   ./whist-orbits levels 3 17 <seconds> <seed> [tenure] [stall]     (52 players)
 *   ./whist-orbits levels 3 19 <seconds> <seed> [tenure] [stall]     (57 players)
 *   ./whist-orbits semi 19 3 7 <seconds> <seed> [tenure] [stall]     (57 players, non-abelian)
 * Prints one JSON line; exit 0 when found. Point ids: levels, (x, i) = i*m + x and infinity -1;
 * semi, (a, b) = a + p*b. eval/whist-orbits-check.mjs develops a line and checks it pair by pair. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#define MAXP 72
#define MAXR 8
static int n, R, K, P, ncls, cls[MAXP][MAXP], pc[4096], oc[4096], cost;
static int perm[MAXR][MAXP], pid[MAXP]; /* pid: printable id of internal point */
static int mode_levels, L, M, gp, gq, gr;
static unsigned long long rs;
static unsigned long long rnd(void) { rs ^= rs << 13; rs ^= rs >> 7; rs ^= rs << 17; return rs; }
static int pcost(int c) { return abs(c - 1); }
static int ocost(int c) { return abs(c - 2); }
static void tab(int r, int t, int s) {
  int *q = perm[r] + 4 * t;
  static const int PP[2][2] = {{0, 1}, {2, 3}}, O[4][2] = {{0, 2}, {0, 3}, {1, 2}, {1, 3}};
  for (int i = 0; i < 2; i++) { int c = cls[q[PP[i][0]]][q[PP[i][1]]]; cost -= pcost(pc[c]); pc[c] += s; cost += pcost(pc[c]); }
  for (int i = 0; i < 4; i++) { int c = cls[q[O[i][0]]][q[O[i][1]]]; cost -= ocost(oc[c]); oc[c] += s; cost += ocost(oc[c]); }
}
static void reset(void) {
  memset(pc, 0, sizeof pc); memset(oc, 0, sizeof oc); cost = 0;
  for (int c = 0; c < ncls; c++) cost += pcost(0) + ocost(0);
  for (int r = 0; r < R; r++) for (int t = 0; t < K; t++) tab(r, t, 1);
}
static void sw(int r, int i, int j) {
  int ti = i / 4, tj = j / 4, x;
  tab(r, ti, -1); tab(r, tj, -1);
  x = perm[r][i]; perm[r][i] = perm[r][j]; perm[r][j] = x;
  tab(r, ti, 1); tab(r, tj, 1);
}
/* semi-direct product helpers */
static int gmul(int x, int y) {
  int a = x % gp, b = x / gp, c = y % gp, d = y / gp, rb = 1;
  for (int i = 0; i < b; i++) rb = rb * gr % gp;
  return (a + rb * c) % gp + gp * ((b + d) % gq);
}
static int ginv(int x) { for (int y = 0; y < gp * gq; y++) if (gmul(x, y) == 0) return y; return -1; }
static int build(void) {
  static int seated[MAXR][MAXP], nseat;
  if (mode_levels) {
    int v = L * M, inf = (v + 1) % 4 == 0; n = v + inf;
    if (M % 2 == 0 || !(n % 4 == 0 || n % 4 == 1)) return 0;
    R = L; K = n / 4; P = v + inf;
    int h = (M - 1) / 2, base = L, pairs = 0;
    for (int p = 0; p < P; p++) pid[p] = p < v ? p : -1;
    for (int p = 0; p < P; p++) for (int q = 0; q < P; q++) {
      if (p == q) { cls[p][q] = -1; continue; }
      if (p == v || q == v) { cls[p][q] = (p == v ? q : p) / M; continue; }
      int i = p / M, x = p % M, j = q / M, y = q % M;
      if (i == j) { int d = ((y - x) % M + M) % M; if (d > h) d = M - d; cls[p][q] = base + i * h + d - 1; continue; }
      if (i > j) { int t = i; i = j; j = t; t = x; x = y; y = t; }
      int pi = 0; for (int a = 0; a < i; a++) pi += L - 1 - a; pi += j - i - 1;
      cls[p][q] = base + L * h + pi * M + ((y - x) % M + M) % M;
      if (pi + 1 > pairs) pairs = pi + 1;
    }
    ncls = base + L * h + L * (L - 1) / 2 * M;
    if (!inf) ncls -= L; /* no infinity classes: shift */
    if (!inf) for (int p = 0; p < P; p++) for (int q = 0; q < P; q++) if (p != q) cls[p][q] -= L;
    for (int r = 0; r < R; r++) { nseat = 0; for (int p = 0; p < P; p++) if (inf || p != r * M) seated[r][nseat++] = p; memcpy(perm[r], seated[r], sizeof(int) * nseat); }
  } else {
    n = gp * gq; if (n % 4 != 1) return 0;
    R = 1; K = n / 4; P = n;
    int rq = 1; for (int i = 0; i < gq; i++) rq = rq * gr % gp; if (rq != 1) return 0;
    int id[MAXP]; for (int g = 0; g < n; g++) id[g] = -1; ncls = 0;
    for (int g = 1; g < n; g++) if (id[g] < 0) { id[g] = ncls; id[ginv(g)] = ncls; ncls++; }
    for (int p = 0; p < P; p++) pid[p] = p;
    for (int x = 0; x < n; x++) for (int y = 0; y < n; y++) cls[x][y] = x == y ? -1 : id[gmul(ginv(x), y)];
    for (int i = 1; i < n; i++) perm[0][i - 1] = i;
  }
  return 1;
}
int main(int argc, char **argv) {
  if (argc < 4) { fprintf(stderr, "usage: see the header\n"); return 2; }
  int a = 1;
  mode_levels = !strcmp(argv[a], "levels"); a++;
  if (mode_levels) { L = atoi(argv[a++]); M = atoi(argv[a++]); }
  else { gp = atoi(argv[a++]); gq = atoi(argv[a++]); gr = atoi(argv[a++]); }
  double secs = argc > a ? atof(argv[a]) : 60; a++;
  unsigned long long seed = argc > a ? strtoull(argv[a], 0, 10) : 1; a++;
  int tenure = argc > a ? atoi(argv[a]) : 4; a++;
  long stall = argc > a ? atol(argv[a]) : 200000; a++;
  rs = seed * 2654435761ULL + 88172645463325252ULL;
  if (!build() || R > MAXR || P > MAXP) { fprintf(stderr, "bad parameters\n"); return 2; }
  int nm = 4 * K;
  clock_t t0 = clock();
  long restarts = 0, moves = 0; int found = 0, bestEver = 1 << 30;
  static long last[MAXR][MAXP];
  while (!found && (double)(clock() - t0) / CLOCKS_PER_SEC < secs) {
    restarts++;
    for (int r = 0; r < R; r++) for (int i = nm - 1; i > 0; i--) { int j = rnd() % (i + 1), t = perm[r][i]; perm[r][i] = perm[r][j]; perm[r][j] = t; }
    reset();
    for (int r = 0; r < R; r++) for (int i = 0; i < nm; i++) last[r][i] = -1000000;
    int best = cost; long since = 0;
    for (long s = 0; since < stall; s++, since++) {
      int bd = 1 << 30, br = -1, bi = -1, bj = -1, ties = 0;
      for (int r = 0; r < R; r++) for (int i = 0; i < nm; i++) for (int j = (i / 4 + 1) * 4; j < nm; j++) {
        int old = cost; sw(r, i, j); int d = cost - old; sw(r, i, j);
        int tabu = s - last[r][i] < tenure || s - last[r][j] < tenure;
        if (tabu && old + d >= best) continue;
        if (d < bd) { bd = d; br = r; bi = i; bj = j; ties = 1; }
        else if (d == bd && rnd() % ++ties == 0) { br = r; bi = i; bj = j; }
      }
      moves++;
      if ((s & 255) == 0 && (double)(clock() - t0) / CLOCKS_PER_SEC >= secs) break;
      if (br < 0) continue;
      sw(br, bi, bj); last[br][bi] = last[br][bj] = s;
      if (cost < best) { best = cost; since = 0; }
      if (cost < bestEver) bestEver = cost;
      if (cost == 0) { found = 1; break; }
    }
    if (getenv("WHIST_VERBOSE")) fprintf(stderr, "restart %ld best %d\n", restarts, best);
  }
  long ms = (long)((clock() - t0) * 1000 / CLOCKS_PER_SEC);
  if (mode_levels) printf("{\"n\":%d,\"structure\":\"levels\",\"levels\":%d,\"mod\":%d,", n, L, M);
  else printf("{\"n\":%d,\"structure\":\"semi\",\"p\":%d,\"q\":%d,\"r\":%d,", n, gp, gq, gr);
  printf("\"ms\":%ld,\"method\":\"tabu (C, whist-orbits)\",\"seed\":%llu,\"tenure\":%d,\"stall\":%ld,\"restarts\":%ld,\"moves\":%ld,\"bestCost\":%d,\"bases\":", ms, seed, tenure, stall, restarts, moves, bestEver);
  if (!found) { printf("null}\n"); return 1; }
  printf("[");
  for (int r = 0; r < R; r++) {
    printf("%s[", r ? "," : "");
    for (int t = 0; t < K; t++) { int *q = perm[r] + 4 * t; printf("%s[%d,%d,%d,%d]", t ? "," : "", pid[q[0]], pid[q[1]], pid[q[2]], pid[q[3]]); }
    printf("]");
  }
  printf("]}\n");
  return 0;
}
