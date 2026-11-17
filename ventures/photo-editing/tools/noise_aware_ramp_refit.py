"""Refit the noise-aware blend's ramps with luma scored: a grid sweep, then a tune-only fit scored on held.

``RAMPS`` (``shootflow.xtrans_demosaic``) were fitted on colour PSNR alone
(``eval/xtrans-noise-aware-blend-2026-11-16.md``). The luma note (``eval/noise-aware-planes-luma-2026-11-16.md``)
found luma gains more than colour and hinted that luma wants a little more bilinear. This tool asks:

1. Which (q_low, q_high) is best on tune for colour, for luma, and for both (the sum of the two gains)?
2. Does a **split** blend gain more: luma from one ramp, colour difference (R-G, B-G) from the shipped one?
   The split output is ``blend_C + (Y(blend_L) - Y(blend_C))`` added equally to R, G and B, so its luma is
   exactly ``blend_L``'s and its R-G and B-G are exactly ``blend_C``'s.

``sweep`` writes one row per tile x SNR x scenario with colour and luma PSNR for D (directional), B
(bilinear) and every ramp on the grid, and for the split arm on every grid luma ramp. Noise as
``tools/noise_aware_planes.py`` draws it (``equal``: on the white-balanced plane; ``wb``: on the raw scale
with the file's as-shot gains), the carry the developer ships (averaged pair, mean gain), no guard.

``fit`` reads the rows, picks ramps on ``tune`` only and reports them on ``held``.

Usage (from ``ventures/photo-editing``)::

    PYTHONPATH=src python tools/noise_aware_ramp_refit.py sweep [--bayer | --raf X-E1.raf] --cache /tmp/truths FILES... > rows.jsonl
    python tools/noise_aware_ramp_refit.py fit rows.jsonl [--json fit.jsonl]
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time

import numpy as np

LOWS = (0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0)
HIGHS = (0.8, 1.0, 1.2, 1.5, 2.0, 2.5, 3.0, 4.0)
GRID = [(lo, hi) for lo in LOWS for hi in HIGHS if hi > lo]
LUMA_W = np.array([0.2126, 0.7152, 0.0722])


def key(lo: float, hi: float) -> str:
    return f"{lo:g}-{hi:g}"


def split(blend_c: np.ndarray, blend_l: np.ndarray) -> np.ndarray:
    """``blend_C`` with its luma replaced by ``blend_L``'s (Rec. 709 weights, which sum to 1), so R-G and B-G
    stay ``blend_C``'s."""

    dy = (blend_l - blend_c) @ LUMA_W
    return blend_c + dy[..., None]


def sweep(argv) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--raf")
    ap.add_argument("--bayer", action="store_true")
    ap.add_argument("--snr", type=float, action="append", default=None)
    ap.add_argument("--tile", type=int, default=480)
    ap.add_argument("--crops", type=int, default=3)
    ap.add_argument("--cache")
    ap.add_argument("--scenario", action="append", default=None, choices=("equal", "wb"))
    args = ap.parse_args(argv)
    snrs = args.snr or [60.0, 25.0, 12.0]
    scenarios = args.scenario or ["equal", "wb"]

    import rawpy

    sys.path.insert(0, __file__.rsplit("/", 1)[0])
    import xtrans_demosaic_check as chk
    from noise_aware_planes import carries, draw, gains_of
    from xtrans_frame_choice import _truth, split_of, tiles

    from shootflow.xtrans_demosaic import RAMPS, blend, frame_measures

    if args.bayer:
        from shootflow.bayer_demosaic import directional

        pat = (0, 1, 1, 2)
    else:
        from shootflow.xtrans_demosaic import directional

        pat = chk._pattern(rawpy.imread(args.raf))
    shipped = RAMPS[2 if args.bayer else 6]
    for path in args.files:
        name = path.rsplit("/", 1)[-1]
        try:
            truth_full = _truth(path, args.cache)
            gains = gains_of(path)
        except Exception as exc:  # noqa: BLE001
            print(json.dumps({"file": name, "skipped": f"{type(exc).__name__}: {exc}"}), flush=True)
            continue
        for (ty, tx), truth in tiles(truth_full, args.tile, args.crops):
            clean = chk.mosaic(truth, pat)
            for snr in snrs:
                for sc in scenarios:
                    t0 = time.perf_counter()
                    seed = hash((name, ty, tx, snr)) & 0xFFFF
                    if sc == "equal":
                        c = chk.add_noise(clean, snr, seed=seed)
                        sig2 = (0.18 / snr) ** 2
                        model = (0.8 * sig2 / 0.18, 0.2 * sig2)
                    else:
                        c, raw_model = draw(clean, pat, gains, snr, ((1.0, 1.0),) * 3, seed)
                        model, _ = carries(raw_model, gains)
                    b = chk.ours_bilinear(c, pat)
                    d = directional(c, pat)
                    qb = frame_measures(c, pat, b, d, noise=model, blocks=True)["q_blocks"]
                    cps, lps, spl = {}, {}, {}
                    for name_, arr in (("D", d), ("B", b)):
                        s = chk.scores(arr, truth)
                        cps[name_], lps[name_] = s["cpsnr"], s["lpsnr"]
                    base = blend(b, d, qb, *shipped)
                    for lo, hi in GRID:
                        out = base if (lo, hi) == tuple(shipped) else blend(b, d, qb, lo, hi)
                        s = chk.scores(out, truth)
                        cps[key(lo, hi)], lps[key(lo, hi)] = s["cpsnr"], s["lpsnr"]
                        spl[key(lo, hi)] = chk.scores(split(base, out), truth)["cpsnr"]
                    print(json.dumps({
                        "layout": "bayer" if args.bayer else "xtrans", "file": name, "split": split_of(name),
                        "tile": [ty, tx], "snr": snr, "scenario": sc, "shipped": key(*shipped),
                        "cpsnr": cps, "lpsnr": lps, "split_cpsnr": spl, "s": round(time.perf_counter() - t0, 2),
                    }), flush=True)
    return 0


