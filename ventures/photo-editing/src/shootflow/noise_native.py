"""Optional C path for the noise-aware demosaic's noise reading (``xtrans_demosaic._residual`` and the per-block
median of ``_block_spread``), 2026-11-19.

On a 24 MP frame the profile guard (``guard_profile`` -> ``profile_ratio`` -> ``_block_spread``) took 1.4 s of
the 3.1 s the noise-aware develop adds over directional: a leave-one-out residual built from twelve 3 x 3 box
sums per band in numpy, then a median per 24 x 24 block through a reshaped copy of the whole frame
(eval/noise-aware-native-spread-2026-11-19.md). This module does the same two steps in C, compiled with the
system C compiler the first time it is asked for and loaded through ``ctypes`` (the build and cache rules of
``shootflow.ljpeg_native``: ``$CC`` or ``cc``, ``$SHOOTFLOW_CACHE``, ``SHOOTFLOW_NATIVE=0`` turns it off). With
no compiler or a failed build each function returns ``None`` and the numpy path runs.

Nothing is tuned and nothing is approximated. The residual is the numpy arithmetic in the numpy order: each
colour's masked plane ``c * m`` (``m`` 1.0 or 0.0, so a negative sensel masked out is -0.0 as in numpy), a 3 x
3 sum of columns of three then rows of three (``(a + b) + c`` each way), the same sum again on that result,
edges reflected about the frame's first and last row and column (numpy's ``mode="reflect"``), minus ``(9 * c)
* m``, over the same sums of the mask, and ``(|c - pred| * 1.4826) * 0.85``. ``-ffp-contract=off`` keeps the
compiler from fusing a multiply and an add. The median is a selection over each block's values, the mean of
the two middle ones ``(a + b) / 2`` for an even count as ``np.median`` takes it, NaN when the block holds a NaN.
So the two paths agree bit for bit: ``tests/test_noise_native.py`` checks it on random planes of both CFAs and
odd sizes, and the eval note on whole real frames.

The C code runs on rows ``[y0, y1)`` of the whole frame; ``raw_develop_np._run_bands`` hands it bands on a
thread pool (``ctypes`` releases the GIL during the call), so the thread count changes no bit.
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

import numpy as np

C_SOURCE = r"""
#include <stdlib.h>
#include <string.h>
#include <math.h>

static long rf(long i, long n) { /* numpy's mode="reflect" for one step past an edge */
    if (i < 0) return -i;
    if (i >= n) return 2 * n - 2 - i;
    return i;
}

/* One first-sum row: the 3 x 3 sums (columns of three, then rows of three) of each colour's masked values and
   of its mask, at frame row r (already reflected), into o (6 planes of w: R values, R mask, G, G mask, B, B mask).
   cols is (period, w): each row phase's colour per column; v is scratch for 6 x w. */
static void first_sum(const double *c, const signed char *cols, int period, long h, long w, long r,
                      double *v, double *o) {
    long ra = rf(r - 1, h), rb = rf(r + 1, h);
    const double *pa = c + ra * w, *pr = c + r * w, *pb = c + rb * w;
    const signed char *ca = cols + (ra % period) * w, *cr = cols + (r % period) * w, *cb = cols + (rb % period) * w;
    for (int k = 0; k < 3; k++) {
        double *vv = v + 2 * k * w, *vm = vv + w;
        for (long x = 0; x < w; x++) {
            double ma = ca[x] == k ? 1.0 : 0.0, mr = cr[x] == k ? 1.0 : 0.0, mb = cb[x] == k ? 1.0 : 0.0;
            double s = pa[x] * ma + pr[x] * mr;
            s += pb[x] * mb;
            vv[x] = s;
            double m = ma + mr;
            m += mb;
            vm[x] = m;
        }
    }
    for (int q = 0; q < 6; q++) {
        const double *vv = v + q * w;
        double *oo = o + q * w;
        oo[0] = (vv[1] + vv[0]) + vv[1];
        for (long x = 1; x + 1 < w; x++) {
            double s = vv[x - 1] + vv[x];
            oo[x] = s + vv[x + 1];
        }
        oo[w - 1] = (vv[w - 2] + vv[w - 1]) + vv[w - 2];
    }
}

/* Rows [y0, y1) of the leave-one-out residual of the (h, w) float64 mosaic c (h, w >= 2) whose colours repeat
   the (period x period) tile `tile` (0 R, 1 G, 2 B) from the frame's origin. out is (h, w); only rows y0..y1-1
   are written. Returns 0, or -1 when memory runs out. */
