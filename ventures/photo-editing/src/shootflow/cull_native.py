"""Optional C path for the cull's burst grouping (``shootflow.cull._group``), 2026-11-18.

``cull._linked_pairs_indexed`` is the Python reference: a chunk index finds the pairs of frames that
some pass could link, and only those reach the exact checks. On 10,000 frames that took 42 s, most of
it building and probing the indexes (eval/cull-grouping-index-2026-11-18.md). This module carries the
same index and the same exact rule as one C function, compiled with the system C compiler the first
time it is asked for and loaded through ``ctypes`` (the build and cache rules of
``shootflow.ljpeg_native``: ``$CC`` or ``cc``, ``$SHOOTFLOW_CACHE``, ``SHOOTFLOW_NATIVE=0`` turns it
off). With no compiler or a failed build ``linked_pairs()`` returns ``None`` and the Python path runs.

Nothing is tuned here. Every constant (the four passes' gates, limits and gains) and every lane table
(the crop centre, ``frame_analysis._PAN_PAIRS``, ``_FINE_PAIRS`` through ``_FINE_GRID``) is read from
``cull`` and ``frame_analysis`` at call time and handed to C, so the two paths cannot drift apart.
The answer is integer Hamming distances only, so the two paths agree exactly, not to a rounding:
``tests/test_cull_native.py`` compares the linked pairs with the all-pairs scan, and
``eval/cull-grouping-native-2026-11-18.md`` the groups on up to 20,000 real-photo frames.

How a pair is found (the Python index's rule, unchanged): two 64-bit hashes ``r`` bits apart differ
by at most ``r // 3`` bits in their closest third, so each third of a query hash is looked up with
every flip of up to that many of its bits. Each frame queries its whole hash (whole-frame table,
radius 8; zoom-window table, 6), its centre crop window (crop-window table, 6), its pan a-side windows
(one table per a window of the b windows it pairs with, 5) and its 49 grid windows (fine table, 5).
Every candidate pair then gets the full exact rule (``cull.burst_match``), so a pair found by one
pass is still linked by any other.
"""

from __future__ import annotations

import ctypes
import hashlib
import os
import subprocess
import sys
import tempfile
import threading
from array import array
from pathlib import Path
from typing import Sequence

