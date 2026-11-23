/* Lane pairs at the bound by tabu search, for the bowling seasons SAT left unanswered (2026-11-23).
 *
 *   node eval/bowling-rounds.mjs <teams> <weeks> > r.json
 *   cc -O2 -o /tmp/tabu eval/bowling-lane-tabu.c && /tmp/tabu r.json <seed> <seconds>
 *
 * Reads the round-robin weeks bowlingSchedule() plays (eval/bowling-rounds.mjs), and looks for a lane
 * pair for every match, a permutation of the P = teams/2 pairs each week, so that every team bowls on
 * every pair floor(W/P) or ceil(W/P) times: the bound bowling.mjs checks (offBound). State: one
 * permutation per week. Move: swap the pairs of two matches in one week (touches 4 teams x 2 pairs,
 * scored in O(1)). Cost: the total out-of-bounds count (as eval/bowling-lane-table.txt's "off") plus,
 * once that is 0, nothing: the page's own polish cuts back-to-back repeats afterwards. Tabu tenure on
 * (week, match, pair) with aspiration, random restarts of a few weeks on stagnation.
 * Prints one line: {"n":..,"W":..,"off":best,"code":"<pair digit of each match, week by week>"}.
 * Hand-rolled JSON reader: the file is exactly what bowling-rounds.mjs writes.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define MAXN 64
#define MAXW 128
static int n, W, P, lo, hi;
static int ta[MAXW][MAXN / 2], tb[MAXW][MAXN / 2]; /* match m of week w: teams ta, tb */
static int pr[MAXW][MAXN / 2];                     /* pair of match m in week w */
static int cnt[MAXN][MAXN / 2];                    /* games of team t on pair p */
static long long tabu[MAXW][MAXN / 2][MAXN / 2];   /* iteration until which (w,m)->p is tabu */
static int best[MAXW][MAXN / 2];

static unsigned long long rs = 88172645463325252ULL;
static unsigned long long rnd(void) { rs ^= rs << 13; rs ^= rs >> 7; rs ^= rs << 17; return rs; }

static inline int pen(int c) { return c < lo ? lo - c : c > hi ? c - hi : 0; }

static int total(void) {
  int s = 0;
  for (int t = 0; t < n; t++) for (int p = 0; p < P; p++) s += pen(cnt[t][p]);
  return s;
}

/* change in cost if team t moves one game from pair p to pair q */
static inline int dmove(int t, int p, int q, int adj[MAXN][MAXN / 2]) {
  (void)adj;
  return pen(cnt[t][p] - 1) - pen(cnt[t][p]) + pen(cnt[t][q] + 1) - pen(cnt[t][q]);
}

static void apply_swap(int w, int m1, int m2) {
  int p = pr[w][m1], q = pr[w][m2];
  cnt[ta[w][m1]][p]--; cnt[tb[w][m1]][p]--; cnt[ta[w][m1]][q]++; cnt[tb[w][m1]][q]++;
  cnt[ta[w][m2]][q]--; cnt[tb[w][m2]][q]--; cnt[ta[w][m2]][p]++; cnt[tb[w][m2]][p]++;
  pr[w][m1] = q; pr[w][m2] = p;
}

/* exact delta of swapping m1, m2 in week w: apply, measure the 8 touched cells, undo. */
static int delta(int w, int m1, int m2) {
  int p = pr[w][m1], q = pr[w][m2];
  int ts[4] = { ta[w][m1], tb[w][m1], ta[w][m2], tb[w][m2] };
  int before = 0, after = 0;
  for (int i = 0; i < 4; i++) before += pen(cnt[ts[i]][p]) + pen(cnt[ts[i]][q]);
  apply_swap(w, m1, m2);
  for (int i = 0; i < 4; i++) after += pen(cnt[ts[i]][p]) + pen(cnt[ts[i]][q]);
  apply_swap(w, m1, m2);
  return after - before;
}

static int readint(FILE *f, int *out) {
  int c;
  while ((c = fgetc(f)) != EOF && !(c >= '0' && c <= '9') && c != '-') {}
  if (c == EOF) return 0;
  int v = 0;
  while (c >= '0' && c <= '9') { v = v * 10 + (c - '0'); c = fgetc(f); }
  *out = v;
  return 1;
}

