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
"""

_STATE: dict[str, object] = {}
_LOCK = threading.Lock()
_FLAGS = ["-O2", "-ffp-contract=off"]  # no -ffast-math: IEEE float64 as numpy does it


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
    return resid, med


def functions():
    """The loaded C functions (residual rows, block median), or None. Built and loaded once per process."""

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