C_SOURCE = r"""
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

/* One row per frame, ROW uint64 values: [whole, crops 0..24, fines 0..23, zooms 0..99], so the 49 grid
   windows (crops then fines, frame_analysis._FINE_GRID's order) sit side by side.
   flags per frame: bit 0 crops complete, bit 1 zooms complete, bit 2 fines complete (with crops). */
#define NCROP 25
#define NZOOM 100
#define NFINE 24
#define ROW (1 + NCROP + NZOOM + NFINE)
#define CROP0 1
#define ZOOM0 (1 + NCROP + NFINE)
#define GRID0 1 /* the 49 grid windows are crops then fines: row + 1 + k */

static inline int pc(uint64_t x) { return __builtin_popcountll(x); }

/* A table of (chunk value -> frame) for one third of the hashes inserted, hashed into buckets. */
typedef struct { uint32_t logb; uint32_t *start; uint32_t *key; int32_t *frame; } bucket_t;
typedef struct { int most; int shift[3]; uint64_t mask[3]; int bits[3]; bucket_t t[3]; } chunk_index;

static inline uint32_t slot(uint32_t key, uint32_t logb) { return (uint32_t)(key * 2654435761u) >> (32 - logb); }

static void ci_free(chunk_index *ci) {
    for (int c = 0; c < 3; c++) { free(ci->t[c].start); free(ci->t[c].key); free(ci->t[c].frame); }
}

/* Insert, for every frame f with (flags[f] & need) == need, the values row[f][pick[0..npick-1]].
   Returns 0, or -1 when memory runs out. */
static int ci_build(chunk_index *ci, int radius, long n, const uint64_t *rows, const uint8_t *flags, int need,
                    const int *pick, int npick) {
    memset(ci, 0, sizeof *ci);
    ci->most = radius / 3;
    int shift = 0;
    for (int c = 0; c < 3; c++) { /* cull._chunks(3): 21, 21, 22 bits */
        int bits = (64 - shift) / (3 - c);
        ci->shift[c] = shift; ci->bits[c] = bits; ci->mask[c] = (((uint64_t)1) << bits) - 1; shift += bits;
    }
    long m = 0;
    for (long f = 0; f < n; f++) if ((flags[f] & need) == need) m += npick;
    uint32_t logb = 1;
    while (((long)1 << logb) < m) logb++;
    for (int c = 0; c < 3; c++) {
        bucket_t *t = &ci->t[c];
        long nb = (long)1 << logb;
        t->logb = logb;
        t->start = calloc(nb + 1, sizeof *t->start);
        t->key = malloc((m ? m : 1) * sizeof *t->key);
        t->frame = malloc((m ? m : 1) * sizeof *t->frame);
        if (!t->start || !t->key || !t->frame) return -1;
        for (long f = 0; f < n; f++) {
            if ((flags[f] & need) != need) continue;
            for (int p = 0; p < npick; p++) {
                uint32_t k = (uint32_t)((rows[f * ROW + pick[p]] >> ci->shift[c]) & ci->mask[c]);
                t->start[slot(k, logb) + 1]++;
            }
        }
        for (long b = 0; b < nb; b++) t->start[b + 1] += t->start[b];
        uint32_t *fill = malloc(nb * sizeof *fill);
        if (!fill) return -1;
        memcpy(fill, t->start, nb * sizeof *fill);
        for (long f = 0; f < n; f++) {
            if ((flags[f] & need) != need) continue;
            for (int p = 0; p < npick; p++) {
                uint32_t k = (uint32_t)((rows[f * ROW + pick[p]] >> ci->shift[c]) & ci->mask[c]);
                uint32_t at = fill[slot(k, logb)]++;
                t->key[at] = k; t->frame[at] = (int32_t)f;
            }
        }
        free(fill);
    }
    return 0;
}

typedef struct { int32_t *stamp; int32_t *list; long count; int32_t q; } found_t;

static inline void hit(const bucket_t *t, uint32_t k, found_t *out) {
    uint32_t b = slot(k, t->logb);
    for (uint32_t e = t->start[b]; e < t->start[b + 1]; e++) {
        if (t->key[e] != k) continue;
        int32_t f = t->frame[e];
        if (out->stamp[f] != out->q) { out->stamp[f] = out->q; out->list[out->count++] = f; }
    }
}

/* Every frame with an inserted hash that may be within the radius of value (cull._ChunkIndex.near). */
static void ci_near(const chunk_index *ci, uint64_t value, found_t *out) {
    for (int c = 0; c < 3; c++) {
        const bucket_t *t = &ci->t[c];
        if (t->start[(long)1 << t->logb] == 0) return; /* empty table */
        uint32_t k = (uint32_t)((value >> ci->shift[c]) & ci->mask[c]);
        int bits = ci->bits[c];
        hit(t, k, out);
        if (ci->most >= 1) for (int a = 0; a < bits; a++) {
            hit(t, k ^ (1u << a), out);
            if (ci->most >= 2) for (int b = a + 1; b < bits; b++) hit(t, k ^ (1u << a) ^ (1u << b), out);
        }
    }
}

/* cfg: the constants of cull.py, in this order. */
enum { NEAR, CROP_GATE, CROP_MAX, CROP_GAIN, ZOOM_GATE, ZOOM_MAX, ZOOM_GAIN, PAN_GATE, PAN_MAX, PAN_GAIN,
       FINE_GATE, FINE_MAX, FINE_GAIN, CENTRE, NPAN, NFINE_LANES, NCFG };

static inline int min2(int a, int b) { return a < b ? a : b; }

/* cull.burst_match for frames i < j (the earlier frame is on the pan and fine lanes' a side). */
static int linked(const uint64_t *rows, const uint8_t *flags, long i, long j, const int *cfg,
                  const int *pan_a, const int *pan_b, const int *fine_a, const int *fine_b) {
    const uint64_t *a = rows + i * ROW, *b = rows + j * ROW;
    int d = pc(a[0] ^ b[0]);
    if (d <= cfg[NEAR]) return 1;
    if ((flags[i] & 1) && (flags[j] & 1)) {
        int cl = d <= cfg[CROP_GATE] ? min2(cfg[CROP_MAX], d - cfg[CROP_GAIN]) : -1;
        int pl = d <= cfg[PAN_GATE] ? min2(cfg[PAN_MAX], d - cfg[PAN_GAIN]) : -1;
        if (cl > 63) cl = 63;
        if (pl > 63) pl = 63;
        if (cl >= 0) {
            uint64_t ca = a[CROP0 + cfg[CENTRE]], cb = b[CROP0 + cfg[CENTRE]];
            for (int k = 0; k < NCROP; k++)
                if (pc(ca ^ b[CROP0 + k]) <= cl || pc(a[CROP0 + k] ^ cb) <= cl) return 1;
        }
        if (pl >= 0)
            for (int k = 0; k < cfg[NPAN]; k++) if (pc(a[CROP0 + pan_a[k]] ^ b[CROP0 + pan_b[k]]) <= pl) return 1;
    }
    if ((flags[i] & 2) && (flags[j] & 2) && d <= cfg[ZOOM_GATE]) {
        int zl = min2(cfg[ZOOM_MAX], d - cfg[ZOOM_GAIN]);
        if (zl >= 0)
            for (int k = 0; k < NZOOM; k++)
                if (pc(b[0] ^ a[ZOOM0 + k]) <= zl || pc(a[0] ^ b[ZOOM0 + k]) <= zl) return 1;
    }
    if ((flags[i] & 4) && (flags[j] & 4) && d <= cfg[FINE_GATE]) {
        int fl = min2(cfg[FINE_MAX], d - cfg[FINE_GAIN]);
        if (fl > 63) fl = 63;
        if (fl >= 0)
            for (int k = 0; k < cfg[NFINE_LANES]; k++)
                if (pc(a[GRID0 + fine_a[k]] ^ b[GRID0 + fine_b[k]]) <= fl) return 1;
    }
    return 0;
}

static int by_pair(const void *x, const void *y) {
    const int32_t *a = x, *b = y;
    if (a[0] != b[0]) return a[0] < b[0] ? -1 : 1;
    return (a[1] > b[1]) - (a[1] < b[1]);
}

/* Every linked pair (i < j) of the n frames, once each, written to *out as 2 * (*count) int32 (caller
   frees with shootflow_cull_free). pan_a/pan_b: _PAN_PAIRS (crop window indices); fine_a/fine_b:
   _FINE_PAIRS as indices into the 49 grid windows (crops then fines). Returns 0, or -1 when memory runs
   out. Runs without the GIL (ctypes). */
long shootflow_cull_pairs(long n, const uint64_t *rows, const uint8_t *flags, const int *cfg,
                          const int *pan_a, const int *pan_b, const int *fine_a, const int *fine_b,
                          int32_t **out, long *count) {
    *out = NULL; *count = 0;
    int whole_pick[1] = {0}, zoom_pick[NZOOM], crop_pick[NCROP], grid_pick[NCROP + NFINE];
    for (int k = 0; k < NZOOM; k++) zoom_pick[k] = ZOOM0 + k;
    for (int k = 0; k < NCROP; k++) crop_pick[k] = CROP0 + k;
    for (int k = 0; k < NCROP + NFINE; k++) grid_pick[k] = GRID0 + k;
    /* Pan tables: one per distinct a window, holding the b windows of its lanes (cull._candidate_pairs). */
    int npan = cfg[NPAN], pan_keys[NCROP], pan_nb[NCROP], pan_bs[NCROP][NCROP], ntab = 0;
    for (int k = 0; k < npan; k++) {
        int t = 0;
        while (t < ntab && pan_keys[t] != pan_a[k]) t++;
        if (t == ntab) { pan_keys[ntab] = pan_a[k]; pan_nb[ntab] = 0; ntab++; }
        int seen = 0;
        for (int u = 0; u < pan_nb[t]; u++) seen |= pan_bs[t][u] == CROP0 + pan_b[k];
        if (!seen) pan_bs[t][pan_nb[t]++] = CROP0 + pan_b[k];
    }
    chunk_index whole, crop, zoom, fine, pan[NCROP];
    int rc = 0, built = 0;
    memset(pan, 0, sizeof pan);
    if (ci_build(&whole, cfg[NEAR], n, rows, flags, 0, whole_pick, 1) ||
        ci_build(&crop, cfg[CROP_MAX], n, rows, flags, 1, crop_pick, NCROP) ||
        ci_build(&zoom, cfg[ZOOM_MAX], n, rows, flags, 2, zoom_pick, NZOOM) ||
        ci_build(&fine, cfg[FINE_MAX], n, rows, flags, 5, grid_pick, NCROP + NFINE)) rc = -1;
    for (int t = 0; t < ntab && !rc; t++, built++)
        if (ci_build(&pan[t], cfg[PAN_MAX], n, rows, flags, 1, pan_bs[t], pan_nb[t])) rc = -1;
    found_t fd = {malloc((n ? n : 1) * sizeof(int32_t)), malloc((n ? n : 1) * sizeof(int32_t)), 0, 0};
    long cap = 1024, used = 0;
    int32_t *pairs = malloc(cap * 2 * sizeof *pairs);
    if (!fd.stamp || !fd.list || !pairs) rc = -1;
    if (!rc) for (long f = 0; f < n; f++) fd.stamp[f] = -1;
    for (long i = 0; i < n && !rc; i++) {
        const uint64_t *r = rows + i * ROW;
        fd.q = (int32_t)i; fd.count = 0;
        ci_near(&whole, r[0], &fd);
        ci_near(&zoom, r[0], &fd);
        if (flags[i] & 1) {
            ci_near(&crop, r[CROP0 + cfg[CENTRE]], &fd);
            for (int t = 0; t < ntab; t++) ci_near(&pan[t], r[CROP0 + pan_keys[t]], &fd);
        }
        if ((flags[i] & 5) == 5) for (int k = 0; k < NCROP + NFINE; k++) ci_near(&fine, r[GRID0 + k], &fd);
        for (long e = 0; e < fd.count; e++) {
            long j = fd.list[e];
            if (j == i) continue;
            /* Crop and zoom lookups are one-sided and pan lanes ordered, so a pair may be found from
               either frame or both; it is checked as (earlier, later) each time, and the output is sorted and
               made unique below. */
            long lo = j < i ? j : i, hi = j < i ? i : j;
            if (!linked(rows, flags, lo, hi, cfg, pan_a, pan_b, fine_a, fine_b)) continue;
            if (used == cap) {
                int32_t *grown = realloc(pairs, cap * 4 * sizeof *pairs);
                if (!grown) { rc = -1; break; }
                pairs = grown; cap *= 2;
            }
            pairs[2 * used] = (int32_t)lo; pairs[2 * used + 1] = (int32_t)hi; used++;
        }
    }
    ci_free(&whole); ci_free(&crop); ci_free(&zoom); ci_free(&fine);
    for (int t = 0; t < built; t++) ci_free(&pan[t]);
    free(fd.stamp); free(fd.list);
    if (rc) { free(pairs); return -1; }
    qsort(pairs, used, 2 * sizeof *pairs, by_pair);
    long kept = 0;
    for (long e = 0; e < used; e++) {
        if (kept && pairs[2 * kept - 2] == pairs[2 * e] && pairs[2 * kept - 1] == pairs[2 * e + 1]) continue;
        pairs[2 * kept] = pairs[2 * e]; pairs[2 * kept + 1] = pairs[2 * e + 1]; kept++;
    }
    *out = pairs; *count = kept;
    return 0;
}

void shootflow_cull_free(int32_t *p) { free(p); }
"""