int shootflow_residual_rows(const double *c, const signed char *tile, int period, long h, long w,
                            long y0, long y1, double *out) {
    double *ring = malloc(sizeof(double) * 4 * 6 * w); /* first-sum rows, slot t % 4 holds row t */
    double *v = malloc(sizeof(double) * 6 * w);
    double *row = malloc(sizeof(double) * 6 * w);
    signed char *cols = malloc((size_t)period * w);
    if (!ring || !v || !row || !cols) { free(ring); free(v); free(row); free(cols); return -1; }
    for (int p = 0; p < period; p++)
        for (long x = 0; x < w; x++) cols[p * w + x] = tile[p * period + x % period];
    long have[4] = {-1, -1, -1, -1};
    for (long y = y0; y < y1; y++) {
        long need[3] = {rf(y - 1, h), y, rf(y + 1, h)};
        const double *src[3];
        for (int j = 0; j < 3; j++) {
            long t = need[j];
            int slot = (int)(t % 4);
            if (have[slot] != t) { first_sum(c, cols, period, h, w, t, v, ring + (size_t)slot * 6 * w); have[slot] = t; }
            src[j] = ring + (size_t)slot * 6 * w;
        }
        for (int q = 0; q < 6; q++) {
            const double *a = src[0] + q * w, *m = src[1] + q * w, *b = src[2] + q * w;
            double *o = row + q * w;
            for (long x = 0; x < w; x++) {
                double s = a[x] + m[x];
                o[x] = s + b[x];
            }
        }
        const double *cy = c + y * w;
        const signed char *cc_ = cols + (y % period) * w;
        double *oy = out + y * w;
        for (long x = 0; x < w; x++) {
            int k = cc_[x];
            const double *sv = row + (size_t)(2 * k) * w, *sm = sv + w;
            long xa = x ? x - 1 : 1, xb = x + 1 < w ? x + 1 : w - 2;
            double s = sv[xa] + sv[x];
            s += sv[xb];
            double n = sm[xa] + sm[x];
            n += sm[xb];
            double cc = cy[x];
            s = s - (9.0 * cc) * 1.0;
            n = n - 9.0 * 1.0;
            double pred = s / (n > 1e-9 ? n : 1e-9);
            oy[x] = (fabs(cc - pred) * 1.4826) * 0.85;
        }
    }
    free(ring); free(v); free(row); free(cols);
    return 0;
}

static void sel(double *a, long n, long k) { /* a[k] is the k-th smallest; a[<k] <= a[k] <= a[>k] */
    long lo = 0, hi = n - 1;
    while (hi > lo) {
        double p = a[lo + (hi - lo) / 2];
        long i = lo, j = hi;
        while (i <= j) {
            while (a[i] < p) i++;
            while (a[j] > p) j--;
            if (i <= j) { double t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; }
        }
        if (k <= j) hi = j; else if (k >= i) lo = i; else return;
    }
}

/* The median of each (block x block) block of the (h, w) plane a, for block rows [by0, by1) of hb x wb blocks
   (the frame cropped to hb*block x wb*block): (a + b) / 2 of the two middle values for an even count, NaN when
   the block holds a NaN. out is (hb, wb). Returns 0, or -1 when memory runs out. */
int shootflow_block_median(const double *a, long w, long block, long wb, long by0, long by1, double *out) {
    long n = block * block;
    double *t = malloc(sizeof(double) * n);
    if (!t) return -1;
    for (long by = by0; by < by1; by++) {
        for (long bx = 0; bx < wb; bx++) {
            int nan = 0;
            long at = 0;
            for (long y = 0; y < block; y++) {
                const double *p = a + (by * block + y) * w + bx * block;
                for (long x = 0; x < block; x++) {
                    double q = p[x];
                    if (q != q) nan = 1;
                    t[at++] = q;
                }
            }
            double m;
            if (nan) m = NAN;
            else if (n % 2) { sel(t, n, n / 2); m = t[n / 2]; }
            else {
                long k = n / 2;
                sel(t, n, k);
                double hi = t[k], lo = t[0];
                for (long i = 1; i < k; i++) if (t[i] > lo) lo = t[i];
                m = (lo + hi) / 2.0;
            }
            out[by * wb + bx] = m;
        }
    }
    free(t);
    return 0;
}

/* --- 2026-11-19 (second change): the bilinear image and the blend (eval/noise-aware-native-blend-2026-11-19.md) */

static inline double ld(const void *p, int f32, size_t i) {
    return f32 ? (double)((const float *)p)[i] : ((const double *)p)[i];
}
static inline void st(void *p, int f32, size_t i, double v) {
    if (f32) ((float *)p)[i] = (float)v; else ((double *)p)[i] = v;
}

/* Rows [y0, y1) of raw_develop_np._bilinear's sink: each sensel's own colour as it is, each missing colour the
   mean of the 3 x 3 neighbours holding it, (0.0 + v0) + v1 ... over the in-frame ones in row order divided by
   their count; with none in frame (an X-Trans edge) the mean of the reflected ones, frame-clamped. Then times
   mults[colour] and clipped as _clip: v > hi -> hi, v < 0 -> 0.0. norm is (h, w) float64; tile is the
   (period x period) CFA; offs is (period*period*3, 9, 2) offsets with noff their counts. sink (h, w, 3). */