int main(int argc, char **argv) {
  if (argc < 4) { fprintf(stderr, "usage: tabu rounds.json seed seconds\n"); return 2; }
  FILE *f = fopen(argv[1], "r");
  if (!f) { perror(argv[1]); return 2; }
  /* {"n":N,"W":W,"rounds":[[[a,b],...],...]} : integers in order */
  readint(f, &n); readint(f, &W);
  P = n / 2;
  int haveStartFile = 0;
  static int startPr[MAXW][MAXN / 2];
  {
    /* eval/bowling-lane-start.mjs writes "off" before "rounds" and "start" after them. */
    long pos = ftell(f);
    static char all[1 << 20];
    size_t len = fread(all, 1, sizeof all - 1, f);
    all[len] = 0;
    fseek(f, pos, SEEK_SET);
    if (strstr(all, "\"start\"")) { int off; readint(f, &off); haveStartFile = 1; }
  }
  for (int w = 0; w < W; w++) for (int m = 0; m < P; m++) { readint(f, &ta[w][m]); readint(f, &tb[w][m]); }
  if (haveStartFile) for (int w = 0; w < W; w++) for (int m = 0; m < P; m++) readint(f, &startPr[w][m]);
  fclose(f);
  rs ^= (unsigned long long)atoll(argv[2]) * 0x9E3779B97F4A7C15ULL; for (int i = 0; i < 10; i++) rnd();
  double limit = atof(argv[3]);
  lo = W / P; hi = (W + P - 1) / P;
  /* start: the page's plan when the file carries one (eval/bowling-lane-start.mjs: "off", then
   * "start" after the rounds), else identity in week 0 (as the SAT model fixed it) and random weeks. */
  int startOff, haveStart = 0;
  (void)startOff;
  for (int w = 0; w < W; w++) {
    for (int m = 0; m < P; m++) pr[w][m] = m;
    if (w) for (int m = P - 1; m > 0; m--) { int j = rnd() % (m + 1); int t = pr[w][m]; pr[w][m] = pr[w][j]; pr[w][j] = t; }
  }
  if (haveStartFile) {
    haveStart = 1;
    for (int w = 0; w < W; w++) for (int m = 0; m < P; m++) pr[w][m] = startPr[w][m];
  }
  (void)haveStart;
  memset(cnt, 0, sizeof cnt);
  for (int w = 0; w < W; w++) for (int m = 0; m < P; m++) { cnt[ta[w][m]][pr[w][m]]++; cnt[tb[w][m]][pr[w][m]]++; }
  int cur = total(), bestc = cur;
  memcpy(best, pr, sizeof pr);
  clock_t t0 = clock();
  long long it = 0, lastImp = 0;
  while (bestc > 0) {
    if ((it & 1023) == 0 && (double)(clock() - t0) / CLOCKS_PER_SEC > limit) break;
    it++;
    /* best non-tabu swap among moves touching a team that is off the bound */
    int bd = 1 << 30, bw = -1, b1 = -1, b2 = -1, ties = 0;
    for (int w = 1; w < W; w++) {
      for (int m1 = 0; m1 < P; m1++) {
        int p = pr[w][m1];
        if (!pen(cnt[ta[w][m1]][p]) && !pen(cnt[tb[w][m1]][p])) continue; /* m1 must sit on a bad cell */
        for (int m2 = 0; m2 < P; m2++) {
          if (m2 == m1) continue;
          int d = delta(w, m1, m2);
          int q = pr[w][m2];
          int isTabu = tabu[w][m1][q] > it || tabu[w][m2][p] > it;
          if (isTabu && cur + d >= bestc) continue;
          if (d < bd) { bd = d; bw = w; b1 = m1; b2 = m2; ties = 1; }
          else if (d == bd && (rnd() % ++ties) == 0) { bw = w; b1 = m1; b2 = m2; }
        }
      }
    }
    if (bw < 0) { /* everything tabu: random swap */
      bw = 1 + rnd() % (W - 1); b1 = rnd() % P; b2 = (b1 + 1 + rnd() % (P - 1)) % P; bd = delta(bw, b1, b2);
    }
    int p = pr[bw][b1], q = pr[bw][b2];
    apply_swap(bw, b1, b2);
    cur += bd;
    int ten = 5 + (int)(rnd() % 10) + W / 4;
    tabu[bw][b1][p] = it + ten; tabu[bw][b2][q] = it + ten;
    if (cur < bestc) { bestc = cur; memcpy(best, pr, sizeof pr); lastImp = it; }
    if (it - lastImp > 20000) { /* stagnation: return to best, shake a few weeks */
      memcpy(pr, best, sizeof pr);
      int k = 1 + rnd() % 3;
      for (int r = 0; r < k; r++) {
        int w = 1 + rnd() % (W - 1);
        for (int m = P - 1; m > 0; m--) { int j = rnd() % (m + 1); int t = pr[w][m]; pr[w][m] = pr[w][j]; pr[w][j] = t; }
      }
      memset(cnt, 0, sizeof cnt);
      for (int w = 0; w < W; w++) for (int m = 0; m < P; m++) { cnt[ta[w][m]][pr[w][m]]++; cnt[tb[w][m]][pr[w][m]]++; }
      cur = total(); lastImp = it;
    }
  }
  static const char *DIG = "0123456789abcdefghijklmnopqrstuvwxyz";
  printf("{\"n\":%d,\"W\":%d,\"off\":%d,\"iters\":%lld,\"seconds\":%.1f,\"code\":\"", n, W, bestc, it, (double)(clock() - t0) / CLOCKS_PER_SEC);
  for (int w = 0; w < W; w++) for (int m = 0; m < P; m++) putchar(DIG[best[w][m]]);
  printf("\"}\n");
  return 0;
}