_STATE: dict[str, object] = {}
_LOCK = threading.Lock()
_FLAGS = ["-O2"]


def _load():
    if os.environ.get("SHOOTFLOW_NATIVE", "1") == "0" or sys.platform == "win32":
        return None
    from shootflow.ljpeg_native import _cache_dir, _compiler

    digest = hashlib.sha256((C_SOURCE + " ".join(_FLAGS)).encode()).hexdigest()[:16]
    suffix = ".dylib" if sys.platform == "darwin" else ".so"
    target = _cache_dir() / f"cull-pairs-{digest}{suffix}"
    try:
        if not target.exists():
            cc = _compiler()
            if cc is None:
                return None
            target.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix="shootflow-cc-") as tmp:
                src = Path(tmp) / "cull.c"
                src.write_text(C_SOURCE)
                built = Path(tmp) / target.name
                flags = _FLAGS + (["-dynamiclib"] if sys.platform == "darwin" else ["-shared", "-fPIC"])
                try:
                    subprocess.run([cc, *flags, "-o", str(built), str(src)], check=True, capture_output=True, timeout=60)
                except (OSError, subprocess.SubprocessError):
                    return None
                os.replace(built, target)  # atomic, so a parallel build never loads half a file
        lib = ctypes.CDLL(str(target))
    except OSError:
        return None
    fn = lib.shootflow_cull_pairs
    fn.restype = ctypes.c_long
    P = ctypes.c_void_p
    fn.argtypes = [ctypes.c_long, P, P, P, P, P, P, P, ctypes.POINTER(ctypes.POINTER(ctypes.c_int32)),
                   ctypes.POINTER(ctypes.c_long)]
    free = lib.shootflow_cull_free
    free.restype = None
    free.argtypes = [ctypes.POINTER(ctypes.c_int32)]
    return fn, free