void shootflow_bilinear_rows(const double *norm, long h, long w, const signed char *tile, int period,
                             const signed char *offs, const int *noff, const double *mults, double hi,
                             void *sink, int sink_f32, long y0, long y1) {
    for (long y = y0; y < y1; y++) {
        int py = (int)(y % period);
        for (long x = 0; x < w; x++) {
            int px = (int)(x % period);
            int own = tile[py * period + px];
            for (int k = 0; k < 3; k++) {
                double val;
                if (k == own) val = norm[y * w + x];
                else {
                    int ph = (py * period + px) * 3 + k, n = noff[ph];
                    const signed char *o = offs + (size_t)ph * 18;
                    double total = 0.0;
                    long count = 0;
                    for (int i = 0; i < n; i++) {
                        long yy = y + o[2 * i], xx = x + o[2 * i + 1];
                        if (yy >= 0 && yy < h && xx >= 0 && xx < w) { total = total + norm[yy * w + xx]; count++; }
                        else total = total + 0.0;
                    }
                    if (count) val = total / (double)count;
                    else {
                        double t = 0.0;
                        for (int i = 0; i < n; i++) {
                            long yy = y - o[2 * i], xx = x - o[2 * i + 1];
                            yy = yy < 0 ? 0 : (yy > h - 1 ? h - 1 : yy);
                            xx = xx < 0 ? 0 : (xx > w - 1 ? w - 1 : xx);
                            t += norm[yy * w + xx];
                        }
                        val = t / (double)n;
                    }
                }
                double v = val * mults[k];
                v = v > hi ? hi : (v < 0 ? 0.0 : v);
                st(sink, sink_f32, ((size_t)y * w + x) * 3 + k, v);
            }
        }
    }
}

/* Rows [y0, y1) of xtrans_demosaic.blend. Weights per pixel from the (hb, wb) block weights ab (already ramped
   and clipped): m = ab[jy] * (1 - ty) + ab[jy1] * ty along rows, then m[jx] * (1 - tx) + m[jx1] * tx along
   columns. res = a * d + (1 - a) * b per channel; with abl (the luma ramp's block weights, or NULL) res +=
   (a_l - a) * Y, Y = (x0 * 0.2126 + x1 * 0.7152) + x2 * 0.0722 of x = d - b. Stored to out; with clip set (a
   float32 out only) the stored value is then clipped in float32 as _clip does it there. mrow is scratch, 2 * wb. */
int shootflow_blend_rows(const void *b, int b_f32, const void *d, int d_f32, void *out, int out_f32,
                         long w, long wb, const double *ab, const double *abl,
                         const long *jy, const long *jy1, const double *ty,
                         const long *jx, const long *jx1, const double *tx,
                         const double *lw, int clip, double hi, long y0, long y1) {
    double *m = malloc(sizeof(double) * 2 * (size_t)wb);
    if (!m) return -1;
    double *ml = m + wb;
    float hf = (float)hi;
    for (long y = y0; y < y1; y++) {
        double t = ty[y], u = 1.0 - t;
        const double *r0 = ab + jy[y] * wb, *r1 = ab + jy1[y] * wb;
        for (long i = 0; i < wb; i++) { double p = r0[i] * u, q = r1[i] * t; m[i] = p + q; }
        if (abl) {
            const double *l0 = abl + jy[y] * wb, *l1 = abl + jy1[y] * wb;
            for (long i = 0; i < wb; i++) { double p = l0[i] * u, q = l1[i] * t; ml[i] = p + q; }
        }
        for (long x = 0; x < w; x++) {
            double s = tx[x], v = 1.0 - s;
            double p = m[jx[x]] * v, q = m[jx1[x]] * s;
            double a = p + q, na = 1.0 - a;
            size_t at = ((size_t)y * w + x) * 3;
            double bb[3], dd[3], res[3];
            for (int k = 0; k < 3; k++) {
                bb[k] = ld(b, b_f32, at + k); dd[k] = ld(d, d_f32, at + k);
                double e = a * dd[k], f = na * bb[k];
                res[k] = e + f;
            }
            if (abl) {
                double pl = ml[jx[x]] * v, ql = ml[jx1[x]] * s;
                double al = pl + ql;
                double x0 = dd[0] - bb[0], x1 = dd[1] - bb[1], x2 = dd[2] - bb[2];
                double y0_ = x0 * lw[0], y1_ = x1 * lw[1], y2_ = x2 * lw[2];
                double yy = y0_ + y1_;
                yy = yy + y2_;
                double g = (al - a) * yy;
                for (int k = 0; k < 3; k++) res[k] = res[k] + g;
            }
            for (int k = 0; k < 3; k++) {
                if (clip) {
                    float f = (float)res[k];
                    f = f > hf ? hf : (f < 0 ? 0.0f : f);
                    ((float *)out)[at + k] = f;
                } else st(out, out_f32, at + k, res[k]);
            }
        }
    }
    free(m);
    return 0;
}

