/*
 * Exact least non-cyclic carry-over of a single round robin, by branch and bound.
 *
 * The question (README, "SAT bounds" and "An exact search"): at 10 teams eval/carryover-sat.py proved
 * no round robin goes to 88 or under, and the refill search's best is 94; is the least 90, 92 or 94?
 * CaDiCaL stopped with no answer after 69 min at 90. This program answers by depth-first search.
 *
 * Value. Team t meeting a in round r and b in round r + 1 adds one to cell (a, b). The cells always
 * sum to n(n - 2), so value = n(n - 2) + 2E with E = sum over cells of C(c, 2): a cell already
 * holding c costs c more of E when it gains one. `./carryover-bnb N EMAX` asks for value <= n(n - 2)
 * + 2 EMAX and prints the first round robin it finds, or says none exists.
 *
 * Search. Rounds are filled in order, and inside a round the lowest unplaced team takes a partner,
 * so every round robin is reached once for each labelling it has. A partial timetable whose E is
 * past EMAX is cut at once (E only grows). A round in which some unplaced team has no unused partner
 * left among the unplaced teams is cut too (forward check).
 *
 * Bound (2026-11-14, later). Inside one round every team is met exactly once, so each carry-over
 * column gains exactly one entry and the costs of a round's pairs add without interacting. The
 * least E that the teams still unplaced in a round can add is therefore an exact min-cost perfect
 * matching, and a branch is cut when E plus it passes EMAX (can_pair: depth-first with the remaining
 * budget, failures remembered per round start). It is checked at every node and when a round
 * starts. Set NOBOUND=1 to turn it off.
 *
 * Symmetry (relabelling the teams keeps the value, so one labelling of each timetable is enough).
 * Round 0 is (0 1) (2 3) ... (n-2 n-1): any first round can be relabelled to it. Rounds 0 and 1
 * together form disjoint even cycles of length >= 4 that alternate between them, and the relabellings
 * that keep round 0 (permute its pairs, swap inside a pair) take any round 1 to any other with the same
 * cycle lengths. So round 1 is placed once per partition of n / 2 pairs into cycles of k >= 2 pairs
 * (at 12 teams: 12, 8 + 4, 6 + 6, 4 + 4 + 4), not once per labelling (2026-11-14, later; the
 * first version fixed only team 0's and team 1's round-1 opponents, OLDSYM=1 runs it).
 * Reversing the rounds transposes the carry-over matrix and keeps the value; it is not used.
 *
 * Build: cc -O3 -march=native -o carryover-bnb eval/carryover-bnb.c
 * Run:   ./carryover-bnb 10 5        (value <= 90 at 10 teams)
 *        ./carryover-bnb 10 5 1 4    (the same, only the branches whose round-1 opponent of team 1
 *                                     is the 1st of 4 slices, for running in parallel; see below)
 * Exit 0: found (the timetable is printed as opp[r][t], the format of TIMETABLES in carryover.mjs);
 * exit 1: none exists (a proof, given the symmetry argument above); exit 2: bad arguments.
 *
 * Splitting: with PART and PARTS, the search keeps only the round-2 branches whose index (in the
 * order the search meets them, counted across the whole search) is PART mod PARTS. The union of
 * PARTS runs is the whole search, so all of them must say "none" for a proof.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define MAXN 16

static int n, R, emax, part = 0, parts = 1;
static int opp[MAXN][MAXN];   /* opp[r][t], -1 if unplaced */
static unsigned char used[MAXN][MAXN];
static int cell[MAXN][MAXN];
static int E;
static long long nodes = 0, branch2 = 0;
static int found = 0;
static int use_bound = 1;
/* best[r][mask]: least E any perfect matching of the teams in mask can add in round r, given rounds
 * 0..r-1 as placed now (filled when round r starts). Within one round every team is met once, so
 * each carry-over column gains exactly one entry and the pairs' costs add without interacting; the
 * DP is therefore exact for the rest of the round. */
static int failb[MAXN][1 << MAXN];      /* largest budget known to fail, valid when stamp matches */
static unsigned stamp[MAXN][1 << MAXN], cur[MAXN];

/* 1 if the teams in mask can be paired in round r (pairs not yet used) adding at most `budget` to E.
 * Exact (depth-first over the lowest team's partners); failures are remembered per round start. */
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

static void print_solution(void) {
  int c[MAXN][MAXN];
  memset(c, 0, sizeof c);
  for (int t = 0; t < n; t++)
    for (int r = 0; r + 1 < R; r++) c[opp[r][t]][opp[r + 1][t]]++;
  long v = 0;
  int mx = 0;
  for (int a = 0; a < n; a++)
    for (int b = 0; b < n; b++) { v += (long)c[a][b] * c[a][b]; if (c[a][b] > mx) mx = c[a][b]; }
  printf("FOUND value %ld (E %d), largest cell %d\n[", v, E, mx);
  for (int r = 0; r < R; r++) {
    printf("%s[", r ? ", " : "");
    for (int t = 0; t < n; t++) printf("%s%d", t ? ", " : "", opp[r][t]);
    printf("]");
  }
  printf("]\n");
  fflush(stdout);
}