def functions():
    """The loaded C functions (pairs, free), or None. Built and loaded once per process."""

    if "fn" not in _STATE:
        with _LOCK:
            if "fn" not in _STATE:
                _STATE["fn"] = _load()
    return _STATE["fn"]


def available() -> bool:
    return functions() is not None


def _config() -> tuple[array, array, array, array, array]:
    from shootflow import cull
    from shootflow.frame_analysis import _CROP_CENTRE, _FINE_GRID, _FINE_PAIRS, _PAN_PAIRS

    cfg = array("i", [
        cull.NEAR_DUPLICATE_MAX_DISTANCE,
        cull.CROP_CANDIDATE_MAX_DISTANCE, cull.CROP_MAX_DISTANCE, cull.CROP_MIN_GAIN,
        cull.ZOOM_CANDIDATE_MAX_DISTANCE, cull.ZOOM_MAX_DISTANCE, cull.ZOOM_MIN_GAIN,
        cull.PAN_CANDIDATE_MAX_DISTANCE, cull.PAN_MAX_DISTANCE, cull.PAN_MIN_GAIN,
        cull.FINE_CANDIDATE_MAX_DISTANCE, cull.FINE_MAX_DISTANCE, cull.FINE_MIN_GAIN,
        _CROP_CENTRE, len(_PAN_PAIRS), len(_FINE_PAIRS),
    ])
    # The C index takes radius // 3 flips per chunk and supports at most 2, as cull._flips does.
    if max(cfg[0], cfg[2], cfg[5], cfg[8], cfg[11]) >= 9:
        raise ValueError("a radius of 9 or more needs 3 flips per chunk")
    return (
        cfg,
        array("i", [a for a, _ in _PAN_PAIRS]), array("i", [b for _, b in _PAN_PAIRS]),
        array("i", [_FINE_GRID[a] for a, _ in _FINE_PAIRS]), array("i", [_FINE_GRID[b] for _, b in _FINE_PAIRS]),
    )


