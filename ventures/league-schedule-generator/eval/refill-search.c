/*
 * Refill search for whole timetables, in C (2026-11-14). A port of eval/round-refill.mjs with an
 * annealed acceptance, for the open question in README "12 teams cannot reach 122": the best known
 * 12-team round robin has non-cyclic carry-over 136 and none goes below 124. Is there one below 136?
 *
 * Move (as in round-refill.mjs): take w rounds out (2 to WMAX, half the time next to each other),
 * their games form a w-regular graph; refill the w slots with splits of that graph into w perfect
 * matchings, in any order, by depth-first search that adds each game's carry-over cells as it places
 * it (a cell already holding c costs 2c above the floor). The DFS keeps the best refill (ties at
 * random) under a node cap. Acceptance: the best refill is taken when it is no worse than the
 * current value plus a slack drawn from an annealing temperature (the slack is a budget on the DFS,
 * so a worse refill is taken only when nothing within the budget is better). After STALL moves with no
 * new best the search goes back to the climb's best timetable and kicks it with a few random refills;
 * after KICKS (default 30) kicks with no new best it starts a fresh climb from a shuffled circle method.
 *
 * Value. Team t meeting a in round r and b in round r + 1 adds one to cell (a, b); value = sum over
 * cells of c^2 = n(n - 2) + 2E. Every accepted timetable is re-scored from scratch and checked to be a
 * round robin before it is printed.
 *
 * Build: cc -O3 -march=native -o refill-search eval/refill-search.c
 * Run:   ./refill-search N SECONDS SEED [start]   start: "circle" (default) or a file holding a
 *        timetable as N - 1 lines of N opponents (opp[r][t], the TIMETABLES format, brackets ignored)
 * Prints one line per new best ("best V at T s") and at the end the best timetable as opp[r][t].
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <math.h>

#define MAXN 32
static int N, R, WMAX = 5;
static int opp[MAXN][MAXN], best[MAXN][MAXN];
static unsigned long long rs;
static inline unsigned rnd(void) { rs ^= rs << 13; rs ^= rs >> 7; rs ^= rs << 17; return (unsigned)(rs >> 11); }
static inline double urand(void) { return (rnd() & 0xffffff) / 16777216.0; }
static double now(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec + t.tv_nsec * 1e-9; }

static int value(int o[MAXN][MAXN]) {
  static int c[MAXN * MAXN];
  memset(c, 0, sizeof(int) * N * N);
  int v = 0;
  for (int r = 0; r + 1 < R; r++) for (int t = 0; t < N; t++) { int i = o[r][t] * N + o[r + 1][t]; v += 2 * c[i] + 1; c[i]++; }
  return v;
}
static int is_round_robin(int o[MAXN][MAXN]) {
  int met[MAXN][MAXN] = {{0}};
  for (int r = 0; r < R; r++) for (int t = 0; t < N; t++) {
    int u = o[r][t];
    if (u < 0 || u >= N || u == t || o[r][u] != t) return 0;
    met[t][u]++;
  }
  for (int t = 0; t < N; t++) for (int u = 0; u < N; u++) if (u != t && met[t][u] != 1) return 0;
  return 1;
}

/* ---- refill ---- */
static int W[MAXN], nw, inW[MAXN], cell[MAXN * MAXN], fr[MAXN][MAXN], cur2[MAXN][MAXN], bestRef[MAXN][MAXN];
static int target, bestEx, ties, order[MAXN];
static long nodes, nodeCap;
static int kickMode;
static void place_round(int k, int ex);
static void pick(int k, int ex) {
  if (++nodes > nodeCap) return;
  int *o = cur2[k];
  int a = -1;
  for (int i = 0; i < N; i++) if (o[order[i]] < 0) { a = order[i]; break; }
  if (a < 0) { place_round(k + 1, ex); return; }
  int r = W[k];
  int *prev = r > 0 ? (inW[r - 1] ? cur2[k - 1] : opp[r - 1]) : NULL;
  int *next = (r + 1 < R && !inW[r + 1]) ? opp[r + 1] : NULL;
  int st = rnd() % N;
  for (int s = 0; s < N; s++) {
    int b = (st + s) % N;
    if (b == a || o[b] >= 0 || !fr[a][b]) continue;
    int cs[4], nc = 0, d = 0;
    if (prev) { cs[nc++] = prev[a] * N + b; cs[nc++] = prev[b] * N + a; }
    if (next) { cs[nc++] = b * N + next[a]; cs[nc++] = a * N + next[b]; }
    for (int j = 0; j < nc; j++) { d += 2 * cell[cs[j]]; cell[cs[j]]++; }
    if (ex + d <= target && ex + d <= bestEx) {
      o[a] = b; o[b] = a; fr[a][b] = fr[b][a] = 0;
      pick(k, ex + d);
      o[a] = -1; o[b] = -1; fr[a][b] = fr[b][a] = 1;
    }
    for (int j = 0; j < nc; j++) cell[cs[j]]--;
    if (nodes > nodeCap) return;
  }
}
static void place_round(int k, int ex) {
  if (k == nw) {
    if (ex < bestEx || (ex == bestEx && urand() * ++ties < 1)) {
      if (ex < bestEx) ties = 1;
      bestEx = ex;
      for (int j = 0; j < nw; j++) memcpy(bestRef[j], cur2[j], sizeof(int) * N);
    }
    if (kickMode) nodes = nodeCap + 1; /* a kick takes the first refill within the budget */
    return;
  }
  pick(k, ex);
}
/* Refill the rounds in W; returns the new value, or -1 when no refill fits the budget. With kick,
 * the first refill found within the budget is taken (bestEx is not tightened). */
