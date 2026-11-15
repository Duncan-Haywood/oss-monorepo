"""Optional C path for the directional X-Trans demosaic (``shootflow.xtrans_demosaic``).

The numpy code in ``xtrans_demosaic._directional_piece`` is the reference. It builds four directional
pictures of three planes each, plus masks, shifted copies and ``np.where`` blends, all band-sized: about
70 MB of temporaries per 1,000 columns of a 192-row band, and most of its time is spent moving them.
This module carries the same steps (isotropic estimates, the four clamped directional greens, red and
blue per direction, the gradient blend, the median clean-up, any number of passes) as one C function
over a padded piece, in the same arithmetic and order of operations, compiled with the system C
compiler the first time it is asked for and loaded through ``ctypes`` (the build and cache rules of
``shootflow.ljpeg_native``: ``$CC`` or ``cc``, ``$SHOOTFLOW_CACHE``, ``SHOOTFLOW_NATIVE=0`` turns it
off). With no compiler or a failed build ``piece()`` returns False and the numpy path runs.

What it covers: ``select="gradient"`` (the default) with or without ``clamp``, any ``passes`` and
``median_passes``. ``select="homogeneity"`` (the 2026-11-14 rule, kept to reproduce it) stays numpy.
Every read outside the piece is reflected exactly as ``np.pad(mode="reflect")`` reflects it, and the
directional green is computed in double as numpy promotes it, so the outputs are equal bit for bit
(``tests/test_xtrans_native.py``; real frames in ``eval/xtrans-native-2026-11-15.md``). The code is this
repository's own, written from the numpy module, not from dcraw's or LibRaw's source.
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
#include <string.h>
#include <math.h>

/* Reflected reads (numpy's mode="reflect": -1 -> 1, n -> n-2) through two lookup tables, for indices up
   to M past either edge. RX[x] is the column, RY[y] the row times W. Set once per call. */
#define M 8
static __thread const long *RX, *RY;
#define AT(p, y, x) (p)[RY[y] + RX[x]]

/* xtrans_demosaic._box3 on the whole plane: each row's column sums of three ((a[y-1] + a[y]) + a[y+1])
   into t (one row), then rows of three, the same additions in the same order as numpy; edges reflected. */
static void box3(const float *a, float *out, float *t, long R, long W) {
    for (long y = 0; y < R; y++) {
        const float *up = a + RY[y - 1], *mid = a + (size_t)y * W, *dn = a + RY[y + 1];
        for (long x = 0; x < W; x++) t[x] = (up[x] + mid[x]) + dn[x];
        float *o = out + (size_t)y * W;
        o[0] = (t[1] + t[0]) + t[1];
        for (long x = 1; x < W - 1; x++) o[x] = (t[x - 1] + t[x]) + t[x + 1];
        o[W - 1] = (t[W - 2] + t[W - 1]) + t[W - 2];
    }
}

/* xtrans_demosaic._box_average: the mean of v over the sensels of colour k in each 3x3 window, and
   where a window holds none, box3(box3(.)) of both (the 5x5-ish fallback). v holds values only at
   colour k (0 elsewhere). den is box3 of colour k's mask (precomputed), empty whether it has a zero.
   Writes out (which may not be v). Returns -1 when memory runs out. */
static int box_average(const float *v, const float *den, int empty, float *out, float *t, long R, long W) {
    size_t n = (size_t)R * W;
    box3(v, out, t, R, W);
    if (!empty) {
        for (size_t i = 0; i < n; i++) out[i] = out[i] / den[i];
        return 0;
    }
    float *b2 = (float *)malloc(sizeof(float) * n * 2);
    if (!b2) return -1;
    box3(out, b2, t, R, W);      /* box3(box3(v)) */
    box3(den, b2 + n, t, R, W);  /* box3(box3(mask)) */
    for (size_t i = 0; i < n; i++) out[i] = den[i] == 0.0f ? b2[i] / b2[n + i] : out[i] / den[i];
    free(b2);
    return 0;
}

/* Steps 1 and 3 fused into one sweep when no window is empty (always, on real layouts): v = c - g (or c
   when g is NULL) at colour k and 0 elsewhere, its 3x3 box exactly as box3, divided by den, and out = c
   at colour k, else g + mean (or the mean). The same operations as the separate passes, so the same bits. */
static inline float vk(const float *c, const float *g, const int8_t *col, int k, size_t i) {
    return col[i] == k ? (g ? c[i] - g[i] : c[i]) : 0.0f;
}
static void fill_avg(const float *c, const float *g, const int8_t *col, int k, const float *den, float *out,
                     float *t, long R, long W) {
    for (long y = 0; y < R; y++) {
        size_t ou = (size_t)RY[y - 1], om = (size_t)y * W, od = (size_t)RY[y + 1];
        if (g)
            for (long x = 0; x < W; x++) {
                /* every load unconditional, then a select: the compiler vectorises that, not a branch */
                float a = c[ou + x] - g[ou + x], b = c[om + x] - g[om + x], e = c[od + x] - g[od + x];
                a = col[ou + x] == k ? a : 0.0f;
                b = col[om + x] == k ? b : 0.0f;
                e = col[od + x] == k ? e : 0.0f;
                t[x] = (a + b) + e;
            }
        else
            for (long x = 0; x < W; x++) {
                float a = c[ou + x], b = c[om + x], e = c[od + x];
                a = col[ou + x] == k ? a : 0.0f;
                b = col[om + x] == k ? b : 0.0f;
                e = col[od + x] == k ? e : 0.0f;
                t[x] = (a + b) + e;
            }
        const int8_t *cr = col + om;
        const float *crow = c + om, *dr = den + om, *gr = g ? g + om : NULL;
        float *o = out + om;
        o[0] = ((t[1] + t[0]) + t[1]) / dr[0];
        o[W - 1] = ((t[W - 2] + t[W - 1]) + t[W - 2]) / dr[W - 1];
        for (long x = 1; x < W - 1; x++) o[x] = ((t[x - 1] + t[x]) + t[x + 1]) / dr[x];
        if (gr)
            for (long x = 0; x < W; x++) { float own = crow[x], est = gr[x] + o[x]; o[x] = cr[x] == k ? own : est; }
        else
            for (long x = 0; x < W; x++) { float own = crow[x], est = o[x]; o[x] = cr[x] == k ? own : est; }
    }
}

/* The 19 compare-exchange network of xtrans_demosaic._MEDIAN9, unrolled (branch-free min and max; a
   table-driven loop with branches took 40% of the run); element 4 ends as the median of nine. */
#define MN(a, b) ((b) < (a) ? (b) : (a))
#define MX(a, b) ((a) < (b) ? (b) : (a))
#define CX(i, j) do { float p_ = v##i, q_ = v##j; v##i = MN(p_, q_); v##j = MX(p_, q_); } while (0)
static inline float median9(float v0, float v1, float v2, float v3, float v4, float v5, float v6, float v7, float v8) {
    CX(1,2);
    CX(4,5);
    CX(7,8);
    CX(0,1);
    CX(3,4);
    CX(6,7);
    CX(1,2);
    CX(4,5);
    CX(7,8);
    CX(0,3);
    CX(5,8);
    CX(4,7);
    CX(3,6);
    CX(1,4);
    CX(2,5);
    CX(4,7);
    CX(4,2);
    CX(6,4);
    CX(4,2);
    return v4;
}

/* The same network four sensels at a time with GCC/clang vector extensions (SSE on x86-64, NEON on ARM):
   the lane-wise select picks exactly what MN and MX pick, so the same bits. The scalar loop would not
   vectorise ("control flow in loop"). */
typedef float vf __attribute__((vector_size(16)));
typedef int32_t vi __attribute__((vector_size(16)));
static inline vf vsel(vi m, vf a, vf b) { return (vf)(((vi)a & m) | ((vi)b & ~m)); }  /* m ? a : b */
#define VX(i, j) do { vf p_ = v##i, q_ = v##j; v##i = vsel(q_ < p_, q_, p_); v##j = vsel(p_ < q_, q_, p_); } while (0)
static inline vf ld(const float *a) { vf v; memcpy(&v, a, sizeof v); return v; }
static inline vf median9v(vf v0, vf v1, vf v2, vf v3, vf v4, vf v5, vf v6, vf v7, vf v8) {
    VX(1,2);
    VX(4,5);
    VX(7,8);
    VX(0,1);
    VX(3,4);
    VX(6,7);
    VX(1,2);
    VX(4,5);
    VX(7,8);
    VX(0,3);
    VX(5,8);
    VX(4,7);
    VX(3,6);
    VX(1,4);
    VX(2,5);
    VX(4,7);
    VX(4,2);
    VX(6,4);
    VX(4,2);
    return v4;
}

/* 3x3 medians of a whole plane, edges reflected, row by row. */
static void median_plane(const float *a, float *out, long R, long W) {
    for (long y = 0; y < R; y++) {
        const float *u = a + RY[y - 1], *m = a + (size_t)y * W, *d = a + RY[y + 1];
        float *o = out + (size_t)y * W;
        o[0] = median9(u[1], u[0], u[1], m[1], m[0], m[1], d[1], d[0], d[1]);
        long x = 1;
        for (; x + 4 <= W - 1; x += 4) {
            vf r = median9v(ld(u + x - 1), ld(u + x), ld(u + x + 1), ld(m + x - 1), ld(m + x), ld(m + x + 1),
                            ld(d + x - 1), ld(d + x), ld(d + x + 1));
            memcpy(o + x, &r, sizeof r);
        }
        for (; x < W - 1; x++)
            o[x] = median9(u[x - 1], u[x], u[x + 1], m[x - 1], m[x], m[x + 1], d[x - 1], d[x], d[x + 1]);
        o[W - 1] = median9(u[W - 2], u[W - 1], u[W - 2], m[W - 2], m[W - 1], m[W - 2], d[W - 2], d[W - 1], d[W - 2]);
    }
}

/* c: the piece, R x W float32 (already padded by whole periods). col: colour per sensel (0 R, 1 G, 2 B).
   reach: 4 directions x 2 (forward, back) x p x p distances to the nearest green (0: none within 3).
   out: R x W x 3 float32, the whole piece. Returns 0, -1 when memory runs out. Runs without the GIL. */
long shootflow_xtrans_piece(const float *c, const int8_t *col, long R, long W, const int8_t *reach, int p,
                            int clamp, float eps, int passes, int median_passes, float *out) {
    static const int DIRS[4][2] = {{0, 1}, {1, 0}, {1, 1}, {1, -1}};
    size_t n = (size_t)R * W;
    if (R < M + 1 || W < M + 1) return -2;
    long *tab = (long *)malloc(sizeof(long) * (size_t)(W + R + 4 * M));
    float *buf = (float *)malloc(sizeof(float) * (n * 26 + (size_t)W));
    int *xph = (int *)malloc(sizeof(int) * (size_t)W);
    if (!buf || !tab || !xph) { free(buf); free(tab); free(xph); return -1; }
    for (long x = 0; x < W; x++) xph[x] = (int)(x % p);
    for (long x = -M; x < W + M; x++) tab[x + M] = x < 0 ? -x : (x >= W ? 2 * (W - 1) - x : x);
    for (long y = -M; y < R + M; y++) tab[W + 2 * M + y + M] = (y < 0 ? -y : (y >= R ? 2 * (R - 1) - y : y)) * W;
    RX = tab + M; RY = tab + W + 3 * M;
    float *iso[3] = {buf, buf + n, buf + 2 * n};
    float *pic[4][3];
    for (int d = 0; d < 4; d++)
        for (int k = 0; k < 3; k++) pic[d][k] = buf + (3 + 3 * d + k) * n;
    float *rough[4] = {buf + 15 * n, buf + 16 * n, buf + 17 * n, buf + 18 * n};
    float *v = buf + 19 * n, *mk = buf + 20 * n, *avg = buf + 21 * n, *g = buf + 22 * n;
    float *den[3] = {buf + 23 * n, buf + 24 * n, buf + 25 * n}, *t = buf + 26 * n;
    int empty[3];
    long rc = 0;
    for (int k = 0; k < 3; k++) {  /* how many sensels of each colour every 3x3 window holds */
        for (size_t i = 0; i < n; i++) mk[i] = col[i] == k ? 1.0f : 0.0f;
        box3(mk, den[k], t, R, W);
        empty[k] = 0;
        for (size_t i = 0; i < n; i++) empty[k] |= den[k][i] == 0.0f;
    }

    /* 1. isotropic 3x3 estimates */
    for (int k = 0; k < 3; k++) {
        if (!empty[k]) { fill_avg(c, NULL, col, k, den[k], iso[k], t, R, W); continue; }
        for (size_t i = 0; i < n; i++) v[i] = vk(c, NULL, col, k, i);
        if (box_average(v, den[k], empty[k], avg, t, R, W)) { rc = -1; goto done; }
        for (size_t i = 0; i < n; i++) iso[k][i] = col[i] == k ? c[i] : avg[i];
    }

    for (int pass = 0; pass < passes; pass++) {
        if (pass > 0)  /* later passes take their colour differences from the previous picture */
            for (int k = 0; k < 3; k++)
                for (size_t i = 0; i < n; i++) iso[k][i] = col[i] == k ? c[i] : out[3 * i + k];
        for (int d = 0; d < 4; d++) {
            int dy = DIRS[d][0], dx = DIRS[d][1];
            const int8_t *fw = reach + (size_t)(2 * d) * p * p, *bk = reach + (size_t)(2 * d + 1) * p * p;
            /* 2. green along this line as a colour difference against the sensel's own colour */
            for (long y = 0; y < R; y++) {
                int yp = (int)(y % p) * p;
                for (long x = 0; x < W; x++) {
                    size_t i = (size_t)y * W + x;
                    int k = col[i];
                    if (k == 1) { g[i] = c[i]; continue; }
                    g[i] = iso[1][i];
                    int ph = yp + xph[x];
                    int ka = fw[ph], kb = bk[ph];
                    if (ka <= 0 || kb <= 0) continue;
                    const float *ik = iso[k];
                    long yf = y + ka * dy, xf = x + ka * dx, yb = y - kb * dy, xb = x - kb * dx;
                    float df = AT(c, yf, xf) - AT(ik, yf, xf), db = AT(c, yb, xb) - AT(ik, yb, xb);
                    /* numpy: int64 * float32 promotes to float64, so this is double */
                    double est = (double)c[i] + ((double)kb * (double)df + (double)ka * (double)db) / (double)(ka + kb);
                    if (clamp) {
                        float gf = AT(c, yf, xf), gb = AT(c, yb, xb);
                        double lo = gf < gb ? gf : gb, hi = gf < gb ? gb : gf;
                        if (est < lo) est = lo;   /* np.clip: minimum(maximum(est, lo), hi) */
                        if (est > hi) est = hi;
                    }
                    g[i] = (float)est;
                }
            }
            /* 3. red and blue from this green, as 3x3 colour differences */
            memcpy(pic[d][1], g, sizeof(float) * n);
            for (int k = 0; k <= 2; k += 2) {
                if (!empty[k]) { fill_avg(c, g, col, k, den[k], pic[d][k], t, R, W); continue; }
                for (size_t i = 0; i < n; i++) v[i] = vk(c, g, col, k, i);
                if (box_average(v, den[k], empty[k], avg, t, R, W)) { rc = -1; goto done; }
                for (size_t i = 0; i < n; i++) pic[d][k][i] = col[i] == k ? c[i] : g[i] + avg[i];
            }
            /* 4a. roughness: |fwd + back - 2 pic| summed over channels, then 3x3, plus eps */
            for (long y = 0; y < R; y++) {
                long of = RY[y + dy], ob = RY[y - dy], om = y * W;
                for (long x = 0; x < W; x++) v[om + x] = 0.0f;
                for (int k = 0; k < 3; k++) {  /* s = ((0 + |u_R|) + |u_G|) + |u_B|, channel by channel */
                    const float *a = pic[d][k], *f = a + of, *b = a + ob, *m = a + om;
                    float *s = v + om;
                    for (long x = 0; x < W; x += W - 1) {  /* the two edge columns, reflected */
                        float u = (f[RX[x + dx]] + b[RX[x - dx]]) - 2.0f * m[x];
                        s[x] += fabsf(u);
                    }
                    for (long x = 1; x < W - 1; x++) {
                        float u = (f[x + dx] + b[x - dx]) - 2.0f * m[x];
                        s[x] += fabsf(u);
                    }
                }
            }
            box3(v, rough[d], t, R, W);
            for (size_t i = 0; i < n; i++) rough[d][i] = rough[d][i] + eps;
        }
        /* 4b. weights (D_min / D)^4 as (q * q) * (q * q), normalised; the blend */
        for (size_t i = 0; i < n; i++) {
            float r0 = rough[0][i], r1 = rough[1][i], r2 = rough[2][i], r3 = rough[3][i];
            float mn = r0;
            if (r1 < mn) mn = r1;
            if (r2 < mn) mn = r2;
            if (r3 < mn) mn = r3;
            float w[4], rr[4] = {r0, r1, r2, r3};
            for (int d = 0; d < 4; d++) { float q = mn / rr[d], q2 = q * q; w[d] = q2 * q2; }
            float sum = ((w[0] + w[1]) + w[2]) + w[3];
            for (int d = 0; d < 4; d++) w[d] = w[d] / sum;
            for (int k = 0; k < 3; k++) {
                float o = pic[0][k][i] * w[0];
                o += pic[1][k][i] * w[1];
                o += pic[2][k][i] * w[2];
                o += pic[3][k][i] * w[3];
                out[3 * i + k] = o;
            }
        }
    }

    /* 5. median clean-up of R - G and B - G around the sensels' own values */
    for (int m = 0; m < median_passes; m++) {
        float *rg = avg, *bg = g, *dr = v, *db = mk;
        for (size_t i = 0; i < n; i++) { dr[i] = out[3 * i] - out[3 * i + 1]; db[i] = out[3 * i + 2] - out[3 * i + 1]; }
        median_plane(dr, rg, R, W);
        median_plane(db, bg, R, W);
        for (size_t i = 0; i < n; i++) {
            int k = col[i];
            float gg = k == 0 ? c[i] - rg[i] : (k == 2 ? c[i] - bg[i] : c[i]);
            out[3 * i] = k == 0 ? c[i] : gg + rg[i];
            out[3 * i + 1] = gg;
            out[3 * i + 2] = k == 2 ? c[i] : gg + bg[i];
        }
    }
done:
    free(buf);
    free(tab);
    free(xph);
    return rc;
}
"""

