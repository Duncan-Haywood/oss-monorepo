// Whist base rounds in two stages: a starter, then a table matching.
//
//   cc -O2 -o /tmp/whist-starter eval/whist-starter.c
//   /tmp/whist-starter <n> [seed] [seconds] [nodeLimit]   # one JSON line, eval/whist-anneal.txt format
//
// n = 4k+1 works on Z_n (point 0 sits out the base round); n = 4k on Z_{n-1} + infinity (-1).
// A whist base round is a set of partner pairs plus a pairing of those pairs into tables. Its
// partner differences must cover each class {d, -d} exactly once (a "starter"), and the four cross
// (opponent) differences of every table must cover each class exactly twice. Earlier searches
// (eval/whist-search.c, eval/whist-anneal.c, eval/whist-orbits.c) moved single players and found
// nothing at 52 or 57. Here stage 1 draws a random starter (easy), and stage 2 solves the matching
// of its pairs into tables exactly, by backtracking on the opponent class with the fewest
// candidate tables left. A counting estimate puts the expected number of matchings per starter
// near 1 at these sizes (README "Whist designs for 52 and 57 by starter and matching"), so the
// program keeps drawing starters until one matches.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static int n, v, inf, K;          // players, group order, has infinity, partner classes
static int near, H, outPt;       // near-whist (n = 4k+2): half distance H = 2k+1, second point out
static int npairs;                // partner pairs in the base round
static int pa[64], pb[64];        // pair endpoints (-1 = infinity)
static unsigned long long rng = 88172645463325252ULL;
static unsigned long long rnd(void) { rng ^= rng << 13; rng ^= rng >> 7; rng ^= rng << 17; return rng; }
static int cls(int a, int b) { int d = ((a - b) % v + v) % v; return d <= v / 2 ? d : v - d; }

// ---- stage 1: random starter ----
static int partnerOf[128];
static int usedC[64];
static long long s1steps;
static int starterRec(void) {
  if (++s1steps > 200000) return 0;
  int a = -1;
  for (int x = (inf ? 0 : 1); x < v; x++) if (partnerOf[x] == -2) { a = x; break; }
  if (a < 0) return 1;
  int order[64], m = 0;
  for (int d = 1; d <= K; d++) if (!usedC[d]) order[m++] = d;
  for (int i = m - 1; i > 0; i--) { int j = rnd() % (i + 1); int t = order[i]; order[i] = order[j]; order[j] = t; }
  for (int i = 0; i < m; i++) {
    int d = order[i];
    int cand[2] = {(a + d) % v, (a - d + v) % v};
    if (rnd() & 1) { int t = cand[0]; cand[0] = cand[1]; cand[1] = t; }
    for (int c = 0; c < 2; c++) {
      int b = cand[c];
      if (b == a || partnerOf[b] != -2) continue;
      if (!inf && b == 0) continue;
      if (near && b == outPt) continue;
      partnerOf[a] = b; partnerOf[b] = a; usedC[d] = 1;
      if (starterRec()) return 1;
      partnerOf[a] = -2; partnerOf[b] = -2; usedC[d] = 0;
    }
  }
  return 0;
}
static int drawStarter(void) {
  for (int tries = 0; tries < 1000; tries++) {
    for (int x = 0; x < v; x++) partnerOf[x] = -2;
    memset(usedC, 0, sizeof usedC);
    s1steps = 0;
    if (inf) { int x = rnd() % v; partnerOf[x] = -1; }  // x partners infinity
    if (near) {  // the second point out: odd distance from 0 exactly when k is even (README)
      int k = (n - 2) / 4;
      do outPt = 1 + rnd() % (v - 1); while ((outPt % 2 == 1) != (k % 2 == 0));
      partnerOf[outPt] = -3;
    }
    if (starterRec()) {
      npairs = 0;
      if (inf) for (int x = 0; x < v; x++) if (partnerOf[x] == -1) { pa[npairs] = -1; pb[npairs] = x; npairs++; }
      for (int x = 0; x < v; x++) if (partnerOf[x] > x) { pa[npairs] = x; pb[npairs] = partnerOf[x]; npairs++; }
      return 1;
    }
  }
  return 0;
}

// ---- stage 2: exact matching of pairs into tables ----
static int ne;
static int eu[2048], ev[2048], ec[2048][4], ecn[2048];  // edge = table of pairs u,v; its classes
static int need[64];       // remaining opponent count per class (starts at 2)
static int matched[64];
static int chosen[64], nch;
static long long nodes, nodeLimit;
static int byClass[64][2048], byClassN[64];

