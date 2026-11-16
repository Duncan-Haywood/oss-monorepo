"""Optional C path for the directional Bayer demosaic (``shootflow.bayer_demosaic``).

The numpy code in ``bayer_demosaic._piece`` is the reference. It makes about seventy whole-band
temporaries per band (shifted copies, masks, ``np.where`` blends), so on a 24 MP frame it spends most
of its 1.8 s moving memory. This module carries the same steps as one C function over a band, in the
same float32 arithmetic and the same order of operations, compiled with the system C compiler the
first time it is asked for and loaded through ``ctypes`` (the build and cache rules of
``shootflow.ljpeg_native``: ``$CC`` or ``cc``, ``$SHOOTFLOW_CACHE``, ``SHOOTFLOW_NATIVE=0`` turns it
off). With no compiler or a failed build ``piece()`` returns ``None`` and the numpy path runs.

What it covers: the default settings and ``rb="simple"``, any ``window``, ``power`` and ``laplace``, and
``laplace="learned"`` (the eight features and the fitted weight per sensel, 2026-11-16,
``eval/bayer-learned-native-2026-11-16.md``; fused into one row pipeline over 8-row rings and vectorized
the same day, ``eval/bayer-learned-fused-2026-11-16.md``). The optional
median clean-up (``median_passes > 0``) stays numpy-only. The two paths agree to float32 rounding,
not bit for bit (the C compiler may contract ``a * b + c``; ``-ffp-contract=off`` is passed to keep
that rare): ``tests/test_bayer_native.py`` holds them within 1e-5 of full scale on edges, gratings,
noise and every Bayer phase, and ``eval/bayer-native-2026-11-15.md`` measures the difference on real
frames. Each band reads only its own rows, as in numpy, so the band height and thread count change
nothing.
"""

from __future__ import annotations

import ctypes
import hashlib
import os
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

