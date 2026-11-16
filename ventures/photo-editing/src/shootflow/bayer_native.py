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
``eval/bayer-learned-native-2026-11-16.md``). The optional
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

static void box_sum(const float *a, float *tmp, float *out, long R, long W, int r, float eps) {
    /* rows first, then columns, each as a + (a[-1] + a[+1]) + (a[-2] + a[+2]) ..., as bayer_demosaic._box */
    for (long y = 0; y < R; y++)
        for (long x = 0; x < W; x++) {
            float s = a[(size_t)y * W + x];
            for (int d = 1; d <= r; d++) s += AT(a, y, x - d) + AT(a, y, x + d);
            tmp[(size_t)y * W + x] = s;
        }
    for (long y = 0; y < R; y++)
        for (long x = 0; x < W; x++) {
            float s = tmp[(size_t)y * W + x];
            for (int d = 1; d <= r; d++) s += AT(tmp, y - d, x) + AT(tmp, y + d, x);
            out[(size_t)y * W + x] = s + eps;
        }
}

static inline float powr(float t, float p) { return p == 2.0f ? t * t : powf(t, p); }

static inline float sqz(float r) { return r / (1.0f + r); }
static inline float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

/* The learned per-sensel Laplacian weight of bayer_demosaic._laplace_features and _laplace_learned, written
   into lapw (R x W). Same float32 operations in the same order as the numpy code; every intermediate numpy
   shifts is a stored plane read through AT, so edge reads repeat as _sh repeats them. coef: intercept, the
   8 linear terms, then (when ncoef is 45) the 36 products f_i f_j, i <= j. Returns 0 or -1 (memory). */
