/*
 * Every starter, not a sample: the least non-cyclic carry-over a starter timetable can reach
 * (2026-11-15). eval/starter-search.mjs sampled random starters (3,242 draws at 18 teams) and
 * kept the best; this program enumerates all of them for one size, so its answer is the least
 * over the whole starter family, a proof for that family (not for all round robins).
 *
 * A starter in Z_p (p = N - 1, odd) pairs up the nonzero residues so the differences +-(y - x) cover
 * every nonzero residue once. Round r shifts every pair by s = step * (r + start) and s meets team p
 * (starterOpp in carryover.mjs). Two reductions make one pass with step 1, start 0 enough:
 *  - a start only renames teams (round r of start t is round r + t of start 0 with u -> u - t);
 *  - starter S with step s is starter s^-1 * S with step 1 after renaming u -> s^-1 u (multiplying
 *    by a unit keeps a starter a starter), so every (starter, step) pair is some starter at step 1.
 * So the least over all starters at step 1 equals the least over every starter, step and start.
 *
 * Value, as in eval/window-refill.c: team t meeting a in round r and b in round r + 1 adds one to
 * cell (a, b); E = sum over cells of C(c, 2); value = N(N - 2) + 2E (all N teams playing).
 *
 * Pruning (exact): cells only grow as pairs are added, so the partial E of a partial starter is a
 * lower bound on its completions; a branch is cut once it reaches the best E found (or the cap
 * given), keeping every timetable at the least only when ALL=1.
 *
 * NOPRUNE=1 visits every starter (to check the count against the known number of starters).
 *
 * Build: cc -O3 -march=native -o starter-exhaust eval/starter-exhaust.c
 * Run:   ./starter-exhaust N [CAP_E]
 * Prints the number of starters visited, the least E and value, one starter reaching it (pairs, at
 * step 1) and its opponent table, re-scored from scratch and checked to be a round robin.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define MAXN 64

static int N, p;
static int px[MAXN], py[MAXN], np;      /* the partial starter */
static int used[MAXN], dused[MAXN];
static int cell[MAXN][MAXN];
static int E, bestE, bestX[MAXN], bestY[MAXN], countBest;
static long long starters, nodes;
static int all, noprune;

/* partner[z]: the residue paired with z in the partial starter, p for residue 0 (it meets team p),
 * -1 while unplaced. Team t (not p) in round r sits at base z = t - r (mod p) and meets
 * partner[z] + r (or p). Its transition r -> r + 1 goes from base z to base z - 1, so the p - 1
 * transitions "through the residue pair (z - 1, z)" (t = z + r, r = 0 .. p - 2) become known as
 * soon as both z - 1 and z have partners. Team p's transitions are known from the start. */
static int partner[MAXN];

static inline int shifted(int q, int r) { return q == p ? p : (q + r) % p; }

/* Count (d = +1) or uncount (d = -1) the transitions of every residue pair (z - 1, z) that the pair
 * {a, b} completes; partner[] must hold {a, b} already. Returns the change in E. */
static int touch(int a, int b, int d) {
  int zs[4] = { a, (a + 1) % p, b, (b + 1) % p }, nz = 0, list[4];
  for (int k = 0; k < 4; k++) {
    int z = zs[k], dup = 0;
    for (int j = 0; j < nz; j++) if (list[j] == z) dup = 1;
    if (!dup) list[nz++] = z;
  }
  int dE = 0;
  for (int j = 0; j < nz; j++) {
    int z = list[j], zm = (z - 1 + p) % p;
    if (partner[z] < 0 || partner[zm] < 0) continue;
    for (int r = 0; r + 1 < p; r++) {
      int u = shifted(partner[z], r), v = shifted(partner[zm], r + 1);
      if (d > 0) { dE += cell[u][v]; cell[u][v]++; } else { cell[u][v]--; dE -= cell[u][v]; }
    }
  }
  return dE;
}