C_SOURCE = r"""
#include <stdint.h>
#include <stdlib.h>
#include <math.h>

/* c: the padded band, R rows x W columns, float32, white-balanced sensels.
   col: the CFA colour of each sensel (0 R, 1 G, 2 B), R x W.
   Writes rows oy0 .. oy0+orows-1, columns ox0 .. ox0+ow-1 of the band to out (row stride ostride floats,
   3 floats per sensel). Every read outside the band repeats the edge sensel, as numpy's _sh does.
   Returns 0, or -1 when memory runs out. Runs without the GIL (ctypes). */

/* Clamped reads through two lookup tables (no branches): CX[x] is x held to 0..W-1 and CY[y] is y held to
   0..R-1 times W, for x and y up to M past either edge. Set once per band by shootflow_bayer_piece. */
#define M 16
static __thread const long *CX, *CY;
#define AT(p, y, x) (p)[CY[y] + CX[x]]

/* Column bounds of the interior of a stencil reaching d sensels each way: x in [lo, hi) reads no column
   outside the band, so it indexes directly (the compiler vectorizes those loops); the few columns either
   side go through CX. */
#define INNER(d, lo, hi) long lo = (d) < W ? (d) : W, hi = W - (d) > lo ? W - (d) : lo

/* The horizontal half of a box sum for one row: t = a + (a[-1] + a[+1]) + (a[-2] + a[+2]) ..., the order of
   bayer_demosaic._box. From d0 + 1 to r, added to whatever t holds (d0 = 0 starts from a). */
static void row_sum(const float *restrict a, float *restrict t, long W, int d0, int r) {
    if (d0 == 0) for (long x = 0; x < W; x++) t[x] = a[x];
    for (int d = d0 + 1; d <= r; d++) {
        INNER(d, lo, hi);
        for (long x = 0; x < lo; x++) t[x] += a[CX[x - d]] + a[CX[x + d]];
        for (long x = lo; x < hi; x++) t[x] += a[x - d] + a[x + d];
        for (long x = hi; x < W; x++) t[x] += a[CX[x - d]] + a[CX[x + d]];
    }
}

/* The vertical half for output row y: o = t[y] + (t[y-1] + t[y+1]) ... + eps, t the row sums (R x W). */
static void col_sum(const float *restrict t, float *restrict o, long y, long W, int r, float eps) {
    const float *t0 = t + CY[y];
    for (long x = 0; x < W; x++) o[x] = t0[x];
    for (int d = 1; d <= r; d++) {
        const float *u = t + CY[y - d], *v = t + CY[y + d];
        for (long x = 0; x < W; x++) o[x] += u[x] + v[x];
    }
    for (long x = 0; x < W; x++) o[x] += eps;
}

static void box_sum(const float *a, float *tmp, float *out, long R, long W, int r, float eps) {
    /* rows first, then columns, each as a + (a[-1] + a[+1]) + (a[-2] + a[+2]) ..., as bayer_demosaic._box */
    for (long y = 0; y < R; y++) row_sum(a + (size_t)y * W, tmp + (size_t)y * W, W, 0, r);
    for (long y = 0; y < R; y++) col_sum(tmp, out + (size_t)y * W, y, W, r, eps);
}

static inline float powr(float t, float p) { return p == 2.0f ? t * t : powf(t, p); }

static inline float sqz(float r) { return r / (1.0f + r); }
static inline float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

/* Sweep one of learned_map for one row: the per-sensel inputs. c0 is the row, cm1/cp1/cm2/cp2 the rows
   1 and 2 above and below (held to the band). The interior columns index directly (vectorized). */
#define BODY1(x, a, b, d, e2) { \
        float cc = c0[x], s = cr[x] == 1 ? 1.0f : -1.0f; \
        float mh = (c0[b] + c0[d]) / 2.0f, mv = (cm1[x] + cp1[x]) / 2.0f; \
        float lh = (2.0f * cc - c0[a]) - c0[e2], lv = (2.0f * cc - cm2[x]) - cp2[x]; \
        ah[x] = s * (cc - mh); bh[x] = s * lh; av[x] = s * (cc - mv); bv[x] = s * lv; \
        curv[x] = fabsf(lh) + fabsf(lv); \
        slope[x] = fabsf(c0[d] - c0[b]) + fabsf(cp1[x] - cm1[x]); \
        dis[x] = fabsf(mh - mv); \
        lev[x] = (fabsf(cc) + fabsf(mh)) + fabsf(mv); \
        float ddh = s * (cc - (mh + 0.1875f * lh)), ddv = s * (cc - (mv + 0.1875f * lv)); \
        dh[x] = ddh; dv[x] = ddv; \
        absd[x] = fabsf(ddh) + fabsf(ddv); }
static void sweep1_row(const float *restrict c0, const float *restrict cm1, const float *restrict cp1,
                       const float *restrict cm2, const float *restrict cp2, const int8_t *restrict cr,
                       float *restrict ah, float *restrict bh, float *restrict av, float *restrict bv,
                       float *restrict dh, float *restrict dv, float *restrict curv, float *restrict slope,
                       float *restrict dis, float *restrict lev, float *restrict absd, long W) {
    INNER(2, lo, hi);
    for (long x = 0; x < lo; x++) BODY1(x, CX[x - 2], CX[x - 1], CX[x + 1], CX[x + 2])
    for (long x = lo; x < hi; x++) BODY1(x, x - 2, x - 1, x + 1, x + 2)
    for (long x = hi; x < W; x++) BODY1(x, CX[x - 2], CX[x - 1], CX[x + 1], CX[x + 2])
}
#undef BODY1

/* Sweep two for one row: the second differences of the colour-difference lines (num, den) and the
   gradient inputs (ghi, gvi). *0 is the row, *m/*p the rows above and below (held). */
#define BODY2(x, b, d) { \
        float d2a = (2.0f * ah[x] - ah[d]) - ah[b]; \
        float d2b = (2.0f * bh[x] - bh[d]) - bh[b]; \
        float nu = 0.0f + d2a * d2b, de = 0.0f + d2b * d2b; \
        d2a = (2.0f * av0[x] - avp[x]) - avm[x]; \
        d2b = (2.0f * bv0[x] - bvp[x]) - bvm[x]; \
        num[x] = nu + d2a * d2b; den[x] = de + d2b * d2b; \
        float a0 = dh[x], b0 = dv0[x]; \
        ghi[x] = fabsf(a0 - dh[d]) + fabsf(a0 - dh[b]); \
        gvi[x] = fabsf(b0 - dvp[x]) + fabsf(b0 - dvm[x]); }
static void sweep2_row(const float *restrict ah, const float *restrict bh, const float *restrict av0,
                       const float *restrict avm, const float *restrict avp, const float *restrict bv0,
                       const float *restrict bvm, const float *restrict bvp, const float *restrict dh,
                       const float *restrict dv0, const float *restrict dvm, const float *restrict dvp,
                       float *restrict num, float *restrict den, float *restrict ghi, float *restrict gvi, long W) {
    INNER(1, lo, hi);
    for (long x = 0; x < lo; x++) BODY2(x, CX[x - 1], CX[x + 1])
    for (long x = lo; x < hi; x++) BODY2(x, x - 1, x + 1)
    for (long x = hi; x < W; x++) BODY2(x, CX[x - 1], CX[x + 1])
}
#undef BODY2

/* The eight features of one output row from its twelve window sums (see learned_map for the order). Each
   plane is its own restrict parameter: GCC vectorizes these loops only then. */
static void feature_row(const float *restrict b0, const float *restrict b1, const float *restrict b2,
                        const float *restrict b3, const float *restrict b4, const float *restrict b5,
                        const float *restrict b6, const float *restrict b7, const float *restrict b8,
                        const float *restrict b9, const float *restrict b10, const float *restrict b11,
                        float *restrict f0, float *restrict f1, float *restrict f2, float *restrict f3,
                        float *restrict f4, float *restrict f5, float *restrict f6, float *restrict f7,
                        float e, long W) {
    for (long x = 0; x < W; x++) {
        f0[x] = clampf(b0[x] / b1[x], 0.0f, 0.5f);
        f1[x] = sqz(b2[x] / b3[x]);
        f2[x] = sqz(b4[x] / (b2[x] * 0.25f + e));
        f3[x] = fabsf(b10[x] - b11[x]) / ((b10[x] + b11[x]) + e);
        f4[x] = sqz(b9[x] / b5[x]);
        f5[x] = sqz((4.0f * b2[x]) / b5[x]);
        f6[x] = sqz(b6[x] / b7[x]);
        f7[x] = sqz(b8[x] / (b6[x] * 0.25f + e));
    }
}

/* w += k * f and w += k * (f * g), each sensel on its own (no reordering across sensels). */
static inline void add_term(float *restrict w, const float *restrict f, float k, long W) {
    for (long x = 0; x < W; x++) w[x] += k * f[x];
}
static inline void add_product(float *restrict w, const float *restrict f, const float *restrict g, float k, long W) {
    for (long x = 0; x < W; x++) w[x] += k * (f[x] * g[x]);
}

/* The eight features and the fitted weight of one output row from its twelve window sums B, written to
   o: w = coef[0] + sum coef[1+j] f_j (+ sum coef[t] f_a f_b), in that order, as _laplace_learned adds them.
   F: 8 rows of scratch, w: one. */
static void weight_row(float *const *B, float *const *F, float *w, float *o, const float *coef, int ncoef,
                       float e, long W) {
    feature_row(B[0], B[1], B[2], B[3], B[4], B[5], B[6], B[7], B[8], B[9], B[10], B[11],
                F[0], F[1], F[2], F[3], F[4], F[5], F[6], F[7], e, W);
    float c0 = coef[0];
    for (long x = 0; x < W; x++) w[x] = c0;
    for (int j = 0; j < 8; j++) add_term(w, F[j], coef[1 + j], W);
    if (ncoef > 9) {
        int t = 9;
        for (int a = 0; a < 8; a++)
            for (int b = a; b < 8; b++) add_product(w, F[a], F[b], coef[t++], W);
    }
    for (long x = 0; x < W; x++) o[x] = clampf(w[x], 0.125f, 0.25f);
}

/* Rings of RING rows per plane: row y of a ring plane lives in slot (y held to the band) mod RING. */
#define RING 8
static inline float *ring_row(float *plane, long y, long R, long W) {
    long h = y < 0 ? 0 : (y >= R ? R - 1 : y);
    return plane + (size_t)(h & (RING - 1)) * W;
}

/* col_sum over a ring plane: o = t[y] + (t[y-1] + t[y+1]) ... + eps, rows held to the band. */
static void col_sum_ring(float *t, float *restrict o, long y, long R, long W, int r, float eps) {
    const float *t0 = ring_row(t, y, R, W);
    for (long x = 0; x < W; x++) o[x] = t0[x];
    for (int d = 1; d <= r; d++) {
        const float *u = ring_row(t, y - d, R, W), *v = ring_row(t, y + d, R, W);
        for (long x = 0; x < W; x++) o[x] += u[x] + v[x];
    }
    for (long x = 0; x < W; x++) o[x] += eps;
}

/* The learned per-sensel Laplacian weight of bayer_demosaic._laplace_features and _laplace_learned, written
   into lapw (R x W). Same float32 operations in the same order as the numpy code, so the result is equal
   bit for bit, and edge reads repeat the edge row or column as _sh repeats them. coef: intercept, the 8
   linear terms, then (when ncoef is 45) the 36 products f_i f_j, i <= j. Returns 0 or -1 (memory).

   Fused (2026-11-16, eval/bayer-learned-fused-2026-11-16.md). Three row steps run as a pipeline: at step k,
   sweep one computes row k's per-sensel inputs from the raw (the colour-difference lines, curvature,
   slope, disagreement, level, the 3/16 colour differences) and the horizontal halves of their box sums;
   sweep two computes row k-1's second differences and gradient inputs (they read rows k-2 .. k) and their
   horizontal sums; then the vertical halves of all twelve box sums, the eight features and the fitted
   weight of row k-3 (whose 5 x 5 sums read rows k-5 .. k-1). Every intermediate lives in an 8-row ring,
   so no band-sized plane is allocated or written but lapw: the old code wrote 15 planes. The 5 x 5 row
   sums continue the 3 x 3 ones (the same additions in the same order as _box). */
static long learned_map(const float *c, const int8_t *col, long R, long W, float e, const float *coef, int ncoef,
                        float *lapw) {
    /* ring planes (RING rows each): 0-5 ah bh av bv dh dv; 6 curv1 7 curv2 8 slope1 9 slope2 10 dis1
       11 dis2 12 lev1 13 absd1 14 num1 15 den1 16 gh2 17 gv2. Then 9 rows of per-sensel inputs, 12 of
       vertical sums, 8 of features and 1 of weights. */
    enum { NP = 18 };
    size_t rw = (size_t)RING * W;
    float *buf = (float *)malloc(sizeof(float) * (rw * NP + (size_t)W * 30));
    if (!buf) return -1;
    float *P[NP];
    for (int j = 0; j < NP; j++) P[j] = buf + (size_t)j * rw;
    float *rowb = buf + NP * rw;
    float *curv = rowb, *slope = rowb + W, *dis = rowb + 2 * W, *lev = rowb + 3 * W, *absd = rowb + 4 * W;
    float *num = rowb + 5 * W, *den = rowb + 6 * W, *ghi = rowb + 7 * W, *gvi = rowb + 8 * W;
    float *B[12], *F[8], *wr = rowb + 29 * (size_t)W;
    for (int j = 0; j < 12; j++) B[j] = rowb + (size_t)(9 + j) * W;
    for (int j = 0; j < 8; j++) F[j] = rowb + (size_t)(21 + j) * W;
#define RR(j, yy) ring_row(P[j], (yy), R, W)
    for (long k = 0; k < R + 3; k++) {
        if (k < R) {  /* sweep one, row k */
            long y = k, r0 = y * W;
            sweep1_row(c + r0, c + CY[y - 1], c + CY[y + 1], c + CY[y - 2], c + CY[y + 2], col + r0,
                       RR(0, y), RR(1, y), RR(2, y), RR(3, y), RR(4, y), RR(5, y), curv, slope, dis, lev, absd, W);
            float *c1 = RR(6, y), *c2 = RR(7, y), *s1 = RR(8, y), *s2 = RR(9, y), *d1 = RR(10, y), *d2 = RR(11, y);
            row_sum(curv, c1, W, 0, 1);
            for (long x = 0; x < W; x++) c2[x] = c1[x];
            row_sum(curv, c2, W, 1, 2);
            row_sum(slope, s1, W, 0, 1);
            for (long x = 0; x < W; x++) s2[x] = s1[x];
            row_sum(slope, s2, W, 1, 2);
            row_sum(dis, d1, W, 0, 1);
            for (long x = 0; x < W; x++) d2[x] = d1[x];
            row_sum(dis, d2, W, 1, 2);
            row_sum(lev, RR(12, y), W, 0, 1);
            row_sum(absd, RR(13, y), W, 0, 1);
        }
        long y = k - 1;
        if (y >= 0 && y < R) {  /* sweep two, row k-1 (reads rows k-2 .. k of planes 0-5) */
            sweep2_row(RR(0, y), RR(1, y), RR(2, y), RR(2, y - 1), RR(2, y + 1), RR(3, y), RR(3, y - 1), RR(3, y + 1),
                       RR(4, y), RR(5, y), RR(5, y - 1), RR(5, y + 1), num, den, ghi, gvi, W);
            row_sum(num, RR(14, y), W, 0, 1);
            row_sum(den, RR(15, y), W, 0, 1);
            row_sum(ghi, RR(16, y), W, 0, 2);
            row_sum(gvi, RR(17, y), W, 0, 2);
        }
        y = k - 3;
        if (y >= 0) {  /* the vertical halves, features and weight of row k-3 */
            col_sum_ring(P[14], B[0], y, R, W, 1, 0.0f);   /* num */
            col_sum_ring(P[15], B[1], y, R, W, 1, e * e);  /* den */
            col_sum_ring(P[6], B[2], y, R, W, 1, 0.0f);    /* curvature 3x3 */
            col_sum_ring(P[8], B[3], y, R, W, 1, e);       /* slope 3x3 */
            col_sum_ring(P[10], B[4], y, R, W, 1, 0.0f);   /* disagreement 3x3 */
            col_sum_ring(P[12], B[5], y, R, W, 1, e);      /* level 3x3 */
            col_sum_ring(P[7], B[6], y, R, W, 2, 0.0f);    /* curvature 5x5 */
            col_sum_ring(P[9], B[7], y, R, W, 2, e);       /* slope 5x5 */
            col_sum_ring(P[11], B[8], y, R, W, 2, 0.0f);   /* disagreement 5x5 */
            col_sum_ring(P[13], B[9], y, R, W, 1, 0.0f);   /* |colour differences| 3x3 */
            col_sum_ring(P[16], B[10], y, R, W, 2, 0.0f);  /* horizontal gradient 5x5 */
            col_sum_ring(P[17], B[11], y, R, W, 2, 0.0f);  /* vertical gradient 5x5 */
            weight_row(B, F, wr, lapw + (size_t)y * W, coef, ncoef, e, W);
        }
    }
#undef RR
    free(buf);
    return 0;
}

long shootflow_bayer_piece(const float *c, const int8_t *col, long R, long W, int window, float power,
                           float lap, int simple, float eps, long oy0, long orows, long ox0, long ow,
                           float *out, long ostride, const float *coef, int ncoef) {
    size_t n = (size_t)R * W;
    if (window < 0 || window > M - 4) return -2;
    if (ncoef != 0 && ncoef != 9 && ncoef != 45) return -3;
    long *tab = (long *)malloc(sizeof(long) * (size_t)(W + R + 4 * M));
    float *lapw = ncoef ? (float *)malloc(sizeof(float) * n) : 0;
    if (!tab || (ncoef && !lapw)) { free(tab); free(lapw); return -1; }
    for (long x = -M; x < W + M; x++) tab[x + M] = x < 0 ? 0 : (x >= W ? W - 1 : x);
    for (long y = -M; y < R + M; y++) tab[W + 2 * M + y + M] = (y < 0 ? 0 : (y >= R ? R - 1 : y)) * W;
    CX = tab + M; CY = tab + W + 3 * M;
    /* the learned weight's 15 feature planes are freed before the 13 below are taken */
    if (ncoef && learned_map(c, col, R, W, eps, coef, ncoef, lapw) != 0) { free(tab); free(lapw); return -1; }
    float *buf = (float *)malloc(sizeof(float) * n * 13);
    if (!buf) { free(tab); free(lapw); return -1; }
    float *est_h = buf, *est_v = buf + n, *dh = buf + 2 * n, *dv = buf + 3 * n;
    float *gh = buf + 4 * n, *gv = buf + 5 * n, *tmp = buf + 6 * n;
    float *wh = buf + 7 * n, *wv = buf + 8 * n, *green = buf + 9 * n;
    float *k = buf + 10 * n, *k2 = buf + 11 * n, *g = buf + 12 * n;
    float *wd[4] = {0, 0, 0, 0};
    static const int DY[4] = {-1, -1, 1, 1}, DX[4] = {-1, 1, -1, 1};
    long rc = 0;

    /* step 1: row and column estimates; step 2: the colour difference along each line */
    for (long y = 0; y < R; y++)
        for (long x = 0; x < W; x++) {
            size_t i = (size_t)y * W + x;
            float cc = c[i];
            float L = lapw ? lapw[i] : lap;
            float eh = (AT(c, y, x - 1) + AT(c, y, x + 1)) / 2.0f + ((2.0f * cc - AT(c, y, x - 2)) - AT(c, y, x + 2)) * L;
            float ev = (AT(c, y - 1, x) + AT(c, y + 1, x)) / 2.0f + ((2.0f * cc - AT(c, y - 2, x)) - AT(c, y + 2, x)) * L;
            float s = col[i] == 1 ? 1.0f : -1.0f;
            est_h[i] = eh; est_v[i] = ev;
            dh[i] = s * (cc - eh); dv[i] = s * (cc - ev);
        }
    for (long y = 0; y < R; y++)
        for (long x = 0; x < W; x++) {
            size_t i = (size_t)y * W + x;
            float a = dh[i], b = dv[i];
            gh[i] = fabsf(a - AT(dh, y, x + 1)) + fabsf(a - AT(dh, y, x - 1));
            gv[i] = fabsf(b - AT(dv, y + 1, x)) + fabsf(b - AT(dv, y - 1, x));
        }
    box_sum(gh, tmp, dh, R, W, window, eps);   /* dh, dv now hold the window sums + eps */
    box_sum(gv, tmp, dv, R, W, window, eps);
    for (size_t i = 0; i < n; i++) {
        float sh = dh[i], sv = dv[i], t = sh + sv;
        float a = powr(sv / t, power), b = powr(sh / t, power), nn = a + b;
        a = a / nn; b = b / nn;
        wh[i] = a; wv[i] = b;
        green[i] = col[i] == 1 ? c[i] : a * est_h[i] + b * est_v[i];
    }

    /* step 3 weights: how smooth the raw is along each diagonal (the same for red and blue) */
    if (!simple) {
        for (int d = 0; d < 4; d++) {
            wd[d] = (float *)malloc(sizeof(float) * n);
            if (!wd[d]) { rc = -1; goto done; }
            int dy = DY[d], dx = DX[d];
            for (long y = 0; y < R; y++)
                for (long x = 0; x < W; x++) {
                    size_t i = (size_t)y * W + x;
                    g[i] = (fabsf(AT(c, y + dy, x + dx) - AT(c, y - dy, x - dx)) + fabsf(c[i] - AT(c, y + 2 * dy, x + 2 * dx)))
                           + fabsf(AT(green, y + dy, x + dx) - green[i]);
                }
            box_sum(g, tmp, wd[d], R, W, 1, eps);
            for (size_t i = 0; i < n; i++) { float t = wd[d][i]; wd[d][i] = 1.0f / (t * t); }
        }
    }

    for (int own = 0; own <= 2; own += 2) {
        int other = 2 - own;
        for (size_t i = 0; i < n; i++) k[i] = col[i] == own ? c[i] - green[i] : 0.0f;
        for (long y = 0; y < R; y++)
            for (long x = 0; x < W; x++) {
                size_t i = (size_t)y * W + x;
                if (col[i] != other) { k2[i] = k[i]; continue; }
                if (simple) {
                    float s = 0.0f;
                    for (int d = 0; d < 4; d++) s += AT(k, y + DY[d], x + DX[d]);
                    k2[i] = s / 4.0f;
                } else {
                    float acc = 0.0f, ws = 0.0f;
                    for (int d = 0; d < 4; d++) {
                        float w = wd[d][i];
                        acc += w * AT(k, y + DY[d], x + DX[d]);
                        ws += w;
                    }
                    k2[i] = acc / ws;
                }
            }
        for (long oy = 0; oy < orows; oy++) {
            long y = oy0 + oy;
            float *row = out + (size_t)oy * ostride;
            for (long ox = 0; ox < ow; ox++) {
                long x = ox0 + ox;
                size_t i = (size_t)y * W + x;
                float v;
                if (col[i] == own) v = c[i];
                else if (col[i] == 1) {
                    float kh = (AT(k2, y, x - 1) + AT(k2, y, x + 1)) / 2.0f;
                    float kv = (AT(k2, y - 1, x) + AT(k2, y + 1, x)) / 2.0f;
                    float kg = simple ? (kh + kv) / 2.0f : wh[i] * kh + wv[i] * kv;
                    v = green[i] + kg;
                } else v = green[i] + k2[i];
                row[ox * 3 + own] = v;
                if (own == 0) row[ox * 3 + 1] = green[i];
            }
        }
    }
done:
    for (int d = 0; d < 4; d++) free(wd[d]);
    free(buf);
    free(lapw);
    free(tab);
    return rc;
}
"""