static long learned_map(const float *c, const int8_t *col, long R, long W, float e, const float *coef, int ncoef,
                        float *lapw) {
    size_t n = (size_t)R * W;
    float *buf = (float *)malloc(sizeof(float) * n * 15);
    if (!buf) return -1;
    float *F[8], *T[6], *tmp = buf + 14 * n;
    for (int j = 0; j < 8; j++) F[j] = buf + (size_t)j * n;
    for (int j = 0; j < 6; j++) T[j] = buf + (size_t)(8 + j) * n;
#define LOOP for (long y = 0; y < R; y++) for (long x = 0; x < W; x++)
#define I ((size_t)y * W + x)
#define MH(y, x) ((AT(c, y, x - 1) + AT(c, y, x + 1)) / 2.0f)
#define MV(y, x) ((AT(c, y - 1, x) + AT(c, y + 1, x)) / 2.0f)
#define LH(y, x) ((2.0f * AT(c, y, x) - AT(c, y, x - 2)) - AT(c, y, x + 2))
#define LV(y, x) ((2.0f * AT(c, y, x) - AT(c, y - 2, x)) - AT(c, y + 2, x))
#define SG(i) (col[i] == 1 ? 1.0f : -1.0f)
    float *ah = T[0], *bh = T[1], *av = T[2], *bv = T[3], *num = T[4], *den = T[5];
    LOOP {
        size_t i = I; float s = SG(i), cc = c[i];
        ah[i] = s * (cc - MH(y, x)); bh[i] = s * LH(y, x);
        av[i] = s * (cc - MV(y, x)); bv[i] = s * LV(y, x);
    }
    LOOP {
        size_t i = I;
        float d2a = (2.0f * ah[i] - AT(ah, y, x + 1)) - AT(ah, y, x - 1);
        float d2b = (2.0f * bh[i] - AT(bh, y, x + 1)) - AT(bh, y, x - 1);
        float nu = 0.0f + d2a * d2b, de = 0.0f + d2b * d2b;
        d2a = (2.0f * av[i] - AT(av, y + 1, x)) - AT(av, y - 1, x);
        d2b = (2.0f * bv[i] - AT(bv, y + 1, x)) - AT(bv, y - 1, x);
        num[i] = nu + d2a * d2b; den[i] = de + d2b * d2b;
    }
    box_sum(num, tmp, T[0], R, W, 1, 0.0f);
    box_sum(den, tmp, T[1], R, W, 1, e * e);
    for (size_t i = 0; i < n; i++) F[0][i] = clampf(T[0][i] / T[1][i], 0.0f, 0.5f);
    float *curv = T[0], *slope = T[1], *dis = T[2];
    LOOP {
        size_t i = I;
        curv[i] = fabsf(LH(y, x)) + fabsf(LV(y, x));
        slope[i] = fabsf(AT(c, y, x + 1) - AT(c, y, x - 1)) + fabsf(AT(c, y + 1, x) - AT(c, y - 1, x));
        dis[i] = fabsf(MH(y, x) - MV(y, x));
    }
    box_sum(curv, tmp, T[3], R, W, 1, 0.0f);
    box_sum(slope, tmp, T[4], R, W, 1, e);
    box_sum(dis, tmp, T[5], R, W, 1, 0.0f);
    for (size_t i = 0; i < n; i++) {
        F[1][i] = sqz(T[3][i] / T[4][i]);
        F[2][i] = sqz(T[5][i] / (T[3][i] * 0.25f + e));
    }
    LOOP { size_t i = I; T[4][i] = (fabsf(c[i]) + fabsf(MH(y, x))) + fabsf(MV(y, x)); }
    box_sum(T[4], tmp, T[5], R, W, 1, e);  /* T[5]: level */
    for (size_t i = 0; i < n; i++) F[5][i] = sqz((4.0f * T[3][i]) / T[5][i]);
    box_sum(curv, tmp, T[3], R, W, 2, 0.0f);
    box_sum(slope, tmp, T[4], R, W, 2, e);
    for (size_t i = 0; i < n; i++) F[6][i] = sqz(T[3][i] / T[4][i]);
    box_sum(dis, tmp, T[4], R, W, 2, 0.0f);
    for (size_t i = 0; i < n; i++) F[7][i] = sqz(T[4][i] / (T[3][i] * 0.25f + e));
    float *dh = T[0], *dv = T[1];
    LOOP {
        size_t i = I; float s = SG(i), cc = c[i];
        dh[i] = s * (cc - (MH(y, x) + 0.1875f * LH(y, x)));
        dv[i] = s * (cc - (MV(y, x) + 0.1875f * LV(y, x)));
    }
    for (size_t i = 0; i < n; i++) T[2][i] = fabsf(dh[i]) + fabsf(dv[i]);
    box_sum(T[2], tmp, T[3], R, W, 1, 0.0f);
    for (size_t i = 0; i < n; i++) F[4][i] = sqz(T[3][i] / T[5][i]);
    LOOP { size_t i = I; T[2][i] = fabsf(dh[i] - AT(dh, y, x + 1)) + fabsf(dh[i] - AT(dh, y, x - 1)); }
    box_sum(T[2], tmp, T[3], R, W, 2, 0.0f);  /* gh */
    LOOP { size_t i = I; T[2][i] = fabsf(dv[i] - AT(dv, y + 1, x)) + fabsf(dv[i] - AT(dv, y - 1, x)); }
    box_sum(T[2], tmp, T[4], R, W, 2, 0.0f);  /* gv */
    for (size_t i = 0; i < n; i++) F[3][i] = fabsf(T[3][i] - T[4][i]) / ((T[3][i] + T[4][i]) + e);
    for (size_t i = 0; i < n; i++) {
        float f[8], w = coef[0];
        for (int j = 0; j < 8; j++) f[j] = F[j][i];
        for (int j = 0; j < 8; j++) w += coef[1 + j] * f[j];
        if (ncoef > 9) {
            int t = 9;
            for (int a = 0; a < 8; a++)
                for (int b = a; b < 8; b++) w += coef[t++] * (f[a] * f[b]);
        }
        lapw[i] = clampf(w, 0.125f, 0.25f);
    }
#undef LOOP
#undef I
#undef MH
#undef MV
#undef LH
#undef LV
#undef SG
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

_FLAGS = ["-O2", "-ffp-contract=off"]
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