/* Every unplaced team in round r still has an unused unplaced partner. */
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
  if (found) return;
  nodes++;
  int t = 0;
  while (t < n && opp[r][t] >= 0) t++;
  if (t == n) {
    if (r == 2 && (branch2++ % parts) != part) return;
    if (r + 1 == R) { found = 1; print_solution(); return; }
    if (!round_ok(r + 1)) return;
    if (use_bound) {
      cur[r + 1]++;
      if (!can_pair(r + 1, (1 << n) - 1, emax - E)) return;
    }
    dfs(r + 1);
    return;
  }
  int lo = t + 1, hi = n - 1;
  for (int u = lo; u <= hi; u++) {
    if (opp[r][u] >= 0 || used[t][u]) continue;
    if (r == 1 && t == 0 && u != 2) continue;
    if (r == 1 && t == 1 && u != 3 && u != 4) continue;
    int a = 0, b = 0, add = 0;
    if (r > 0) {
      a = opp[r - 1][t]; b = opp[r - 1][u];
      add = cell[a][u] + cell[b][t];
      if (E + add > emax) continue;
      cell[a][u]++; cell[b][t]++;
    }
    E += add;
    opp[r][t] = u; opp[r][u] = t; used[t][u] = used[u][t] = 1;
    if (round_ok(r) && (!use_bound || r == 0 || can_pair(r, unplaced_mask(r), emax - E))) dfs(r);
    opp[r][t] = -1; opp[r][u] = -1; used[t][u] = used[u][t] = 0;
    E -= add;
    if (r > 0) { cell[a][u]--; cell[b][t]--; }
    if (found) return;
  }
}

/* Place round 1 as the cycle type `parts_k` (k1 + k2 + ... = n / 2, each >= 2): the pairs of round 0
 * are taken k at a time and round 1 joins them into a cycle 2i, 2i+1, 2i+2, ..., 2i+2k-1, 2i. */
static void place_pair(int r, int t, int u) {
  int a = opp[r - 1][t], b = opp[r - 1][u];
  E += cell[a][u] + cell[b][t];
  cell[a][u]++; cell[b][t]++;
  opp[r][t] = u; opp[r][u] = t; used[t][u] = used[u][t] = 1;
}
static void unplace_pair(int r, int t, int u) {
  int a = opp[r - 1][t], b = opp[r - 1][u];
  cell[a][u]--; cell[b][t]--;
  E -= cell[a][u] + cell[b][t];
  opp[r][t] = opp[r][u] = -1; used[t][u] = used[u][t] = 0;
}
static int kparts[MAXN], nk;
static void try_round1(void) {
  int i = 0;
  for (int j = 0; j < nk; j++) {
    int k = kparts[j];
    for (int s = 0; s < k; s++) {
      int t = 2 * (i + s) + 1, u = s + 1 < k ? 2 * (i + s + 1) : 2 * i;
      place_pair(1, t < u ? t : u, t < u ? u : t);
    }
    i += k;
  }
  printf("round 1 cycle type");
  for (int j = 0; j < nk; j++) printf(" %d", 2 * kparts[j]);
  printf(": E %d\n", E);
  fflush(stdout);
  if (E <= emax && (!use_bound || (cur[2]++, can_pair(2, (1 << n) - 1, emax - E)))) dfs(2);
  i = 0;
  for (int j = 0; j < nk; j++) {
    int k = kparts[j];
    for (int s = 0; s < k; s++) {
      int t = 2 * (i + s) + 1, u = s + 1 < k ? 2 * (i + s + 1) : 2 * i;
      unplace_pair(1, t < u ? t : u, t < u ? u : t);
    }
    i += k;
  }
}
/* Every partition of `left` pairs into parts >= 2, parts non-increasing. */
static void each_type(int left, int maxk) {
  if (found) return;
  if (!left) { try_round1(); return; }
  for (int k = left < maxk ? left : maxk; k >= 2; k--) {
    kparts[nk++] = k;
    each_type(left - k, k);
    nk--;
  }
}

int main(int argc, char **argv) {
  if (argc < 3) { fprintf(stderr, "usage: %s N EMAX [PART PARTS]\n", argv[0]); return 2; }
  n = atoi(argv[1]); emax = atoi(argv[2]);
  if (argc >= 5) { part = atoi(argv[3]); parts = atoi(argv[4]); }
  if (n < 6 || n > MAXN || n % 2 || emax < 0 || parts < 1 || part < 0 || part >= parts) return 2;
  R = n - 1;
  if (getenv("NOBOUND")) use_bound = 0;
  memset(opp, -1, sizeof opp);
  for (int t = 0; t < n; t += 2) {
    opp[0][t] = t + 1; opp[0][t + 1] = t;
    used[t][t + 1] = used[t + 1][t] = 1;
  }
  clock_t c0 = clock();
  if (getenv("OLDSYM")) { cur[1]++; dfs(1); }
  else each_type(n / 2, n / 2);
  double s = (double)(clock() - c0) / CLOCKS_PER_SEC;
  if (!found)
    printf("NONE: no %d-team round robin has non-cyclic carry-over <= %d (E <= %d)%s; "
           "%lld nodes, %.1f s\n", n, n * (n - 2) + 2 * emax, emax,
           parts > 1 ? " in this part" : "", nodes, s);
  else
    printf("%lld nodes, %.1f s\n", nodes, s);
  return found ? 0 : 1;
}