# -O3 lets the compiler vectorize the direct-indexed interior loops (2026-11-16). It changes no bit: there is
# no -ffast-math, so every lane does the same IEEE float32 operations in the same order, and
# -ffp-contract=off keeps a * b + c from becoming one fused multiply-add. tests/test_bayer_native.py and the
# real-frame checks compare the result with numpy bit for bit.
_FLAGS = ["-O3", "-ffp-contract=off"]
_STATE: dict[str, object] = {}
_LOCK = threading.Lock()


def _load():
    if os.environ.get("SHOOTFLOW_NATIVE", "1") == "0" or sys.platform == "win32":
        return None
    from shootflow.ljpeg_native import _cache_dir, _compiler

    digest = hashlib.sha256((C_SOURCE + " ".join(_FLAGS)).encode()).hexdigest()[:16]
    suffix = ".dylib" if sys.platform == "darwin" else ".so"
    target = _cache_dir() / f"bayer-demosaic-{digest}{suffix}"
    try:
        if not target.exists():
            cc = _compiler()
            if cc is None:
                return None
            target.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix="shootflow-cc-") as tmp:
                src = Path(tmp) / "bayer.c"
                src.write_text(C_SOURCE)
                built = Path(tmp) / target.name
                flags = _FLAGS + (["-dynamiclib"] if sys.platform == "darwin" else ["-shared", "-fPIC"])
                try:
                    subprocess.run([cc, *flags, "-o", str(built), str(src), "-lm"], check=True, capture_output=True, timeout=60)
                except (OSError, subprocess.SubprocessError):
                    return None
                os.replace(built, target)
        lib = ctypes.CDLL(str(target))
    except OSError:
        return None
    fn = lib.shootflow_bayer_piece
    fn.restype = ctypes.c_long
    L, P = ctypes.c_long, ctypes.c_void_p
    fn.argtypes = [P, P, L, L, ctypes.c_int, ctypes.c_float, ctypes.c_float, ctypes.c_int, ctypes.c_float, L, L, L, L, P, L,
                   P, ctypes.c_int]
    return fn


