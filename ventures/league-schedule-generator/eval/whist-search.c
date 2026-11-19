/* eval/whist-search.mjs's randomised backtracking in C, for the sizes no multiplier reaches
 * (48, 52, 56, 57, 60; eval/whist-multiplier.mjs explains why). Points Z_v (0 sits out) for
 * n = 4k+1, Z_v + infinity (-1) for n = 4k. A table [a,b,x,y] is a&b vs x&y; partner differences
 * once, opponent differences twice. Prints one JSON line like eval/whist-search.txt when found.
 *   cc -O2 -o whist-search eval/whist-search.c && ./whist-search 48 600 1   (n, seconds, seed) */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#define INF (-1)
static int n, v, k, npts, pts[80], order[80], slots[80], used[81], pc[80], oc[80];
static long nodes, budget;
static unsigned long long rs;
static unsigned rnd(void) { rs ^= rs << 13; rs ^= rs >> 7; rs ^= rs << 17; return (unsigned)rs; }
static int d(int a, int b) { return ((a - b) % v + v) % v; }
static int U(int p) { return p == INF ? v : p; }
static int addP(int a, int b, int s) { if (a == INF || b == INF) return 1; int x = d(a, b), y = d(b, a); pc[x] += s; pc[y] += s; return pc[x] <= 1 && pc[y] <= 1; }
static int addO(int a, int b, int s) { if (a == INF || b == INF) return 1; int x = d(a, b), y = d(b, a); oc[x] += s; oc[y] += s; return oc[x] <= 2 && oc[y] <= 2; }
static int pos_of[81];
static int place(int pos) {
  if (pos == 4 * k) return 1;
  if (++nodes > budget) return 0;
  int ti = pos / 4 * 4, r = pos % 4;
  for (int oi = 0; oi < npts; oi++) {
    int p = order[oi];
    if (used[U(p)]) continue;
    if (r == 0) { /* first unused in order */
      int first = -2; for (int q = 0; q < npts; q++) if (!used[U(order[q])]) { first = order[q]; break; }
      if (p != first) continue;
    }
    if (r == 1 && oi < pos_of[U(slots[ti])]) continue;
    if (r == 3 && oi < pos_of[U(slots[ti + 2])]) continue;
    int ok = 1, nd = 0, kinds[3], as[3];
    int ops_k[3], ops_a[3], nops = 0;
    if (r == 1) { ops_k[nops] = 0; ops_a[nops++] = slots[ti]; }
    if (r == 2) { ops_k[nops] = 1; ops_a[nops++] = slots[ti]; ops_k[nops] = 1; ops_a[nops++] = slots[ti + 1]; }
    if (r == 3) { ops_k[nops] = 0; ops_a[nops++] = slots[ti + 2]; ops_k[nops] = 1; ops_a[nops++] = slots[ti]; ops_k[nops] = 1; ops_a[nops++] = slots[ti + 1]; }
    for (int i = 0; i < nops; i++) {
      int res = ops_k[i] == 0 ? addP(ops_a[i], p, 1) : addO(ops_a[i], p, 1);
      kinds[nd] = ops_k[i]; as[nd++] = ops_a[i];
      if (!res) { ok = 0; break; }
    }
    if (ok) { used[U(p)] = 1; slots[pos] = p; if (place(pos + 1)) return 1; used[U(p)] = 0; }
    for (int i = 0; i < nd; i++) kinds[i] == 0 ? addP(as[i], p, -1) : addO(as[i], p, -1);
    if (nodes > budget) return 0;
  }
  return 0;
}
int main(int argc, char **argv) {
  n = atoi(argv[1]); double secs = argc > 2 ? atof(argv[2]) : 60; rs = argc > 3 ? strtoull(argv[3], 0, 10) * 2654435761ULL + 1 : 1;
  int fourK1 = n % 4 == 1; v = fourK1 ? n : n - 1; k = n / 4; budget = argc > 4 ? atol(argv[4]) : 2000000;
  npts = 0; if (fourK1) for (int i = 1; i < v; i++) pts[npts++] = i; else { pts[npts++] = INF; for (int i = 0; i < v; i++) pts[npts++] = i; }
  clock_t t0 = clock(); long tries = 0;
  while ((double)(clock() - t0) / CLOCKS_PER_SEC < secs) {
    tries++;
    memcpy(order, pts, sizeof(int) * npts);
    for (int i = npts - 1; i > 0; i--) { int j = rnd() % (i + 1), t = order[i]; order[i] = order[j]; order[j] = t; }
    for (int i = 0; i < npts; i++) pos_of[U(order[i])] = i;
    memset(used, 0, sizeof used); memset(pc, 0, sizeof pc); memset(oc, 0, sizeof oc); nodes = 0;
    if (place(0)) {
      printf("{\"n\":%d,\"mods\":[%d],\"ms\":%ld,\"method\":\"search (C)\",\"tries\":%ld,\"tables\":[", n, v, (long)((clock() - t0) * 1000 / CLOCKS_PER_SEC), tries);
      for (int t = 0; t < k; t++) printf("%s[%d,%d,%d,%d]", t ? "," : "", slots[4 * t], slots[4 * t + 1], slots[4 * t + 2], slots[4 * t + 3]);
      printf("]}\n"); return 0;
    }
  }
  printf("{\"n\":%d,\"mods\":[%d],\"ms\":%ld,\"method\":\"search (C)\",\"tries\":%ld,\"tables\":null}\n", n, v, (long)(secs * 1000), tries);
  return 1;
}