static int refill(int cur, int slack, long cap, int kick) {
  memset(inW, 0, sizeof inW);
  for (int j = 0; j < nw; j++) inW[W[j]] = 1;
  memset(cell, 0, sizeof(int) * N * N);
  int base = 0, placed = 0;
  for (int r = 0; r + 1 < R; r++) {
    if (inW[r] || inW[r + 1]) continue;
    for (int t = 0; t < N; t++) { int i = opp[r][t] * N + opp[r + 1][t]; base += 2 * cell[i] + 1; cell[i]++; placed++; }
  }
  memset(fr, 0, sizeof fr);
  for (int j = 0; j < nw; j++) for (int t = 0; t < N; t++) fr[t][opp[W[j]][t]] = 1;
  int trans = N * (N - 2), baseEx = base - placed;
  target = cur - trans + slack - baseEx;
  ties = 0; nodes = 0; nodeCap = cap; kickMode = kick;
  for (int j = 0; j < nw; j++) for (int t = 0; t < N; t++) cur2[j][t] = -1;
  for (int i = 0; i < N; i++) order[i] = i;
  for (int i = N - 1; i > 0; i--) { int j = rnd() % (i + 1); int x = order[i]; order[i] = order[j]; order[j] = x; }
  bestEx = 1 << 29;
  place_round(0, 0);
  if (bestEx == 1 << 29) return -1;
  for (int j = 0; j < nw; j++) memcpy(opp[W[j]], bestRef[j], sizeof(int) * N);
  return trans + baseEx + bestEx;
}
static void pick_window(void) {
  int w = 2 + rnd() % (WMAX - 1);
  if (w > R) w = R;
  nw = 0;
  if (rnd() & 1) { int i = rnd() % (R - w + 1); for (int k = 0; k < w; k++) W[nw++] = i + k; }
  else {
    int used[MAXN] = {0};
    while (nw < w) { int r = rnd() % R; if (!used[r]) { used[r] = 1; W[nw++] = r; } }
    for (int i = 1; i < nw; i++) for (int j = i; j > 0 && W[j - 1] > W[j]; j--) { int x = W[j]; W[j] = W[j - 1]; W[j - 1] = x; }
  }
}

static void circle(void) {
  int m = N - 1;
  for (int r = 0; r < R; r++) {
    opp[r][m] = r; opp[r][r] = m;
    for (int k = 1; k < N / 2; k++) { int a = (r + k) % m, b = (r - k + m) % m; opp[r][a] = b; opp[r][b] = a; }
  }
}
static int load(const char *path) {
  FILE *f = fopen(path, "r");
  if (!f) return 0;
  int n = 0, ch, v = 0, in = 0;
  while ((ch = fgetc(f)) != EOF) {
    if (ch >= '0' && ch <= '9') { v = v * 10 + ch - '0'; in = 1; }
    else if (in) { if (n < R * N) opp[n / N][n % N] = v; n++; v = 0; in = 0; }
  }
  if (in) { if (n < R * N) opp[n / N][n % N] = v; n++; }
  fclose(f);
  return n == R * N && is_round_robin(opp);
}

