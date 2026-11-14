/*
 * Least non-cyclic carry-over of a single round robin: a large-neighbourhood search in C
 * (2026-11-14, latest). eval/round-refill.mjs does the same move in JavaScript; this version is
 * fast enough to refill up to 7 rounds at once and to run for hours on several cores.
 *
 * Value, as in eval/carryover-bnb.c: team t meeting a in round r and b in round r + 1 adds one to
 * cell (a, b); value = n(n - 2) + 2E with E = sum over cells of C(c, 2).
 *
 * Move. Take a set S of w rounds out of the incumbent (w from WMIN to WMAX; contiguous half the time).
 * Their games form a w-regular graph. Refill the w rounds with a split of that graph into perfect
 * matchings by depth-first search, rounds in increasing order and inside a round the lowest unplaced
 * team first, partners in random order. Placing t-u in round r adds the cells from round r - 1 (fixed
 * or already refilled) and, when r + 1 is not in S, the cells into round r + 1. A cell already holding
 * c costs c, so a branch is cut as soon as E passes the target. First the target is E - 1 (an
 * improvement); if no split reaches it, E (a plateau step, ties at random); with probability KICK
 * E + 1 or E + 2 instead. Each search stops after NODELIM nodes. After STALL moves with no new best
 * the incumbent restarts from the best with its rounds shuffled or reversed.
 *
 * Build: cc -O3 -march=native -o window-refill eval/window-refill.c
 * Run:   ./window-refill N SEED SECONDS [START_FILE]
 *        START_FILE holds opp[r][t] (any of whitespace, commas, brackets); without it the circle method.
 * Prints each new best (value and opp[r][t]) and the best at the end, re-scored from the opponents
 * and checked to be a round robin.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define MAXN 32

static int n, R;
static int opp[MAXN][MAXN], best[MAXN][MAXN], cell[MAXN][MAXN];
static int inS[MAXN], avail[MAXN][MAXN];
static int E, target, found;
static long long nodes, nodelim;
static int sol[MAXN][MAXN];
static unsigned long long rng = 88172645463325252ULL;
static unsigned rnd(void) { rng ^= rng << 13; rng ^= rng >> 7; rng ^= rng << 17; return (unsigned)(rng >> 11); }

static int score(int o[MAXN][MAXN]) {
  int c[MAXN][MAXN]; memset(c, 0, sizeof c);
  int e = 0;
  for (int t = 0; t < n; t++)
    for (int r = 0; r + 1 < R; r++) e += c[o[r][t]][o[r + 1][t]]++;
  return e;
}

static int is_rr(int o[MAXN][MAXN]) {
  int met[MAXN][MAXN]; memset(met, 0, sizeof met);
  for (int r = 0; r < R; r++)
    for (int t = 0; t < n; t++) {
      int u = o[r][t];
      if (u < 0 || u >= n || u == t || o[r][u] != t) return 0;
      met[t][u]++;
    }
  for (int t = 0; t < n; t++) for (int u = 0; u < n; u++) if (u != t && met[t][u] != 1) return 0;
  return 1;
}

/* The cells a team t contributes when it meets u in round r. */
static inline int add_cost(int r, int t, int u) {
  int c = 0;
  if (r > 0) c += cell[opp[r - 1][t]][u];
  if (r + 1 < R && !inS[r + 1]) c += cell[u][opp[r + 1][t]];
  return c;
}
static inline void add_cells(int r, int t, int u, int d) {
  if (r > 0) cell[opp[r - 1][t]][u] += d;
  if (r + 1 < R && !inS[r + 1]) cell[u][opp[r + 1][t]] += d;
}

static int Slist[MAXN], w;