static int full_score(int opp[MAXN][MAXN], int R) {
  int c[MAXN][MAXN]; memset(c, 0, sizeof c);
  int e = 0;
  for (int t = 0; t < N; t++) for (int r = 0; r + 1 < R; r++) e += c[opp[r][t]][opp[r + 1][t]]++;
  return e;
}

static void build(int *X, int *Y, int opp[MAXN][MAXN]) {
  for (int r = 0; r < p; r++) {
    opp[r][r] = p; opp[r][p] = r;
    for (int i = 0; i < (p - 1) / 2; i++) { int a = (X[i] + r) % p, b = (Y[i] + r) % p; opp[r][a] = b; opp[r][b] = a; }
  }
}

static void dfs(void) {
  nodes++;
  int x = 1;
  while (x < p && used[x]) x++;
  if (x >= p) {
    starters++;
    if (E < bestE || (all && E == bestE)) {
      if (E < bestE) countBest = 0;
      bestE = E; countBest++;
      memcpy(bestX, px, sizeof px); memcpy(bestY, py, sizeof py);
    }
    return;
  }
  used[x] = 1;
  for (int y = x + 1; y < p; y++) {
    if (used[y]) continue;
    int dd = y - x, e = dd < p - dd ? dd : p - dd;
    if (dused[e]) continue;
    used[y] = 1; dused[e] = 1; partner[x] = y; partner[y] = x;
    px[np] = x; py[np] = y; np++;
    int dE = touch(x, y, 1);
    E += dE;
    if (noprune || E < bestE || (all && E == bestE)) dfs();
    E -= dE;
    touch(x, y, -1);
    partner[x] = partner[y] = -1;
    np--; used[y] = 0; dused[e] = 0;
  }
  used[x] = 0;
}

int main(int argc, char **argv) {
  if (argc < 2) { fprintf(stderr, "usage: %s N [CAP_E]\n", argv[0]); return 2; }
  N = atoi(argv[1]); p = N - 1;
  if (N < 6 || N > MAXN || N % 2) return 2;
  all = getenv("ALL") ? atoi(getenv("ALL")) : 0;
  noprune = getenv("NOPRUNE") ? atoi(getenv("NOPRUNE")) : 0;
  bestE = argc > 2 ? atoi(argv[2]) + 1 : 1 << 30;
  for (int i = 0; i < MAXN; i++) partner[i] = -1;
  partner[0] = p;
  /* the transitions among teams whose bases are 0 only (team p, and team r meeting p) */
  E = 0;
  {
    /* team p: opponents r, r + 1 in rounds r, r + 1 -> known from the start */
    for (int r = 0; r + 1 < p; r++) E += cell[r][r + 1]++;
  }
  clock_t c0 = clock();
  dfs();
  double secs = (double)(clock() - c0) / CLOCKS_PER_SEC;
  if (bestE >= (1 << 30)) { printf("N %d: no starter under the cap; %lld nodes, %.1f s\n", N, nodes, secs); return 0; }
  int opp[MAXN][MAXN];
  build(bestX, bestY, opp);
  int e = full_score(opp, p);
  printf("N %d: least E %d (value %d, floor %d); starters completed under the bound %lld; nodes %lld; %.1f s%s\n",
         N, bestE, N * (N - 2) + 2 * bestE, N * (N - 2), starters, nodes, secs, all ? "" : "");
  if (all) printf("starters at the least: %d\n", countBest);
  printf("re-scored E %d %s\n", e, e == bestE ? "(agrees)" : "(DISAGREES)");
  printf("starter (step 1):");
  for (int i = 0; i < (p - 1) / 2; i++) printf(" %d %d", bestX[i], bestY[i]);
  printf("\n[");
  for (int r = 0; r < p; r++) { printf("%s[", r ? ", " : ""); for (int t = 0; t < N; t++) printf("%s%d", t ? ", " : "", opp[r][t]); printf("]"); }
  printf("]\n");
  return e == bestE ? 0 : 3;
}