/* --- 2026-11-19 (third change): block mean and block max (eval/noise-aware-native-levels-2026-11-19.md) */

/* numpy's pairwise sum of n contiguous float64 (umath loops_utils: under 8 a plain loop, up to 128 eight
   running sums joined ((r0 + r1) + (r2 + r3)) + ((r4 + r5) + (r6 + r7)) then the rest, else split at
   n / 2 rounded down to a multiple of 8). np.add.reduce over a contiguous last axis takes exactly this order. */
static double pw_sum(const double *a, long n) {
    if (n < 8) { double r = 0.0; for (long i = 0; i < n; i++) r += a[i]; return r; }
    if (n <= 128) {
        double r[8]; long i;
        for (int j = 0; j < 8; j++) r[j] = a[j];
        for (i = 8; i < n - (n % 8); i += 8)
            for (int j = 0; j < 8; j++) r[j] += a[i + j];
        double res = ((r[0] + r[1]) + (r[2] + r[3])) + ((r[4] + r[5]) + (r[6] + r[7]));
        for (; i < n; i++) res += a[i];
        return res;
    }
    long n2 = n / 2;
    n2 -= n2 % 8;
    return pw_sum(a, n2) + pw_sum(a + n2, n - n2);
}

/* For block rows [by0, by1) of the (block x block) blocks of the (h, w) plane a (the frame cropped to hb*block
   x wb*block): out_mean, when not NULL, the mean of each block's values clipped at 0 as np.clip(a, 0.0, None)
   takes it (-0.0 -> 0.0, NaN kept), summed in the order xtrans_demosaic._block_stat's reshaped copy gives
   np.mean (rows of the block one after another, pw_sum) and divided by block*block; out_max, when not NULL,
   each block's largest raw value, NaN when it holds a NaN (np.max). out_* are (hb, wb). Returns 0 or -1. */
int shootflow_block_mean_max(const double *a, long w, long block, long wb, long by0, long by1,
                             double *out_mean, double *out_max) {
    long n = block * block;
    double *t = malloc(sizeof(double) * n);
    if (!t) return -1;
    for (long by = by0; by < by1; by++) {
        for (long bx = 0; bx < wb; bx++) {
            long at = 0;
            double mx = -INFINITY;
            int nan = 0;
            for (long y = 0; y < block; y++) {
                const double *p = a + (by * block + y) * w + bx * block;
                for (long x = 0; x < block; x++) {
                    double q = p[x];
                    if (q != q) nan = 1;
                    else if (q > mx) mx = q;
                    t[at++] = q > 0.0 ? q : (q != q ? q : 0.0);
                }
            }
            if (out_mean) out_mean[by * wb + bx] = pw_sum(t, n) / (double)n;
            if (out_max) out_max[by * wb + bx] = nan ? NAN : mx;
        }
    }
    free(t);
    return 0;
}

/* Patch PCA (noise_pca), 2026-11-19. Each patch is a row of dd float64 in p. */

/* g[i] for patches [i0, i1): the texture energy sum over D's rows of t * t, t the row's dot product with the
   patch taken over the row's nonzero columns in ascending order (CSR: rowptr, cols, coef), t = 0.0 then
   t += coef * x, g = 0.0 then g += t * t; noise_pca._energy_ref does the same vector by vector. */
void shootflow_patch_energy(const double *p, long dd, int nrows, const int *rowptr, const int *cols,
                            const double *coef, long i0, long i1, double *g) {
    for (long i = i0; i < i1; i++) {
        const double *x = p + i * dd;
        double s = 0.0;
        for (int r = 0; r < nrows; r++) {
            double t = 0.0;
            for (int k = rowptr[r]; k < rowptr[r + 1]; k++) t += coef[k] * x[cols[k]];
            s += t * t;
        }
        g[i] = s;
    }
}

typedef struct {
    const double *p; const long *idx; long dd; const double *mean; int K; const int *pa, *pb; double *xc;
} pw_ctx;

/* Row i's K values: the patch itself (mean NULL), or the products xc[a] * xc[b], a <= b in row-major order, of its
   centred samples; written to dst (add 0) or added to it (add 1). The inner loop runs over b, contiguous. */