def function():
    """The loaded C function, or None. Built and loaded once per process."""

    if "fn" not in _STATE:
        with _LOCK:
            if "fn" not in _STATE:
                _STATE["fn"] = _load()
    return _STATE["fn"]


def available() -> bool:
    return function() is not None


def piece(c, colours, window: int, power: float, simple: bool, eps: float, oy0: int, ox0: int, out,
          laplace: float = 0.1875, learned=None) -> bool:
    """Demosaic the padded band ``c`` (float32, C-contiguous, colour per sensel in ``colours``, int8) into
    ``out`` (a (rows, cols, 3) float32 view with unit column stride), whose top-left is band row ``oy0``,
    column ``ox0``. ``learned``: the weights of a learned per-sensel Laplacian weight (9 or 45, as
    ``bayer_demosaic.LEARNED_LAPLACE``) in place of the fixed ``laplace``. False when the C path is
    unavailable (the caller runs numpy)."""

    import numpy as np

    fn = function()
    if fn is None:
        return False
    c = np.ascontiguousarray(c, dtype=np.float32)
    colours = np.ascontiguousarray(colours, dtype=np.int8)
    R, W = c.shape
    rows, cols, three = out.shape
    if three != 3 or out.dtype != np.float32 or out.strides[1] != 12 or out.strides[2] != 4:
        raise ValueError("out must be a float32 (rows, cols, 3) view with packed sensels")
    coef = np.ascontiguousarray(learned if learned is not None else (), dtype=np.float32)
    if coef.size not in (0, 9, 45):
        raise ValueError(f"{coef.size} learned weights: the native demosaic takes 9 or 45")
    rc = fn(
        c.ctypes.data, colours.ctypes.data, R, W, int(window), float(power), float(laplace), 1 if simple else 0, float(eps),
        oy0, rows, ox0, cols, out.ctypes.data, out.strides[0] // 4,
        coef.ctypes.data if coef.size else None, int(coef.size),
    )
    if rc == -2:
        raise ValueError("the native Bayer demosaic takes window 0 to 12")
    if rc != 0:
        raise MemoryError("the native Bayer demosaic could not allocate its band buffers")
    return True