static int edgeOk(int e) {
  if (matched[eu[e]] || matched[ev[e]]) return 0;
  int tmp[64]; int k = ecn[e];
  for (int i = 0; i < k; i++) tmp[ec[e][i]] = 0;
  for (int i = 0; i < k; i++) if (++tmp[ec[e][i]] > need[ec[e][i]]) return 0;
  return 1;
}
static void apply(int e, int s) {
  matched[eu[e]] = matched[ev[e]] = (s > 0);
  for (int i = 0; i < ecn[e]; i++) need[ec[e][i]] -= s;
}
extern int edgeId[64][64];
static int solveNear(void) {
  int bp = -1, bn = 1 << 30;
  for (int p = 0; p < npairs; p++) {
    if (matched[p]) continue;
    int cnt = 0;
    for (int q = 0; q < npairs; q++) if (q != p && !matched[q] && edgeId[p][q] >= 0 && edgeOk(edgeId[p][q])) cnt++;
    if (cnt == 0) return 0;
    if (cnt < bn) { bn = cnt; bp = p; }
  }
  if (bp < 0) return need[H] == 0;
  int list[64], m = 0;
  for (int q = 0; q < npairs; q++) if (q != bp && !matched[q] && edgeId[bp][q] >= 0 && edgeOk(edgeId[bp][q])) list[m++] = edgeId[bp][q];
  for (int i = 0; i < m; i++) {
    int e = list[i];
    if (++nodes > nodeLimit) return 0;
    apply(e, 1); chosen[nch++] = e;
    if (solveNear()) return 1;
    nch--; apply(e, -1);
  }
  return 0;
}
static int solve(void) {
  if (++nodes > nodeLimit) return 0;
  // the class with unmet need and the fewest feasible tables
  int best = -1, bestN = 1 << 30;
  if (near) return solveNear();
  for (int c = 1; c <= K; c++) {
    if (!need[c]) continue;
    int cnt = 0;
    for (int i = 0; i < byClassN[c]; i++) if (edgeOk(byClass[c][i])) cnt++;
    if (cnt == 0) return 0;
    if (cnt < bestN) { bestN = cnt; best = c; }
  }
  if (best < 0) {
    for (int p = 0; p < npairs; p++) if (!matched[p]) return 0;
    return 1;
  }
  // every unmatched pair must still have a table
  for (int p = 0; p < npairs; p++) {
    if (matched[p]) continue;
    int ok = 0;
    for (int q = 0; q < npairs && !ok; q++) if (q != p && !matched[q]) {
      // find edge (p,q): edges are indexed densely, look it up
      extern int edgeId[64][64];
      int e = edgeId[p][q];
      if (e >= 0 && edgeOk(e)) ok = 1;
    }
    if (!ok) return 0;
  }
  int c = best;
  for (int i = 0; i < byClassN[c]; i++) {
    int e = byClass[c][i];
    if (!edgeOk(e)) continue;
    apply(e, 1); chosen[nch++] = e;
    if (solve()) return 1;
    nch--; apply(e, -1);
  }
  return 0;
}
int edgeId[64][64];

static void buildEdges(void) {
  ne = 0;
  for (int c = 0; c <= K; c++) byClassN[c] = 0;
  for (int i = 0; i < npairs; i++) for (int j = 0; j < npairs; j++) edgeId[i][j] = -1;
  for (int i = 0; i < npairs; i++) for (int j = i + 1; j < npairs; j++) {
    int A[2] = {pa[i], pb[i]}, B[2] = {pa[j], pb[j]};
    int k = 0;
    for (int x = 0; x < 2; x++) for (int y = 0; y < 2; y++) {
      if (A[x] < 0 || B[y] < 0) continue;  // infinity's opponents come for free
      ec[ne][k++] = cls(A[x], B[y]);
    }
    ecn[ne] = k; eu[ne] = i; ev[ne] = j;
    // an edge that alone puts a class over 2 is useless
    int cnt[64] = {0}, bad = 0;
    for (int t = 0; t < k; t++) if (++cnt[ec[ne][t]] > (near && ec[ne][t] == H ? 1 : 2)) bad = 1;
    if (bad) continue;
    edgeId[i][j] = edgeId[j][i] = ne;
    int seen[64] = {0};
    for (int t = 0; t < k; t++) { int c = ec[ne][t]; if (!seen[c]) { seen[c] = 1; byClass[c][byClassN[c]++] = ne; } }
    ne++;
  }
  // shuffle each class's list so different starters explore differently
  for (int c = 1; c <= K; c++) for (int i = byClassN[c] - 1; i > 0; i--) {
    int j = rnd() % (i + 1); int t = byClass[c][i]; byClass[c][i] = byClass[c][j]; byClass[c][j] = t;
  }
}

int main(int argc, char **argv) {
  if (argc < 2) { fprintf(stderr, "usage: whist-starter n [seed] [seconds] [nodeLimit]\n"); return 2; }
  n = atoi(argv[1]);
  int seed = argc > 2 ? atoi(argv[2]) : 1;
  double secs = argc > 3 ? atof(argv[3]) : 60;
  nodeLimit = argc > 4 ? atoll(argv[4]) : 2000000;
  if (n % 4 == 1) { v = n; inf = 0; } else if (n % 4 == 0) { v = n - 1; inf = 1; } else { v = n; inf = 0; near = 1; }
  K = near ? (n - 2) / 2 : (v - 1) / 2;
  H = near ? n / 2 : 0;
  rng ^= (unsigned long long)seed * 0x9E3779B97F4A7C15ULL; for (int i = 0; i < 20; i++) rnd();
  clock_t t0 = clock();
  long long starters = 0, totalNodes = 0;
  int found = 0;
  while ((double)(clock() - t0) / CLOCKS_PER_SEC < secs) {
    if (!drawStarter()) continue;
    starters++;
    buildEdges();
    for (int c = 1; c <= K; c++) need[c] = 2;
    if (near) need[H] = 1;
    memset(matched, 0, sizeof matched);
    nch = 0; nodes = 0;
    if (solve()) { found = 1; totalNodes += nodes; break; }
    totalNodes += nodes;
  }
  double ms = 1000.0 * (clock() - t0) / CLOCKS_PER_SEC;
  printf("{\"n\":%d,\"mods\":[%d],\"kind\":\"%s\",\"ms\":%.0f,\"method\":\"starter+matching (C)\",\"seed\":%d,\"starters\":%lld,\"nodes\":%lld,\"tables\":", n, v, near ? "near" : "whist", ms, seed, starters, totalNodes);
  if (!found) { printf("null}\n"); return 1; }
  printf("[");
  for (int i = 0; i < nch; i++) {
    int e = chosen[i];
    printf("%s[%d,%d,%d,%d]", i ? "," : "", pa[eu[e]], pb[eu[e]], pa[ev[e]], pb[ev[e]]);
  }
  printf("]}\n");
  return 0;
}
