/*
 * Large-neighbourhood search for low non-cyclic carry-over, with exact completion of the last rounds.
 *
 * The question (README, "Refilled rounds" and "12 teams cannot reach 122"): the best known 12-team
 * round robin has carry-over 136, and no 12-team round robin goes below 124. eval/round-refill.mjs
 * re-deals 2 to 5 rounds at a time; this program frees more of them. Each move keeps the first k
 * rounds of the current timetable (or, at random, of its reversal: reversing the rounds transposes the
 * carry-over matrix and keeps the value) and asks eval/carryover-bnb.c's depth-first search, with its
 * exact per-round matching bound, to complete the last w = R - k rounds from the games left. That is
 * every way to re-deal those games into w rounds, in any order, not a sample of them.
 *
 *   ./carryover-lns N SEED SECONDS [WMIN WMAX NODES] < start.json
 *
 * start.json holds opp[r][t] (the format of TIMETABLES in carryover.mjs); with no input the circle
 * method is used. A move first asks for strictly less E than the current timetable within NODES
 * search nodes (default 4 M). When there is none it may take a different completion at the same E
 * (a plateau step, chosen by a randomised partner order) or, after 200 moves with no change, swap two
 * random rounds (a kick) and carry on from the result if it is within 8 of the best E. Every
 * timetable printed is rescored from its opponents alone and checked to be a round robin.
 *
 * Build: cc -O3 -march=native -o carryover-lns eval/carryover-lns.c
 * Output: one "BEST value V" line per improvement, with the timetable as opp[r][t].
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define MAXN 18

static int n, R, emax;
static int opp[MAXN][MAXN];
static unsigned char used[MAXN][MAXN];
static int cell[MAXN][MAXN];
static int E;
static long long nodes, node_cap;
static int found;
static int order[MAXN][MAXN];   /* per-round randomised partner order */

static int failb[MAXN][1 << MAXN];
static unsigned stamp[MAXN][1 << MAXN], cur[MAXN];

static unsigned long long rng = 88172645463325252ULL;
static unsigned rnd(void) { rng ^= rng << 13; rng ^= rng >> 7; rng ^= rng << 17; return (unsigned)(rng >> 11); }

static int can_pair(int r, int mask, int budget) {
  if (!mask) return 1;
  if (stamp[r][mask] == cur[r] && failb[r][mask] >= budget) return 0;
  int t = __builtin_ctz(mask), rest = mask & ~(1 << t);
  int a = opp[r - 1][t];
  for (int m = rest; m; m &= m - 1) {
    int u = __builtin_ctz(m);
    if (used[t][u]) continue;
    int c = cell[a][u] + cell[opp[r - 1][u]][t];
    if (c <= budget && can_pair(r, rest & ~(1 << u), budget - c)) return 1;
  }
  if (stamp[r][mask] != cur[r] || failb[r][mask] < budget) { stamp[r][mask] = cur[r]; failb[r][mask] = budget; }
  return 0;
}

static int unplaced_mask(int r) {
  int m = 0;
  for (int t = 0; t < n; t++) if (opp[r][t] < 0) m |= 1 << t;
  return m;
}

static int round_ok(int r) {
  for (int t = 0; t < n; t++) {
    if (opp[r][t] >= 0) continue;
    int ok = 0;
    for (int u = 0; u < n && !ok; u++)
      if (u != t && opp[r][u] < 0 && !used[t][u]) ok = 1;
    if (!ok) return 0;
  }
  return 1;
}

static void dfs(int r) {
  if (found || nodes > node_cap) return;
  nodes++;
  int t = 0;
  while (t < n && opp[r][t] >= 0) t++;
  if (t == n) {
    if (r + 1 == R) { found = 1; return; }
    if (!round_ok(r + 1)) return;
    cur[r + 1]++;
    if (!can_pair(r + 1, (1 << n) - 1, emax - E)) return;
    dfs(r + 1);
    return;
  }
  for (int i = 0; i < n; i++) {
    int u = order[r][i];
    if (u <= t || opp[r][u] >= 0 || used[t][u]) continue;
    int a = opp[r - 1][t], b = opp[r - 1][u];
    int add = cell[a][u] + cell[b][t];
    if (E + add > emax) continue;
    cell[a][u]++; cell[b][t]++;
    E += add;
    opp[r][t] = u; opp[r][u] = t; used[t][u] = used[u][t] = 1;
    if (round_ok(r) && can_pair(r, unplaced_mask(r), emax - E)) dfs(r);
    if (found) return;
    opp[r][t] = -1; opp[r][u] = -1; used[t][u] = used[u][t] = 0;
    E -= add;
    cell[a][u]--; cell[b][t]--;
  }
}