def linked_pairs(
    hashes: Sequence[int], crops: Sequence[Sequence[int]], zooms: Sequence[Sequence[int]],
    fines: Sequence[Sequence[int]],
) -> list[tuple[int, int]] | None:
    """Every linked pair (i < j), sorted: the pairs of ``cull._linked_pairs_all``. None without the C path.

    ``crops``, ``zooms`` and ``fines`` are each frame's parsed window hashes (ints); a frame whose list is
    not complete (25, 100, 24) takes no part in that pass, as in the Python checks.
    """

    loaded = functions()
    if loaded is None:
        return None
    fn, free = loaded
    from shootflow.frame_analysis import CROP_STEPS, ZOOM_SCALES, ZOOM_STEPS, _FINE_EXTRA

    ncrop, nzoom, nfine = CROP_STEPS * CROP_STEPS, len(ZOOM_SCALES) * ZOOM_STEPS * ZOOM_STEPS, len(_FINE_EXTRA)
    if (ncrop, nzoom, nfine) != (25, 100, 24):
        return None  # the C rows are laid out for these counts
    n = len(hashes)
    rows = array("Q", bytes(8 * (1 + ncrop + nzoom + nfine) * n))
    flags = bytearray(n)
    width = 1 + ncrop + nzoom + nfine
    for i in range(n):
        base = i * width
        rows[base] = hashes[i]
        flag = 0
        if len(crops[i]) == ncrop:
            rows[base + 1:base + 1 + ncrop] = array("Q", crops[i])
            flag |= 1
            if len(fines[i]) == nfine:
                rows[base + 1 + ncrop:base + 1 + ncrop + nfine] = array("Q", fines[i])
                flag |= 4
        if len(zooms[i]) == nzoom:
            rows[base + 1 + ncrop + nfine:base + width] = array("Q", zooms[i])
            flag |= 2
        flags[i] = flag
    cfg, pan_a, pan_b, fine_a, fine_b = _config()
    flag_buf = (ctypes.c_uint8 * max(1, n)).from_buffer(flags if n else bytearray(1))

    def addr(buf: array) -> int:
        return buf.buffer_info()[0]

    out = ctypes.POINTER(ctypes.c_int32)()
    count = ctypes.c_long(0)
    rc = fn(n, addr(rows) if n else None, ctypes.addressof(flag_buf), addr(cfg), addr(pan_a), addr(pan_b),
            addr(fine_a), addr(fine_b), ctypes.byref(out), ctypes.byref(count))
    if rc != 0:
        return None
    try:
        flat = out[:2 * count.value]
    finally:
        free(out)
    return list(zip(flat[0::2], flat[1::2]))