static void dfs(int si) {
  if (found || nodes > nodelim) return;
  nodes++;
  if (si == w) { found = 1; memcpy(sol, opp, sizeof opp); return; }
  int r = Slist[si];
  int t = 0;
  while (t < n && opp[r][t] >= 0) t++;
  if (t == n) { dfs(si + 1); return; }
  int cand[MAXN], nc = 0;
  for (int u = t + 1; u < n; u++) if (opp[r][u] < 0 && avail[t][u]) cand[nc++] = u;
  for (int i = nc - 1; i > 0; i--) { int j = rnd() % (i + 1), x = cand[i]; cand[i] = cand[j]; cand[j] = x; }
  for (int i = 0; i < nc; i++) {
    int u = cand[i];
    /* t's cells first, then u's (they can share a cell only if t and u meet the same team in r - 1,
     * which they cannot, or both flow into the same cell of round r + 1, which they cannot either) */
    opp[r][t] = u; opp[r][u] = t;
    int c = add_cost(r, t, u) + add_cost(r, u, t);
    if (E + c <= target) {
      add_cells(r, t, u, 1); add_cells(r, u, t, 1);
      avail[t][u] = avail[u][t] = 0; E += c;
      dfs(si);
      E -= c; avail[t][u] = avail[u][t] = 1;
      add_cells(r, t, u, -1); add_cells(r, u, t, -1);
    }
    opp[r][t] = opp[r][u] = -1;
    if (found || nodes > nodelim) return;
  }
}

/* Remove the rounds in S from opp and the cells; E becomes what the fixed rounds give. */
static void remove_set(void) {
  for (int i = 0; i < w; i++) {
    int r = Slist[i];
    for (int t = 0; t < n; t++) { int u = opp[r][t]; if (t < u) avail[t][u] = avail[u][t] = 1; }
  }
  memset(cell, 0, sizeof cell);
  E = 0;
  for (int r = 0; r + 1 < R; r++) {
    if (inS[r] || inS[r + 1]) continue;
    for (int t = 0; t < n; t++) E += cell[opp[r][t]][opp[r + 1][t]]++;
  }
  for (int i = 0; i < w; i++) for (int t = 0; t < n; t++) opp[Slist[i]][t] = -1;
}

static int read_file(const char *path, int o[MAXN][MAXN]) {
  FILE *f = fopen(path, "r");
  if (!f) return 0;
  int nv = 0, ch, v = -1;
  while ((ch = fgetc(f)) != EOF && nv < R * n) {
    if (ch >= '0' && ch <= '9') v = (v < 0 ? 0 : v * 10) + ch - '0';
    else if (v >= 0) { o[nv / n][nv % n] = v; nv++; v = -1; }
  }
  if (v >= 0 && nv < R * n) { o[nv / n][nv % n] = v; nv++; }
  fclose(f);
  return nv == R * n;
}

static void print_opp(int o[MAXN][MAXN]) {
  printf("[");
  for (int r = 0; r < R; r++) {
    printf("%s[", r ? ", " : "");
    for (int t = 0; t < n; t++) printf("%s%d", t ? ", " : "", o[r][t]);
    printf("]");
  }
  printf("]\n");
  fflush(stdout);
}