static inline void pw_vals(const pw_ctx *c, long i, double *restrict dst, int add) {
    const double *x = c->p + c->idx[i] * c->dd;
    long dd = c->dd;
    if (!c->mean) {
        if (add) for (long k = 0; k < dd; k++) dst[k] += x[k];
        else for (long k = 0; k < dd; k++) dst[k] = x[k];
        return;
    }
    double *restrict xc = c->xc;
    for (long k = 0; k < dd; k++) xc[k] = x[k] - c->mean[k];
    for (long a = 0; a < dd; a++) {
        double xa = xc[a];
        double *restrict d = dst;
        long nb = dd - a;
        const double *xb = xc + a;
        if (add) for (long b = 0; b < nb; b++) d[b] += xb[b] * xa;
        else for (long b = 0; b < nb; b++) d[b] = xb[b] * xa;
        dst += nb;
    }
}

/* pw_sum's tree over rows [lo, lo + n), each of the K values summed in it at once. scr holds K * (9 + depth). */
static void pw_rows(const pw_ctx *c, long lo, long n, double *out, double *scr) {
    int K = c->K;
    if (n < 8) {
        for (int k = 0; k < K; k++) out[k] = 0.0;
        for (long i = 0; i < n; i++) pw_vals(c, lo + i, out, 1);
        return;
    }
    if (n <= 128) {
        /* Lane j sums rows j, j + 8, ... below n - n % 8 in order (the first one assigned), then the lanes join
           as pw_sum joins them and the tail rows are added one by one. For the products, a leaf first centres
           its rows into a (n, dd) block (c->xc holds 128 rows), and each a's lane sums over b stay in L1. */
        long nm = n - (n % 8);
        if (!c->mean) {
            double *r = scr;
            for (int j = 0; j < 8; j++) pw_vals(c, lo + j, r + j * K, 0);
            for (long i = 8; i < nm; i += 8)
                for (int j = 0; j < 8; j++) pw_vals(c, lo + i + j, r + j * K, 1);
            for (int k = 0; k < K; k++)
                out[k] = ((r[k] + r[K + k]) + (r[2 * K + k] + r[3 * K + k]))
                         + ((r[4 * K + k] + r[5 * K + k]) + (r[6 * K + k] + r[7 * K + k]));
            for (long i = nm; i < n; i++) pw_vals(c, lo + i, out, 1);
            return;
        }
        long dd = c->dd;
        double *restrict xc = c->xc;
        for (long i = 0; i < n; i++) {
            const double *x = c->p + c->idx[lo + i] * dd;
            for (long k = 0; k < dd; k++) xc[i * dd + k] = x[k] - c->mean[k];
        }
        double *restrict r = scr; /* 8 lanes of up to dd values for one a */
        double *o = out;
        for (long a = 0; a < dd; a++) {
            long nb = dd - a;
            for (int j = 0; j < 8; j++) {
                double *restrict rj = r + j * dd;
                const double *row = xc + j * dd;
                double xa = row[a];
                for (long b = 0; b < nb; b++) rj[b] = row[a + b] * xa;
                for (long i = 8 + j; i < nm; i += 8) {
                    const double *rw = xc + i * dd;
                    double ya = rw[a];
                    for (long b = 0; b < nb; b++) rj[b] += rw[a + b] * ya;
                }
            }
            for (long b = 0; b < nb; b++)
                o[b] = ((r[b] + r[dd + b]) + (r[2 * dd + b] + r[3 * dd + b]))
                       + ((r[4 * dd + b] + r[5 * dd + b]) + (r[6 * dd + b] + r[7 * dd + b]));
            for (long i = nm; i < n; i++) {
                const double *rw = xc + i * dd;
                double ya = rw[a];
                for (long b = 0; b < nb; b++) o[b] += rw[a + b] * ya;
            }
            o += nb;
        }
        return;
    }
    long n2 = n / 2;
    n2 -= n2 % 8;
    pw_rows(c, lo, n2, out, scr + K);
    pw_rows(c, lo + n2, n - n2, scr, scr + K);
    for (int k = 0; k < K; k++) out[k] += scr[k];
}

/* The (dd, dd) covariance of patches idx[0..m): each column's mean is its pw_sum over the rows in idx order
   divided by m, each entry the pw_sum of the centred products divided by m - 1 (noise_pca._cov_ref). */
