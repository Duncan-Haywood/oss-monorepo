"""Does the X-Trans demosaic need a per-frame (or per-region) choice? Measure it on many borrowed scenes.

The 2026-11-16 held-out check (``eval/xtrans-fresh-truths-2026-11-16.md``) found the directional
default ahead of LibRaw's three-pass on most truths, but on the smoothest scene (Sony A7 IV) plain
bilinear won luma noise-free and colour at SNR 25: where a scene has little detail at the sampling
limit, edge-keeping only spends noise. It asked for "a frame-level measure that predicts which,
checked on held-out truths". This tool answers it.

For every raw file given (any camera LibRaw reads), the frame is rendered, binned 4 x 4 and cut into
``--crops`` tiles of ``--tile`` pixels (the truths, as ``xtrans_demosaic_check --truth-from`` makes
them), mosaicked with the RAF's X-Trans layout, given Poisson-Gaussian noise at each ``--snr`` (0 =
noise-free), and demosaiced twice: bilinear (B) and the directional default (D). Then scored:

* the **oracle**: the best fixed blend ``a * D + (1 - a) * B`` for that tile, a in 0..1 by 0.05,
  which bounds what any per-frame choice could gain over the default (a = 1);
* **measures** computed from the noisy mosaic alone (no truth): ``sigma``, a robust noise estimate
  (the median absolute leave-one-out residual of each sensel against its same-colour 5 x 5
  neighbours, fitted as shot plus read noise to the quietest blocks at each brightness), ``detail``, the RMS of D - B (what
  edge-keeping adds), and their ratio ``q = detail / sigma``;
* the **local blend** ``xtrans_demosaic.blend`` (per 24 x 24 block, a from that block's own q,
  0 at q_low and 1 at q_high), on a grid of (q_low, q_high), with the noise either estimated from
  the mosaic ("est") or known ("known": the model the noise was drawn from, as a DNG NoiseProfile or
  a camera profile would give it), which is what a per-region choice would ship.

``--bayer`` runs the same check on an RGGB layout with ``bayer_demosaic.directional``.

Rows (one per tile and noise level) are JSON lines. ``--split`` assigns each file to "tune" or
"held" by a hash of its name, so a rule fitted on one half can be scored on the other.

Usage (from ``ventures/photo-editing``)::

    PYTHONPATH=src python tools/xtrans_frame_choice.py --raf "$M/raf/Fujifilm X-E1.raf" \
        $M/arw/*.ARW $M/nef/*.nef ... > rows.jsonl
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time

import numpy as np

sys.path.insert(0, __file__.rsplit("/", 1)[0])
import xtrans_demosaic_check as chk  # noqa: E402

ALPHAS = np.round(np.arange(0.0, 1.0001, 0.05), 2)
LOCAL_LOWS = (0.4, 0.6, 0.8, 1.0, 1.2, 1.6)
LOCAL_WIDTHS = (0.4, 0.8, 1.6, 3.2)


def _truth(path: str, cache: str | None) -> np.ndarray:
    if not cache:  # float32 either way, so a cached run gives the same rows
        return chk.binned_truth(path).astype(np.float32).astype(np.float64)
    import os

    key = os.path.join(cache, hashlib.sha1(os.path.abspath(path).encode()).hexdigest()[:16] + ".npy")
    if os.path.exists(key):
        return np.load(key).astype(np.float64)
    os.makedirs(cache, exist_ok=True)
    t = chk.binned_truth(path).astype(np.float32)
    np.save(key + ".tmp.npy", t)
    os.replace(key + ".tmp.npy", key)  # atomic: parallel runs share the cache
    return t.astype(np.float64)


def split_of(name: str) -> str:
    return "tune" if int(hashlib.sha1(name.encode()).hexdigest(), 16) % 2 == 0 else "held"


def tiles(truth: np.ndarray, size: int, count: int):
    """Up to ``count`` non-overlapping size x size tiles from the frame, centre first, then corners."""

    h, w, _ = truth.shape
    size = min(size, h // 6 * 6, w // 6 * 6)
    spots = [((h - size) // 2, (w - size) // 2), (0, 0), (0, w - size), (h - size, 0), (h - size, w - size)]
    seen, out = [], []
    for y, x in spots:
        y, x = y // 6 * 6, x // 6 * 6
        if any(abs(y - sy) < size and abs(x - sx) < size for sy, sx in seen):
            continue
        seen.append((y, x))
        out.append(((y, x), truth[y : y + size, x : x + size].copy()))
        if len(out) == count:
            break
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("files", nargs="+", help="raw files whose scenes become truths")
    ap.add_argument("--raf", help="an X-Trans RAF whose layout is borrowed")
    ap.add_argument(
        "--bayer", action="store_true",
        help="use an RGGB Bayer layout and bayer_demosaic.directional instead of X-Trans (no RAF needed)",
    )
    ap.add_argument("--snr", type=float, action="append", default=None, help="noise levels (0 = none; repeatable)")
    ap.add_argument("--tile", type=int, default=480)
    ap.add_argument("--crops", type=int, default=3)
    ap.add_argument("--cache", help="directory to keep each file's binned truth in (.npy), so a second run skips LibRaw")
    args = ap.parse_args(argv)
    snrs = args.snr if args.snr is not None else [0.0, 60.0, 25.0, 12.0]

    import rawpy

    from shootflow.xtrans_demosaic import blend, frame_measures

    if args.bayer:
        from shootflow.bayer_demosaic import directional

        pat = (0, 1, 1, 2)
    else:
        from shootflow.xtrans_demosaic import directional

        if not args.raf:
            ap.error("--raf is required without --bayer")
        pat = chk._pattern(rawpy.imread(args.raf))
    for path in args.files:
        name = path.rsplit("/", 1)[-1]
        try:
            truth_full = _truth(path, args.cache)
        except Exception as exc:  # noqa: BLE001 - a file LibRaw cannot read is reported and skipped
            print(json.dumps({"file": name, "skipped": f"{type(exc).__name__}: {exc}"}), flush=True)
            continue
        for (ty, tx), truth in tiles(truth_full, args.tile, args.crops):
            clean = chk.mosaic(truth, pat)
            for snr in snrs:
                t0 = time.perf_counter()
                c = chk.add_noise(clean, snr, seed=hash((name, ty, tx)) & 0xFFFF) if snr else clean
                b = chk.ours_bilinear(c, pat)
                d = directional(c, pat)
                m = frame_measures(c, pat, b, d, blocks=True)
                sig2 = (0.18 / snr) ** 2 if snr else 0.0  # the noise add_noise draws: 80% shot, 20% read at 18% grey
                mk = frame_measures(c, pat, b, d, noise=(0.8 * sig2 / 0.18, 0.2 * sig2 + 1e-10), blocks=True)
                oracle = []
                for a in ALPHAS:
                    s = chk.scores(a * d + (1 - a) * b, truth)
                    oracle.append((float(a), s["cpsnr"], s["lpsnr"]))
                best = max(oracle, key=lambda r: r[1])
                local = {
                    f"{src} {lo:g}-{lo + wd:g}": chk.scores(blend(b, d, mm["q_blocks"], lo, lo + wd), truth)["cpsnr"]
                    for src, mm in (("est", m), ("known", mk))
                    for lo in LOCAL_LOWS
                    for wd in LOCAL_WIDTHS
                }
                row = {
                    "layout": "bayer" if args.bayer else "xtrans", "file": name, "split": split_of(name), "tile": [ty, tx], "snr": snr,
                    **{k: round(v, 6) for k, v in m.items() if k != "q_blocks"},
                    "known": {k: round(v, 6) for k, v in mk.items() if k != "q_blocks"},
                    "default": {"cpsnr": oracle[-1][1], "lpsnr": oracle[-1][2]},
                    "bilinear": {"cpsnr": oracle[0][1], "lpsnr": oracle[0][2]},
                    "oracle": {"a": best[0], "cpsnr": best[1], "lpsnr": best[2]},
                    "blend_cpsnr": {f"{a:.2f}": cp for a, cp, _ in oracle},
                    "local": local,
                    "s": round(time.perf_counter() - t0, 2),
                }
                print(json.dumps(row), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