int main(int argc, char **argv) {
  if (argc < 4) { fprintf(stderr, "usage: %s N SEED SECONDS [START_FILE]\n", argv[0]); return 2; }
  n = atoi(argv[1]); R = n - 1;
  if (n < 4 || n > MAXN || n % 2) return 2;
  rng ^= (unsigned long long)atoll(argv[2]) * 0x9E3779B97F4A7C15ULL;
  for (int i = 0; i < 10; i++) rnd();
  double secs = atof(argv[3]);
  int wmin = getenv("WMIN") ? atoi(getenv("WMIN")) : 3, wmax = getenv("WMAX") ? atoi(getenv("WMAX")) : 6;
  if (wmax > R) wmax = R;
  if (wmin > wmax) wmin = wmax;
  nodelim = getenv("NODELIM") ? atoll(getenv("NODELIM")) : 200000;
  double kick = getenv("KICK") ? atof(getenv("KICK")) : 0.02;
  long stall = getenv("STALL") ? atol(getenv("STALL")) : 20000;
  if (argc >= 5) { if (!read_file(argv[4], opp)) { fprintf(stderr, "bad start file\n"); return 2; } }
  else for (int r = 0; r < R; r++) { /* circle method */
    opp[r][n - 1] = r; opp[r][r] = n - 1;
    for (int i = 1; i < n / 2; i++) { int a = (r + i) % R, b = (r - i + R) % R; opp[r][a] = b; opp[r][b] = a; }
  }
  if (!is_rr(opp)) { fprintf(stderr, "start is not a round robin\n"); return 2; }
  int cur = score(opp), bestE = cur;
  memcpy(best, opp, sizeof opp);
  printf("start value %d (E %d)\n", n * (n - 2) + 2 * cur, cur);
  fflush(stdout);
  clock_t c0 = clock();
  long moves = 0, since = 0, improves = 0;
  while ((double)(clock() - c0) / CLOCKS_PER_SEC < secs) {
    moves++; since++;
    if (since > stall) {
      memcpy(opp, best, sizeof opp);
      if (rnd() & 1) { for (int a = 0, b = R - 1; a < b; a++, b--) for (int t = 0; t < n; t++) { int x = opp[a][t]; opp[a][t] = opp[b][t]; opp[b][t] = x; } }
      else { int a = rnd() % R, b = rnd() % R; for (int t = 0; t < n; t++) { int x = opp[a][t]; opp[a][t] = opp[b][t]; opp[b][t] = x; } }
      cur = score(opp); since = 0;
    }
    w = wmin + rnd() % (wmax - wmin + 1);
    memset(inS, 0, sizeof inS);
    if (rnd() & 1) { int a = rnd() % (R - w + 1); for (int i = 0; i < w; i++) inS[a + i] = 1; }
    else { int k = 0; while (k < w) { int r = rnd() % R; if (!inS[r]) { inS[r] = 1; k++; } } }
    for (int r = 0, k = 0; r < R; r++) if (inS[r]) Slist[k++] = r;
    int save[MAXN][MAXN]; memcpy(save, opp, sizeof opp);
    memset(avail, 0, sizeof avail);
    remove_set();
    int base = E;
    double p = (rnd() % 100000) / 100000.0;
    int tries[2] = { cur - 1, p < kick ? cur + 1 + (int)(rnd() & 1) : cur };
    found = 0;
    for (int k = 0; k < 2 && !found; k++) {
      target = tries[k]; E = base; nodes = 0;
      dfs(0);
    }
    if (found) {
      memcpy(opp, sol, sizeof sol);
      int v = score(opp);
      cur = v;
      if (v < bestE) {
        if (!is_rr(opp)) { fprintf(stderr, "BUG: not a round robin\n"); return 3; }
        bestE = v; memcpy(best, opp, sizeof opp); since = 0; improves++;
        printf("best value %d (E %d) after %ld moves, %.1f s\n", n * (n - 2) + 2 * v, v, moves,
               (double)(clock() - c0) / CLOCKS_PER_SEC);
        print_opp(best);
      }
    } else memcpy(opp, save, sizeof save);
  }
  int largest = 0, c[MAXN][MAXN]; memset(c, 0, sizeof c);
  for (int t = 0; t < n; t++) for (int r = 0; r + 1 < R; r++) c[best[r][t]][best[r + 1][t]]++;
  for (int a = 0; a < n; a++) for (int b = 0; b < n; b++) if (c[a][b] > largest) largest = c[a][b];
  printf("END best value %d (E %d), largest cell %d, round robin %s; %ld moves, %.1f s\n",
         n * (n - 2) + 2 * bestE, bestE, largest, is_rr(best) ? "yes" : "NO", moves,
         (double)(clock() - c0) / CLOCKS_PER_SEC);
  print_opp(best);
  return 0;
}