_FLAGS = ["-O3", "-ffp-contract=off"]  # no -ffast-math: IEEE float32 as numpy does it
_STATE: dict[str, object] = {}
_LOCK = threading.Lock()


def _load():
    if os.environ.get("SHOOTFLOW_NATIVE", "1") == "0" or sys.platform == "win32":
        return None
    from shootflow.ljpeg_native import _cache_dir, _compiler

    digest = hashlib.sha256((C_SOURCE + " ".join(_FLAGS)).encode()).hexdigest()[:16]
    suffix = ".dylib" if sys.platform == "darwin" else ".so"
    target = _cache_dir() / f"xtrans-demosaic-{digest}{suffix}"
    try:
        if not target.exists():
            cc = _compiler()
            if cc is None:
                return None
            target.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix="shootflow-cc-") as tmp:
                src = Path(tmp) / "xtrans.c"
                src.write_text(C_SOURCE)
                built = Path(tmp) / target.name
                flags = _FLAGS + (["-dynamiclib"] if sys.platform == "darwin" else ["-shared", "-fPIC"])
                try:
                    subprocess.run([cc, *flags, "-o", str(built), str(src)], check=True, capture_output=True, timeout=60)
                except (OSError, subprocess.SubprocessError):
                    return None
                os.replace(built, target)
        lib = ctypes.CDLL(str(target))
    except OSError:
        return None
    fn = lib.shootflow_xtrans_piece
    fn.restype = ctypes.c_long
    L, P, N = ctypes.c_long, ctypes.c_void_p, ctypes.c_int
    fn.argtypes = [P, P, L, L, P, N, N, ctypes.c_float, N, N, P]
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


def piece(c, colours, reach, p: int, clamp: bool, eps, passes: int, median_passes: int):
    """Run the whole directional demosaic on the padded piece ``c`` (float32, (R, W), colour per sensel in
    ``colours``) and return the (R, W, 3) float32 picture, or None when the C path is unavailable (the
    caller runs numpy). ``reach`` is the (4, 2, p, p) table of distances to the nearest green."""

    import numpy as np

    fn = function()
    if fn is None:
        return None
    c = np.ascontiguousarray(c, dtype=np.float32)
    colours = np.ascontiguousarray(colours, dtype=np.int8)
    reach = np.ascontiguousarray(reach, dtype=np.int8)
    R, W = c.shape
    out = np.empty((R, W, 3), dtype=np.float32)
    rc = fn(
        c.ctypes.data, colours.ctypes.data, R, W, reach.ctypes.data, int(p), 1 if clamp else 0,
        float(eps), int(passes), int(median_passes), out.ctypes.data,
    )
    if rc == -2:
        raise ValueError("the native X-Trans demosaic needs a padded piece of at least 9 x 9 sensels")
    if rc != 0:
        raise MemoryError("the native X-Trans demosaic could not allocate its buffers")
    return out