int main(int argc, char **argv) {
  if (argc < 4) { fprintf(stderr, "usage: refill-search N SECONDS SEED [circle|file] [stall] [temp]\n"); return 2; }
  N = atoi(argv[1]); R = N - 1;
  double secs = atof(argv[2]);
  rs = 0x9E3779B97F4A7C15ULL ^ (unsigned long long)atoll(argv[3]) * 0x2545F4914F6CDD1DULL; if (!rs) rs = 1;
  for (int i = 0; i < 10; i++) rnd();
  if (N < 4 || N > MAXN || N % 2) { fprintf(stderr, "N must be even, 4..%d\n", MAXN); return 2; }
  if (argc > 4 && strcmp(argv[4], "circle")) { if (!load(argv[4])) { fprintf(stderr, "bad timetable file\n"); return 2; } }
  else circle();
  long stallMax = argc > 5 ? atol(argv[5]) : 20000;
  double temp = argc > 6 ? atof(argv[6]) : 2.0;
  if (getenv("WMAX")) WMAX = atoi(getenv("WMAX"));
  int cur = value(opp), bv = cur;
  memcpy(best, opp, sizeof opp);
  printf("start %d\n", cur); fflush(stdout);
  double t0 = now(), end = t0 + secs;
  long moves = 0, stall = 0, kicks = 0, restarts = 0, sinceBest = 0;
  long kickMax = getenv("KICKS") ? atol(getenv("KICKS")) : 30;
  static int climb[MAXN][MAXN];
  int climbBest = cur;
  memcpy(climb, opp, sizeof opp);
  while (1) {
    if ((moves & 255) == 0 && now() > end) break;
    pick_window();
    int slack = 0;
    if (temp > 0) { double u = urand(); slack = 2 * (int)floor(-temp * log(u + 1e-12) / 2.0); }
    int v = refill(cur, slack, 20000, 0);
    moves++;
    if (v >= 0) cur = v;
    if (cur < climbBest) { climbBest = cur; memcpy(climb, opp, sizeof opp); stall = 0; sinceBest = 0; }
    if (cur < bv) {
      bv = cur; memcpy(best, opp, sizeof opp); stall = 0;
      if (value(best) != bv || !is_round_robin(best)) { fprintf(stderr, "internal score mismatch\n"); return 3; }
      printf("best %d at %.1f s (moves %ld, kicks %ld, restarts %ld)\n", bv, now() - t0, moves, kicks, restarts); fflush(stdout);
    } else if (++stall > stallMax) {
      /* back to this climb's best, then a few random refills within a wide budget; after KICKS
       * kicks with no new best, a fresh climb from the circle method with its rounds and team
       * labels shuffled (most climbs settle in a basin within seconds) */
      if (++sinceBest > kickMax) {
        circle();
        for (int i = R - 1; i > 0; i--) { int j = rnd() % (i + 1); int tmp[MAXN]; memcpy(tmp, opp[i], sizeof tmp); memcpy(opp[i], opp[j], sizeof tmp); memcpy(opp[j], tmp, sizeof tmp); }
        climbBest = cur = value(opp); memcpy(climb, opp, sizeof opp); sinceBest = 0; restarts++; stall = 0;
        continue;
      }
      memcpy(opp, climb, sizeof opp); cur = climbBest;
      int nk = 2 + rnd() % 4;
      for (int k = 0; k < nk; k++) { pick_window(); int v2 = refill(cur, 8 + 2 * (rnd() % 8), 2000, 1); if (v2 >= 0) cur = v2; }
      stall = 0; kicks++;
    }
  }
  printf("final %d (moves %ld, kicks %ld, restarts %ld, %.0f s)\n", bv, moves, kicks, restarts, now() - t0);
  for (int r = 0; r < R; r++) {
    printf("[");
    for (int t = 0; t < N; t++) printf("%d%s", best[r][t], t + 1 < N ? ", " : "");
    printf("],\n");
  }
  return 0;
}