/* E of a full timetable, from the opponents alone; -1 if it is not a round robin. */
static int score(int T[MAXN][MAXN]) {
  int c[MAXN][MAXN], seen[MAXN][MAXN];
  memset(c, 0, sizeof c); memset(seen, 0, sizeof seen);
  for (int r = 0; r < R; r++)
    for (int t = 0; t < n; t++) {
      int u = T[r][t];
      if (u < 0 || u >= n || u == t || T[r][u] != t || seen[t][u]) return -1;
      seen[t][u] = 1;
    }
  for (int t = 0; t < n; t++)
    for (int r = 0; r + 1 < R; r++) c[T[r][t]][T[r + 1][t]]++;
  int e = 0;
  for (int a = 0; a < n; a++)
    for (int b = 0; b < n; b++) e += c[a][b] * (c[a][b] - 1) / 2;
  return e;
}

static void print_tt(int T[MAXN][MAXN]) {
  printf("[");
  for (int r = 0; r < R; r++) {
    printf("%s[", r ? ", " : "");
    for (int t = 0; t < n; t++) printf("%s%d", t ? ", " : "", T[r][t]);
    printf("]");
  }
  printf("]\n");
  fflush(stdout);
}

/* Load the first k rounds of T into the search state; returns their E. */
static void load_prefix(int T[MAXN][MAXN], int k) {
  memset(opp, -1, sizeof opp); memset(used, 0, sizeof used); memset(cell, 0, sizeof cell);
  E = 0;
  for (int r = 0; r < k; r++)
    for (int t = 0; t < n; t++) {
      int u = T[r][t];
      opp[r][t] = u; used[t][u] = 1;
      if (r > 0 && t < u) {
        int a = opp[r - 1][t], b = opp[r - 1][u];
        E += cell[a][u] + cell[b][t];
        cell[a][u]++; cell[b][t]++;
      }
    }
}

/* Complete T's last R - k rounds with E <= target; on success writes the result to OUT. */
static int complete(int T[MAXN][MAXN], int k, int target, int OUT[MAXN][MAXN]) {
  load_prefix(T, k);
  if (E > target) return 0;
  for (int r = k; r < R; r++) {
    for (int i = 0; i < n; i++) order[r][i] = i;
    for (int i = n - 1; i > 0; i--) { int j = rnd() % (i + 1), x = order[r][i]; order[r][i] = order[r][j]; order[r][j] = x; }
  }
  emax = target; found = 0; nodes = 0;
  if (!round_ok(k)) return 0;
  cur[k]++;
  if (!can_pair(k, (1 << n) - 1, emax - E)) return 0;
  dfs(k);
  if (!found) return 0;
  memcpy(OUT, opp, sizeof opp);
  return 1;
}

static void reverse_tt(int T[MAXN][MAXN]) {
  for (int i = 0, j = R - 1; i < j; i++, j--)
    for (int t = 0; t < n; t++) { int x = T[i][t]; T[i][t] = T[j][t]; T[j][t] = x; }
}