int shootflow_patch_cov(const double *p, long dd, const long *idx, long m, double *cov) {
    if (m < 2 || dd < 1) return -1;
    int K = (int)(dd * (dd + 1) / 2);
    double *buf = malloc(sizeof(double) * ((size_t)K * 75 + (size_t)K + 2 * (size_t)dd + 128 * (size_t)dd));
    int *pa = malloc(sizeof(int) * 2 * (size_t)K);
    if (!buf || !pa) { free(buf); free(pa); return -1; }
    int *pb = pa + K;
    double *scr = buf, *sum = buf + (size_t)K * 75, *mean = sum + K, *xc = mean + dd;
    int at = 0;
    for (int a = 0; a < dd; a++) for (int b = a; b < dd; b++) { pa[at] = a; pb[at] = b; at++; }
    pw_ctx c = {p, idx, dd, NULL, (int)dd, pa, pb, xc};
    pw_rows(&c, 0, m, sum, scr);
    for (long k = 0; k < dd; k++) mean[k] = sum[k] / (double)m;
    c.mean = mean; c.K = K;
    pw_rows(&c, 0, m, sum, scr);
    for (int k = 0; k < K; k++) {
        double v = sum[k] / (double)(m - 1);
        cov[pa[k] * dd + pb[k]] = v;
        cov[pb[k] * dd + pa[k]] = v;
    }
    free(buf); free(pa);
    return 0;
}
"""

_STATE: dict[str, object] = {}
_LOCK = threading.Lock()
_FLAGS = ["-O3", "-ffp-contract=off"]  # no -ffast-math: IEEE float64 as numpy does it


def _load():
    if os.environ.get("SHOOTFLOW_NATIVE", "1") == "0" or sys.platform == "win32":
        return None
    from shootflow.ljpeg_native import _cache_dir, _compiler

    digest = hashlib.sha256((C_SOURCE + " ".join(_FLAGS)).encode()).hexdigest()[:16]
    suffix = ".dylib" if sys.platform == "darwin" else ".so"
    target = _cache_dir() / f"noise-spread-{digest}{suffix}"
    try:
        if not target.exists():
            cc = _compiler()
            if cc is None:
                return None
            target.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix="shootflow-cc-") as tmp:
                src = Path(tmp) / "noise.c"
                src.write_text(C_SOURCE)
                built = Path(tmp) / target.name
                flags = _FLAGS + (["-dynamiclib"] if sys.platform == "darwin" else ["-shared", "-fPIC"])
                try:
                    subprocess.run([cc, *flags, "-o", str(built), str(src), "-lm"], check=True,
                                   capture_output=True, timeout=60)
                except (OSError, subprocess.SubprocessError):
                    return None
                os.replace(built, target)  # atomic, so a parallel build never loads half a file
        lib = ctypes.CDLL(str(target))
    except OSError:
        return None
    P, L = ctypes.c_void_p, ctypes.c_long
    resid = lib.shootflow_residual_rows
    resid.restype = ctypes.c_int
    resid.argtypes = [P, P, ctypes.c_int, L, L, L, L, P]
    med = lib.shootflow_block_median
    med.restype = ctypes.c_int
    med.argtypes = [P, L, L, L, L, L, P]
    bil = lib.shootflow_bilinear_rows
    bil.restype = None
    bil.argtypes = [P, L, L, P, ctypes.c_int, P, P, P, ctypes.c_double, P, ctypes.c_int, L, L]
    bl = lib.shootflow_blend_rows
    bl.restype = ctypes.c_int
    bl.argtypes = [P, ctypes.c_int, P, ctypes.c_int, P, ctypes.c_int, L, L, P, P, P, P, P, P, P, P, P,
                   ctypes.c_int, ctypes.c_double, L, L]
    mm = lib.shootflow_block_mean_max
    mm.restype = ctypes.c_int
    mm.argtypes = [P, L, L, L, L, L, P, P]
    pe = lib.shootflow_patch_energy
    pe.restype = None
    pe.argtypes = [P, L, ctypes.c_int, P, P, P, L, L, P]
    pc = lib.shootflow_patch_cov
    pc.restype = ctypes.c_int
    pc.argtypes = [P, L, P, L, P]
    return resid, med, bil, bl, mm, pe, pc


def functions():
    """The loaded C functions (residual rows, block median, bilinear rows, blend rows, block mean/max, patch
    energy, patch covariance), or None. Built and loaded once per process."""

    if "fn" not in _STATE:
        with _LOCK:
            if "fn" not in _STATE:
                _STATE["fn"] = _load()
    return _STATE["fn"]


def available() -> bool:
    return functions() is not None


def _ptr(a: np.ndarray) -> int:
    return a.ctypes.data


def residual(c: np.ndarray, pat, *, band: int = 240, threads: int | None = None) -> np.ndarray | None:
    """``xtrans_demosaic._residual`` in C, bit for bit; None without the C path or for a frame under 2 x 2."""

    loaded = functions()
    c = np.ascontiguousarray(c, dtype=np.float64)
    if loaded is None or c.ndim != 2 or min(c.shape) < 2:
        return None
    fn = loaded[0]
    from shootflow.raw_develop_np import _run_bands

    h, w = c.shape
    period = 6 if len(pat) == 36 else 2
    tile = np.ascontiguousarray(np.asarray(pat, dtype=np.int8).reshape(period, period))
    out = np.empty((h, w), dtype=np.float64)
    failed: list[int] = []

    def run(y0, y1):
        if fn(_ptr(c), _ptr(tile), period, h, w, y0, y1, _ptr(out)) != 0:
            failed.append(y0)

    _run_bands(run, h, band=band, threads=threads)
    if failed:
        raise MemoryError("noise_native.residual: out of memory")
    return out


def block_median(a: np.ndarray, block: int, *, threads: int | None = None) -> np.ndarray | None:
    """``xtrans_demosaic._block_stat(a, median)`` for a 2-D plane at least ``block`` on each side, bit for bit;
    None without the C path or for a smaller plane (whose single block numpy takes)."""

    loaded = functions()
    a = np.ascontiguousarray(a, dtype=np.float64)
    if loaded is None or a.ndim != 2 or a.shape[0] < block or a.shape[1] < block:
        return None
    fn = loaded[1]
    from shootflow.raw_develop_np import _run_bands

    h, w = a.shape
    hb, wb = h // block, w // block
    out = np.empty((hb, wb), dtype=np.float64)
    failed: list[int] = []

    def run(b0, b1):
        if fn(_ptr(a), w, block, wb, b0, b1, _ptr(out)) != 0:
            failed.append(b0)

    _run_bands(run, hb, band=16, threads=threads)
    if failed:
        raise MemoryError("noise_native.block_median: out of memory")
    return out


def block_mean_max(a: np.ndarray, block: int, *, mean: bool = True, top: bool = False,
                   threads: int | None = None) -> tuple[np.ndarray | None, np.ndarray | None] | None:
    """Per (block x block) block of a 2-D plane at least ``block`` on each side, bit for bit with
    ``xtrans_demosaic._block_stat``: with ``mean``, ``np.clip(a, 0.0, None)``'s block means; with ``top``, the
    raw blocks' maxima. One pass and no full-frame copy (numpy makes a clipped copy and a reshaped copy, each
    the size of the frame). None without the C path or for a smaller plane (whose single block numpy takes)."""

    loaded = functions()
    a = np.ascontiguousarray(a, dtype=np.float64)
    if loaded is None or a.ndim != 2 or a.shape[0] < block or a.shape[1] < block or block < 3:
        return None
    fn = loaded[4]
    from shootflow.raw_develop_np import _run_bands

    h, w = a.shape
    hb, wb = h // block, w // block
    om = np.empty((hb, wb), dtype=np.float64) if mean else None
    ox = np.empty((hb, wb), dtype=np.float64) if top else None
    pm, px = (None if om is None else _ptr(om)), (None if ox is None else _ptr(ox))
    failed: list[int] = []

    def run(b0, b1):
        if fn(_ptr(a), w, block, wb, b0, b1, pm, px) != 0:
            failed.append(b0)

    _run_bands(run, hb, band=16, threads=threads)
    if failed:
        raise MemoryError("noise_native.block_mean_max: out of memory")
    return om, ox


def _f(a: np.ndarray) -> tuple[np.ndarray, int] | None:
    """``a`` as a C-contiguous float32 or float64 array and its float32 flag, or None for another dtype or a
    non-contiguous view (whose copy would cost what the C path saves)."""

    if a.dtype not in (np.float32, np.float64) or not a.flags.c_contiguous:
        return None
    return a, int(a.dtype == np.float32)


def bilinear(norm: np.ndarray, pat, mults, hi: float, sink: np.ndarray, *, threads: int | None = None) -> bool:
    """``raw_develop_np._bilinear(..., sink=sink)`` in C, bit for bit: writes ``sink`` ((h, w, 3) float32 or float64)
    and returns True, or returns False (nothing written) without the C path or for a sink it does not take."""

    loaded = functions()
    if loaded is None:
        return False
    norm = np.ascontiguousarray(norm, dtype=np.float64)
    if norm.ndim != 2 or sink.shape != norm.shape + (3,) or _f(sink) is None:
        return False
    from shootflow.raw_develop import cfa_offsets, cfa_period
    from shootflow.raw_develop_np import _run_bands

    p = cfa_period(pat)
    if len(pat) != p * p:
        return False
    table = cfa_offsets(pat)
    offs = np.zeros((p * p * 3, 9, 2), dtype=np.int8)
    noff = np.zeros(p * p * 3, dtype=np.intc)
    for (py, px, colour), lst in table.items():
        k = (py * p + px) * 3 + colour
        noff[k] = len(lst)
        if lst:
            offs[k, : len(lst)] = lst
        elif pat[py * p + px] != colour:
            return False  # a colour no 3 x 3 window holds: numpy's own error path
    tile = np.ascontiguousarray(np.asarray(pat, dtype=np.int8))
    mu = np.ascontiguousarray(np.asarray(mults, dtype=np.float64)[:3])
    h, w = norm.shape
    fn = loaded[2]
    f32 = int(sink.dtype == np.float32)

    def run(y0, y1):
        fn(_ptr(norm), h, w, _ptr(tile), p, _ptr(offs), _ptr(noff), _ptr(mu), float(hi), _ptr(sink), f32, y0, y1)

    _run_bands(run, h, threads=threads)
    return True


def blend(b: np.ndarray, d: np.ndarray, ab: np.ndarray, abl: np.ndarray | None, taps_y, taps_x, lw: np.ndarray,
          out: np.ndarray, *, clip_hi: float | None = None, band: int, threads: int | None = None) -> bool:
    """``xtrans_demosaic.blend`` in C, bit for bit (its numpy order, written for this): ``ab``/``abl`` the ramped
    block weights, ``taps_*`` ``_interp_taps``' (j, j1, t). Writes ``out`` and returns True, or returns False
    (nothing written) without the C path or for arrays it does not take. ``clip_hi``: also clip a float32 ``out``
    as ``raw_develop_np._clip`` does it there."""

    loaded = functions()
    if loaded is None:
        return False
    fb, fd, fo = _f(b), _f(d), _f(out)
    if fb is None or fd is None or fo is None or b.ndim != 3 or b.shape[2] != 3 or d.shape != b.shape \
            or out.shape != b.shape or (clip_hi is not None and out.dtype != np.float32):
        return False
    from shootflow.raw_develop_np import _run_bands

    ab = np.ascontiguousarray(ab, dtype=np.float64)
    abl = None if abl is None else np.ascontiguousarray(abl, dtype=np.float64)
    jy, jy1, ty = (np.ascontiguousarray(taps_y[0], dtype=np.int_), np.ascontiguousarray(taps_y[1], dtype=np.int_),
                   np.ascontiguousarray(taps_y[2], dtype=np.float64))
    jx, jx1, tx = (np.ascontiguousarray(taps_x[0], dtype=np.int_), np.ascontiguousarray(taps_x[1], dtype=np.int_),
                   np.ascontiguousarray(taps_x[2], dtype=np.float64))
    if np.dtype(np.int_).itemsize != ctypes.sizeof(ctypes.c_long):
        return False
    lw = np.ascontiguousarray(lw, dtype=np.float64)
    h, w = b.shape[:2]
    wb = ab.shape[1]
    fn = loaded[3]
    failed: list[int] = []
    pl = None if abl is None else _ptr(abl)

    def run(y0, y1):
        if fn(_ptr(b), fb[1], _ptr(d), fd[1], _ptr(out), fo[1], w, wb, _ptr(ab), pl, _ptr(jy), _ptr(jy1), _ptr(ty),
              _ptr(jx), _ptr(jx1), _ptr(tx), _ptr(lw), int(clip_hi is not None),
              0.0 if clip_hi is None else float(clip_hi), y0, y1) != 0:
            failed.append(y0)

    _run_bands(run, h, band=band, threads=threads)
    if failed:
        raise MemoryError("noise_native.blend: out of memory")
    return True


def patch_energy(p: np.ndarray, rowptr: np.ndarray, cols: np.ndarray, coef: np.ndarray, *,
                 threads: int | None = None) -> np.ndarray | None:
    """``noise_pca._energy_ref`` in C, bit for bit: each patch's texture energy under the CSR rows; None without
    the C path."""

    loaded = functions()
    p = np.ascontiguousarray(p, dtype=np.float64)
    if loaded is None or p.ndim != 2:
        return None
    fn = loaded[5]
    from shootflow.raw_develop_np import _run_bands

    rowptr = np.ascontiguousarray(rowptr, dtype=np.intc)
    cols = np.ascontiguousarray(cols, dtype=np.intc)
    coef = np.ascontiguousarray(coef, dtype=np.float64)
    n, dd = p.shape
    g = np.empty(n, dtype=np.float64)
    nrows = rowptr.size - 1

    def run(i0, i1):
        fn(_ptr(p), dd, nrows, _ptr(rowptr), _ptr(cols), _ptr(coef), i0, i1, _ptr(g))

    _run_bands(run, n, band=32768, threads=threads)
    return g


def patch_cov(p: np.ndarray, idx: np.ndarray) -> np.ndarray | None:
    """``noise_pca._cov_ref(p, idx)`` in C, bit for bit, without gathering the rows; None without the C path
    or under two rows. ``p`` must be C-contiguous float64 (the caller converts once, not per call)."""

    loaded = functions()
    if loaded is None or p.dtype != np.float64 or not p.flags.c_contiguous or p.ndim != 2:
        return None
    idx = np.ascontiguousarray(idx, dtype=np.int_)
    if idx.size < 2 or np.dtype(np.int_).itemsize != ctypes.sizeof(ctypes.c_long):
        return None
    dd = p.shape[1]
    out = np.empty((dd, dd), dtype=np.float64)
    if loaded[6](_ptr(p), dd, _ptr(idx), idx.size, _ptr(out)) != 0:
        raise MemoryError("noise_native.patch_cov: out of memory")
    return out