def _gains(rows, metric, arm, ref="D"):
    """Per-row gain over ``ref``; ``metric`` 'c', 'l', or 's' (split colour; its luma is the arm's own)."""

    if metric == "s":
        return np.array([r["split_cpsnr"][arm] - r["cpsnr"][ref] for r in rows])
    m = "cpsnr" if metric == "c" else "lpsnr"
    return np.array([r[m][arm] - r[m][ref] for r in rows])


def summary(g: np.ndarray) -> dict:
    return {"mean": round(float(g.mean()), 3), "worst": round(float(g.min()), 2),
            "worse_0.1": int((g < -0.1).sum()), "n": int(g.size)}


def finite_nonneg(text: str) -> float:
    value = float(text)
    if not math.isfinite(value) or value < 0:
        raise argparse.ArgumentTypeError(f"must be a finite number >= 0, got {text!r}")
    return value


def fit(argv) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("rows", nargs="+")
    ap.add_argument("--json")
    ap.add_argument("--max-worse", type=finite_nonneg, default=0.1, help="a tune tile may lose at most this (dB) in either metric")
    args = ap.parse_args(argv)
    rows = [json.loads(line) for p in args.rows for line in open(p) if line.strip()]
    rows = [r for r in rows if "cpsnr" in r]
    out = []
    for layout in sorted({r["layout"] for r in rows}):
        lr = [r for r in rows if r["layout"] == layout]
        shipped = lr[0]["shipped"]
        tune = [r for r in lr if r["split"] == "tune"]
        held = [r for r in lr if r["split"] == "held"]
        arms = [key(*g) for g in GRID]

        def ok(arm, metric_pair=("c", "l")):
            return all(_gains(tune, m, arm).min() >= -args.max_worse for m in metric_pair)

        picks = {
            "shipped": shipped,
            "colour": max(arms, key=lambda a: _gains(tune, "c", a).mean() if ok(a) else -9),
            "luma": max(arms, key=lambda a: _gains(tune, "l", a).mean() if ok(a) else -9),
            "joint": max(arms, key=lambda a: (_gains(tune, "c", a) + _gains(tune, "l", a)).mean() if ok(a) else -9),
            # split: colour stays the shipped ramp's; the luma ramp is picked on luma, its colour checked as split
            "split": max(arms, key=lambda a: _gains(tune, "l", a).mean() if ok(a, ("s", "l")) else -9),
        }
        print(f"## {layout}: {len(tune)} tune rows, {len(held)} held rows")
        for label, arm in picks.items():
            for setname, rs in (("tune", tune), ("held", held)):
                cm = "s" if label == "split" else "c"
                rec = {"layout": layout, "pick": label, "ramp": arm, "set": setname,
                       "colour": summary(_gains(rs, cm, arm)), "luma": summary(_gains(rs, "l", arm))}
                for sc in sorted({r["scenario"] for r in rs}):
                    for snr in sorted({r["snr"] for r in rs}):
                        sub = [r for r in rs if r["scenario"] == sc and r["snr"] == snr]
                        rec[f"{sc} snr {snr:g}"] = {"colour": round(float(_gains(sub, cm, arm).mean()), 3),
                                                    "luma": round(float(_gains(sub, "l", arm).mean()), 3)}
                out.append(rec)
                print(f"{label:8s} {arm:8s} {setname}: colour {rec['colour']}  luma {rec['luma']}")
        # the whole grid on held, for the README table's neighbourhood
        for arm in arms:
            out.append({"layout": layout, "grid": arm, "set": "held",
                        "colour": round(float(_gains(held, "c", arm).mean()), 3),
                        "luma": round(float(_gains(held, "l", arm).mean()), 3),
                        "tune_colour": round(float(_gains(tune, "c", arm).mean()), 3),
                        "tune_luma": round(float(_gains(tune, "l", arm).mean()), 3),
                        "tune_worst": round(float(min(_gains(tune, "c", arm).min(), _gains(tune, "l", arm).min())), 2)})
    if args.json:
        with open(args.json, "w") as f:
            for rec in out:
                f.write(json.dumps(rec) + "\n")
    return 0


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if not argv or argv[0] not in ("sweep", "fit"):
        print(__doc__)
        return 2
    return sweep(argv[1:]) if argv[0] == "sweep" else fit(argv[1:])


if __name__ == "__main__":
    sys.exit(main())