int main(int argc, char **argv) {
  if (argc < 4) { fprintf(stderr, "usage: %s N SEED SECONDS [WMIN WMAX NODES] < start.json\n", argv[0]); return 2; }
  n = atoi(argv[1]); R = n - 1;
  unsigned long long seed = strtoull(argv[2], 0, 10);
  double secs = atof(argv[3]);
  int wmin = argc > 4 ? atoi(argv[4]) : 5, wmax = argc > 5 ? atoi(argv[5]) : 8;
  node_cap = argc > 6 ? atoll(argv[6]) : 4000000;
  if (n < 6 || n > MAXN || n % 2 || wmin < 2 || wmax > R || wmin > wmax) return 2;
  rng ^= seed * 0x9E3779B97F4A7C15ULL; for (int i = 0; i < 10; i++) rnd();

  int curT[MAXN][MAXN], bestT[MAXN][MAXN], tmp[MAXN][MAXN];
  memset(curT, -1, sizeof curT);
  /* read a JSON-ish list of integers from stdin, if any */
  int vals[MAXN * MAXN], nv = 0, ch, num = -1;
  if (!getenv("CIRCLE")) {
    while ((ch = getchar()) != EOF && nv < R * n) {
      if (ch >= '0' && ch <= '9') num = (num < 0 ? 0 : num * 10) + (ch - '0');
      else if (num >= 0) { vals[nv++] = num; num = -1; }
    }
    if (num >= 0 && nv < R * n) vals[nv++] = num;
  }
  if (nv == R * n) {
    for (int r = 0; r < R; r++) for (int t = 0; t < n; t++) curT[r][t] = vals[r * n + t];
  } else {
    /* circle method: team n-1 fixed */
    for (int r = 0; r < R; r++) {
      curT[r][n - 1] = r; curT[r][r] = n - 1;
      for (int i = 1; i < n / 2; i++) {
        int a = (r + i) % R, b = (r - i + R) % R;
        curT[r][a] = b; curT[r][b] = a;
      }
    }
  }
  int ce = score(curT);
  if (ce < 0) { fprintf(stderr, "start is not a round robin\n"); return 2; }
  memcpy(bestT, curT, sizeof curT);
  int be = ce;
  printf("START value %d (E %d)\n", n * (n - 2) + 2 * be, be);
  fflush(stdout);
  clock_t c0 = clock();
  long moves = 0, since = 0, improv = 0, plateau = 0, kicks = 0;
  while ((double)(clock() - c0) / CLOCKS_PER_SEC < secs) {
    moves++; since++;
    if (rnd() & 1) reverse_tt(curT);
    int w = wmin + rnd() % (wmax - wmin + 1);
    int k = R - w;
    if (complete(curT, k, ce - 1, tmp)) {
      int e = score(tmp);
      if (e < 0 || e >= ce) { fprintf(stderr, "internal: bad completion (%d)\n", e); return 3; }
      memcpy(curT, tmp, sizeof tmp); ce = e; since = 0; improv++;
      if (ce < be) {
        be = ce; memcpy(bestT, curT, sizeof curT);
        printf("BEST value %d (E %d) after %ld moves, %.1f s\n", n * (n - 2) + 2 * be, be, moves,
               (double)(clock() - c0) / CLOCKS_PER_SEC);
        print_tt(bestT);
      }
      continue;
    }
    if (rnd() % 4 == 0 && complete(curT, k, ce, tmp)) {      /* plateau step */
      int e = score(tmp);
      if (e < 0 || e > ce) { fprintf(stderr, "internal: bad plateau (%d)\n", e); return 3; }
      memcpy(curT, tmp, sizeof tmp); ce = e; plateau++;
    }
    if (since >= 200) {                                    /* kick: swap two rounds */
      int tries = 0;
      do {
        memcpy(tmp, curT, sizeof tmp);
        int i = rnd() % R, j = rnd() % R;
        for (int t = 0; t < n; t++) { int x = tmp[i][t]; tmp[i][t] = tmp[j][t]; tmp[j][t] = x; }
      } while (score(tmp) > be + 8 && ++tries < 50);
      if (tries >= 50) memcpy(tmp, bestT, sizeof tmp);
      memcpy(curT, tmp, sizeof tmp); ce = score(curT); since = 0; kicks++;
    }
  }
  printf("END best value %d (E %d); %ld moves, %ld improving, %ld plateau, %ld kicks, %.0f s\n",
         n * (n - 2) + 2 * be, be, moves, improv, plateau, kicks, (double)(clock() - c0) / CLOCKS_PER_SEC);
  print_tt(bestT);
  return 0;
}
