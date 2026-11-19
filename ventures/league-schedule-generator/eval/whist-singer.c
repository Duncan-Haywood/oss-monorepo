/* Exact cover for the Singer whist construction (README, "57 players: a whist design from the projective plane of order 7").

   cc -O2 -o /tmp/ws eval/whist-singer.c && /tmp/ws <seed> <attempts> <nodes per attempt>

   57 players: the lines of the projective plane of order 7 are D + s, D a Singer difference set in
   Z57. The 14 tables of Wh(8) (stored base on Z7 + infinity, developed) are seated on D by a random
   bijection; then each table i gets a shift t_i so the 14 shifted tables partition Z57 minus {0}
   (dancing links, column with fewest rows first, rows shuffled). Developed over Z57, that base round
   is a whist design: every pair lies on one line, where the Wh(8) seats it as partners once and as
   opponents twice. Prints the base round as JSON on success. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define V 57
#define K 8
#define NT 14
#define NCOL (NT + V - 1)
#define MAXR (NT * V)
#define MAXN (MAXR * 5 + NCOL + 1)

static const int D[K] = {0, 1, 3, 13, 32, 36, 43, 52};
static const int WH8[NT][4] = {
  {1,0,5,2},{6,4,3,7},{2,1,6,3},{0,5,4,7},{3,2,0,4},{1,6,5,7},{4,3,1,5},
  {2,0,6,7},{5,4,2,6},{3,1,0,7},{6,5,3,0},{4,2,1,7},{0,6,4,1},{5,3,2,7}};

static int L[MAXN], R[MAXN], U[MAXN], Dn[MAXN], C[MAXN], RowOf[MAXN], S[NCOL + 1];
static int rowTab[MAXR], rowShift[MAXR], nrows, nn;
static int sol[NT], depth;
static long long nodes, budget;
static unsigned long long rng = 88172645463325252ULL;
static unsigned long long xr(void) { rng ^= rng << 13; rng ^= rng >> 7; rng ^= rng << 17; return rng; }

static void cover(int c) {
  L[R[c]] = L[c]; R[L[c]] = R[c];
  for (int i = Dn[c]; i != c; i = Dn[i])
    for (int j = R[i]; j != i; j = R[j]) { U[Dn[j]] = U[j]; Dn[U[j]] = Dn[j]; S[C[j]]--; }
}
static void uncover(int c) {
  for (int i = U[c]; i != c; i = U[i])
    for (int j = L[i]; j != i; j = L[j]) { S[C[j]]++; U[Dn[j]] = j; Dn[U[j]] = j; }
  L[R[c]] = c; R[L[c]] = c;
}
static int search(void) {
  if (R[0] == 0) return 1;
  if (++nodes > budget) return 0;
  int c = R[0], best = S[c];
  for (int j = R[c]; j != 0; j = R[j]) if (S[j] < best) { best = S[j]; c = j; }
  if (best == 0) return 0;
  int cand[MAXR], m = 0;
  for (int i = Dn[c]; i != c; i = Dn[i]) cand[m++] = i;
  for (int a = m - 1; a > 0; a--) { int b = xr() % (a + 1), t = cand[a]; cand[a] = cand[b]; cand[b] = t; }
  cover(c);
  for (int k = 0; k < m; k++) {
    int r = cand[k];
    sol[depth++] = RowOf[r];
    for (int j = R[r]; j != r; j = R[j]) cover(C[j]);
    if (search()) return 1;
    for (int j = L[r]; j != r; j = L[j]) uncover(C[j]);
    depth--;
    if (nodes > budget) break;
  }
  uncover(c);
  return 0;
}

int main(int argc, char **argv) {
  unsigned long long seed = argc > 1 ? strtoull(argv[1], 0, 10) : 1;
  long attempts = argc > 2 ? atol(argv[2]) : 1000;
  budget = argc > 3 ? atoll(argv[3]) : 1000000;
  rng ^= seed * 0x9E3779B97F4A7C15ULL; for (int i = 0; i < 10; i++) xr();
  long long total = 0;
  for (long at = 1; at <= attempts; at++) {
    int lab[K]; memcpy(lab, D, sizeof lab);
    for (int a = K - 1; a > 0; a--) { int b = xr() % (a + 1), t = lab[a]; lab[a] = lab[b]; lab[b] = t; }
    int tab[NT][4];
    for (int i = 0; i < NT; i++) for (int j = 0; j < 4; j++) tab[i][j] = lab[WH8[i][j]];
    /* columns 1..NT tables, NT+1..NT+56 points 1..56 */
    for (int c = 0; c <= NCOL; c++) { L[c] = c ? c - 1 : NCOL; R[c] = c == NCOL ? 0 : c + 1; U[c] = Dn[c] = c; C[c] = c; S[c] = 0; }
    nn = NCOL + 1; nrows = 0;
    for (int i = 0; i < NT; i++) for (int s = 0; s < V; s++) {
      int cols[5], ok = 1; cols[0] = i + 1;
      for (int j = 0; j < 4; j++) { int p = (tab[i][j] + s) % V; if (!p) { ok = 0; break; } cols[j + 1] = NT + p; }
      if (!ok) continue;
      int first = nn;
      for (int j = 0; j < 5; j++) {
        int c = cols[j], x = nn++;
        C[x] = c; RowOf[x] = nrows; S[c]++;
        U[x] = U[c]; Dn[x] = c; Dn[U[c]] = x; U[c] = x;
        L[x] = j ? x - 1 : x; R[x] = x;
        if (j) { R[x - 1] = x; L[first] = x; R[x] = first; }
      }
      rowTab[nrows] = i; rowShift[nrows] = s; nrows++;
    }
    nodes = 0; depth = 0;
    int found = search();
    total += nodes;
    if (found) {
      printf("{\"n\": 57, \"mods\": [57], \"seed\": %llu, \"attempt\": %ld, \"nodes\": %lld, \"tables\": [", seed, at, total);
      for (int k = 0; k < NT; k++) {
        int r = sol[k], i = rowTab[r], s = rowShift[r];
        printf("%s[%d,%d,%d,%d]", k ? "," : "", (tab[i][0] + s) % V, (tab[i][1] + s) % V, (tab[i][2] + s) % V, (tab[i][3] + s) % V);
      }
      printf("]}\n");
      return 0;
    }
  }
  printf("{\"n\": 57, \"found\": false, \"seed\": %llu, \"attempts\": %ld, \"nodes\": %lld}\n", seed, attempts, total);
  return 1;
}
