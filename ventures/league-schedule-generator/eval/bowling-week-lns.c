/* Lane pairs re-dealt a whole week at a time: each move frees one week and puts its matches back on
 * the pairs by an exact assignment (Hungarian method) against the other weeks' counts.
 *
 *   node eval/bowling-rounds.mjs <teams> <weeks> | node -e '...' > rounds.txt   (see bowling-week-lns.sh)
 *   gcc -O2 -o /tmp/lns eval/bowling-week-lns.c && /tmp/lns rounds.txt <seed> <seconds> [kick] [start.txt]
 *
 * rounds.txt: first line "n W", then W lines of n team numbers (match m = teams 2m, 2m+1, roundRobin order).
 * Model as eval/bowling-lane-table.py: every team on every pair lo = floor(W/P) .. hi = ceil(W/P) times.
 * off = sum over (team, pair) of the visits above hi plus the visits short of lo, the figure the
 * lane tables store. Because a team plays exactly one match a week, a week's contribution to off is a
 * sum over (match, pair) cells, so re-dealing one week optimally is a 13 x 13 assignment problem.
 * Ties are broken at random (cost * 2^20 + noise), so the walk crosses plateaus; after `kick` moves with
 * no new best, two matches of a random week swap pairs whatever it costs.
 * start.txt (optional): W lines of P pairs, a plan to start from (bowling-lane-near.mjs's entry, say);
 * otherwise week 1 is match m on pair m and later weeks are shuffled.
 * Prints one JSON line {"n","W","off","plan"} (plan[w][m] = pair) each time the best improves; stops at 0.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define MAXT 64
#define MAXP 32
#define MAXW 64
static int n, W, P, lo, hi;
static int team[MAXW][MAXP][2];
static int plan[MAXW][MAXP], best[MAXW][MAXP];
static int cnt[MAXT][MAXP];
static unsigned long long rs = 88172645463325252ULL;
static unsigned rnd(void) { rs ^= rs << 13; rs ^= rs >> 7; rs ^= rs << 17; return (unsigned)(rs >> 11); }

static int pen(int c) { return c > hi ? c - hi : (c < lo ? lo - c : 0); }
static int total(void) { int s = 0; for (int t = 0; t < n; t++) for (int p = 0; p < P; p++) s += pen(cnt[t][p]); return s; }
static void put(int w, int m, int p, int d) { cnt[team[w][m][0]][p] += d; cnt[team[w][m][1]][p] += d; }

/* Hungarian method, minimisation, square N x N, 1-indexed internals (e-maxx form). */
static void hungarian(long long a[MAXP][MAXP], int N, int *assign) {
    static long long u[MAXP + 1], v[MAXP + 1], minv[MAXP + 1];
    static int pp[MAXP + 1], way[MAXP + 1], used[MAXP + 1];
    for (int i = 0; i <= N; i++) u[i] = v[i] = 0, pp[i] = way[i] = 0;
    for (int i = 1; i <= N; i++) {
        pp[0] = i; int j0 = 0;
        for (int j = 0; j <= N; j++) minv[j] = (long long)4e18, used[j] = 0;
        do {
            used[j0] = 1; int i0 = pp[j0], j1 = 0; long long delta = (long long)4e18;
            for (int j = 1; j <= N; j++) if (!used[j]) {
                long long cur = a[i0 - 1][j - 1] - u[i0] - v[j];
                if (cur < minv[j]) minv[j] = cur, way[j] = j0;
                if (minv[j] < delta) delta = minv[j], j1 = j;
            }
            for (int j = 0; j <= N; j++) if (used[j]) u[pp[j]] += delta, v[j] -= delta; else minv[j] -= delta;
            j0 = j1;
        } while (pp[j0] != 0);
        do { int j1 = way[j0]; pp[j0] = pp[j1]; j0 = j1; } while (j0);
    }
    for (int j = 1; j <= N; j++) assign[pp[j] - 1] = j - 1;
}

static void redeal(int w) {
    static long long a[MAXP][MAXP]; int as[MAXP];
    for (int m = 0; m < P; m++) put(w, m, plan[w][m], -1);
    for (int m = 0; m < P; m++) for (int p = 0; p < P; p++) {
        long long c = 0;
        for (int k = 0; k < 2; k++) { int t = team[w][m][k]; c += pen(cnt[t][p] + 1) - pen(cnt[t][p]); }
        a[m][p] = (c << 20) + (rnd() & 0xFFFF);
    }
    hungarian(a, P, as);
    for (int m = 0; m < P; m++) { plan[w][m] = as[m]; put(w, m, as[m], +1); }
}

static void emit(int off) {
    printf("{\"n\":%d,\"W\":%d,\"off\":%d,\"plan\":[", n, W, off);
    for (int w = 0; w < W; w++) { printf(w ? ",[" : "["); for (int m = 0; m < P; m++) printf(m ? ",%d" : "%d", best[w][m]); printf("]"); }
    printf("]}\n"); fflush(stdout);
}

int main(int argc, char **argv) {
    if (argc < 4) { fprintf(stderr, "usage: lns rounds.txt seed seconds [kick]\n"); return 2; }
    FILE *f = fopen(argv[1], "r"); if (!f) return 2;
    if (fscanf(f, "%d %d", &n, &W) != 2) return 2;
    P = n / 2; lo = W / P; hi = (W + P - 1) / P;
    for (int w = 0; w < W; w++) for (int m = 0; m < P; m++) if (fscanf(f, "%d %d", &team[w][m][0], &team[w][m][1]) != 2) return 2;
    fclose(f);
    rs ^= (unsigned long long)atoll(argv[2]) * 0x9E3779B97F4A7C15ULL; for (int i = 0; i < 20; i++) rnd();
    double secs = atof(argv[3]); long kick = argc > 4 ? atol(argv[4]) : 2000;
    for (int w = 0; w < W; w++) {
        for (int m = 0; m < P; m++) plan[w][m] = m;
        for (int m = P - 1; m > 0 && w > 0; m--) { int j = rnd() % (m + 1), t = plan[w][m]; plan[w][m] = plan[w][j]; plan[w][j] = t; }
    }
    if (argc > 5) {
        FILE *g = fopen(argv[5], "r"); if (!g) return 2;
        for (int w = 0; w < W; w++) for (int m = 0; m < P; m++) if (fscanf(g, "%d", &plan[w][m]) != 1) return 2;
        fclose(g);
    }
    for (int w = 0; w < W; w++) for (int m = 0; m < P; m++) put(w, m, plan[w][m], +1);
    int cur = total(), bestOff = cur; memcpy(best, plan, sizeof plan); emit(bestOff);
    clock_t end = clock() + (clock_t)(secs * CLOCKS_PER_SEC); long since = 0, it = 0;
    while (bestOff > 0) {
        if ((++it & 1023) == 0 && clock() > end) break;
        int w = 1 + rnd() % (W - 1); /* week 1 stays fixed: pair names */
        redeal(w); cur = total();
        if (cur < bestOff) { bestOff = cur; memcpy(best, plan, sizeof plan); emit(bestOff); since = 0; }
        else if (++since > kick) {
            int k = 1 + rnd() % (W - 1), a = rnd() % P, b = rnd() % P;
            if (a != b) {
                put(k, a, plan[k][a], -1); put(k, b, plan[k][b], -1);
                int t = plan[k][a]; plan[k][a] = plan[k][b]; plan[k][b] = t;
                put(k, a, plan[k][a], +1); put(k, b, plan[k][b], +1);
            }
            since = kick / 2;
        }
    }
    fprintf(stderr, "moves %ld best %d\n", it, bestOff);
    return 0;
}
