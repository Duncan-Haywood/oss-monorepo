"""The noise-aware demosaic with no NoiseProfile: a noise model read from the frame itself, scaled.

``--demosaic noise-aware`` needs the sensor's (shot, read) noise model. A DNG may carry one (NoiseProfile); a
raw read directly (ARW, NEF, CR2, RW2, ORF, PEF, SRW, RAF, ...) does not, so the developer fell back to the
directional demosaic. ``xtrans_demosaic.estimate_noise`` fits the model from the mosaic alone, but texture adds
to every block's spread, so on a detailed frame it reads high, and an overstated model costs dB (the docstring
of ``noise_aware``: "lost up to 5 dB on held-out tiles"). An understated one only moves the blend toward the
directional default. So the question is how far to scale the estimate down, and whether the guard helps.

Arms per tile x SNR x scenario (noise drawn as ``tools/noise_aware_ramp_refit.py`` draws it):

- ``D``: the directional demosaic (what ships without a profile);
- ``true``: the blend with the true model, carried as the developer carries a profile (the oracle);
- ``fit@s``: the blend with ``estimate_noise`` (one pair, white-balanced plane) times s^2 (s scales sigma);
- ``planes@s``: the same fit per colour (``_colour_block_spread`` + ``_noise_model``), each pair times s^2;
- ``guard@s``: ``fit@s`` through ``guard_profile`` (capped at 1.25x what the cleanest bin shows).

All arms use the shipped ramps (``RAMPS`` colour, ``LUMA_RAMPS`` luma). SNR 200 is in the default set as a near-
clean case: there the estimate is mostly texture, and the blend must not soften detail.

Usage (from ``ventures/photo-editing``)::

    PYTHONPATH=src python tools/noise_aware_estimated.py sweep [--bayer | --raf X-E1.raf] --cache /tmp/truths FILES... > rows.jsonl
    python tools/noise_aware_estimated.py fit rows.jsonl [--json fit.jsonl]
    python tools/noise_aware_estimated.py bucket --grain grain.jsonl rows.jsonl   # by added / scene noise

``bucket`` splits rows by the added noise's sigma at 18% grey over the clean tile's own in-frame reading
(``tools/noise_estimator_accuracy.py --clean``, ``haar2``): under 1 the reference's finest texture is louder
than the noise drawn on it, and no in-frame estimator can tell the two apart.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import time

import numpy as np

SCALES = (0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.25)


def seed_of(*parts) -> int:
    return int(hashlib.sha1(repr(parts).encode()).hexdigest()[:8], 16)


def plane_estimate(c, pat) -> np.ndarray:
    """``estimate_noise`` per colour: (3, 2) (shot, read) rows R, G, B."""

    from shootflow.xtrans_demosaic import _colour_block_spread, _noise_model, _residual

    resid = _residual(c, pat)
    out = np.zeros((3, 2))
    for k in range(3):
        lv, sp = _colour_block_spread(c, pat, k, resid)
        ok = np.isfinite(lv) & np.isfinite(sp)
        out[k] = _noise_model(lv[ok], sp[ok])
    return out


def arms_for(c, pat, b, d, true_model, scales=SCALES, pcts=None, pca=False) -> dict:
    """Every arm's output (h, w, 3) for one noisy plane ``c``. With ``pcts`` (spread percentiles), only the
    ``fit`` and ``guard`` families, once per percentile, named ``fitP@s`` and ``guardP@s``. With ``pca``, the
    morning's ``frame_noise`` (``ship``: block spread, ``estimator="spread"``) and the patch-PCA estimate (``shootflow.noise_pca``) times s^2, bare
    (``pca@s``) and through ``guard_profile`` (``pcaguard@s``)."""

    from shootflow.xtrans_demosaic import estimate_noise, frame_noise, guard_profile, noise_aware

    out = {"D": d, "true": noise_aware(c, pat, bilinear=b, directional_out=d, noise=true_model)}
    if pca:
        from shootflow.noise_pca import estimate_noise_pca

        out["ship"] = noise_aware(c, pat, bilinear=b, directional_out=d, noise=frame_noise(c, pat, estimator="spread"))
        est = np.array(estimate_noise_pca(c, pat))
        for s in scales:
            f = tuple(est * s * s)
            out[f"pca@{s:g}"] = noise_aware(c, pat, bilinear=b, directional_out=d, noise=f)
            g, _ = guard_profile(c, pat, f)
            out[f"pcaguard@{s:g}"] = noise_aware(c, pat, bilinear=b, directional_out=d, noise=g)
        return out
    if pcts:
        for p in pcts:
            fit = np.array(estimate_noise(c, pat, pct=p))
            for s in scales:
                f = tuple(fit * s * s)
                out[f"fit{p:g}@{s:g}"] = noise_aware(c, pat, bilinear=b, directional_out=d, noise=f)
                g, _ = guard_profile(c, pat, f)
                out[f"guard{p:g}@{s:g}"] = noise_aware(c, pat, bilinear=b, directional_out=d, noise=g)
        return out
    fit = np.array(estimate_noise(c, pat))
    planes = plane_estimate(c, pat)
    for s in scales:
        f = tuple(fit * s * s)
        out[f"fit@{s:g}"] = noise_aware(c, pat, bilinear=b, directional_out=d, noise=f)
        out[f"planes@{s:g}"] = noise_aware(c, pat, bilinear=b, directional_out=d, noise=planes * s * s)
        g, _ = guard_profile(c, pat, f)
        out[f"guard@{s:g}"] = noise_aware(c, pat, bilinear=b, directional_out=d, noise=g)
    return out


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
    ap.add_argument("--pcts", help="comma-separated spread percentiles: fitP@s and guardP@s arms only")
    ap.add_argument("--scales", help="comma-separated sigma scales (default: SCALES)")
    ap.add_argument("--pca", action="store_true", help="arms D, true, ship, pca@s, pcaguard@s only")
    args = ap.parse_args(argv)
    snrs = args.snr or [200.0, 60.0, 25.0, 12.0]
    pcts = [float(x) for x in args.pcts.split(",")] if args.pcts else None
    scales = tuple(float(x) for x in args.scales.split(",")) if args.scales else SCALES
    scenarios = args.scenario or ["equal", "wb"]

    import rawpy

    sys.path.insert(0, __file__.rsplit("/", 1)[0])
    import xtrans_demosaic_check as chk
    from noise_aware_planes import carries, draw, gains_of
    from xtrans_frame_choice import _truth, split_of, tiles

    if args.bayer:
        from shootflow.bayer_demosaic import directional

        pat = (0, 1, 1, 2)
    else:
        from shootflow.xtrans_demosaic import directional

        pat = chk._pattern(rawpy.imread(args.raf))
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
                    seed = seed_of(name, ty, tx, snr, sc)
                    if sc == "equal":
                        c = chk.add_noise(clean, snr, seed=seed)
                        sig2 = (0.18 / snr) ** 2
                        model = (0.8 * sig2 / 0.18, 0.2 * sig2)
                    else:
                        c, raw_model = draw(clean, pat, gains, snr, ((1.0, 1.0),) * 3, seed)
                        model, _ = carries(raw_model, gains)
                    b = chk.ours_bilinear(c, pat)
                    d = directional(c, pat)
                    cps, lps = {}, {}
                    for arm, arr in arms_for(c, pat, b, d, model, scales, pcts, args.pca).items():
                        s = chk.scores(arr, truth)
                        cps[arm], lps[arm] = s["cpsnr"], s["lpsnr"]
                    print(json.dumps({
                        "layout": "bayer" if args.bayer else "xtrans", "file": name, "split": split_of(name),
                        "tile": [ty, tx], "snr": snr, "scenario": sc, "cpsnr": cps, "lpsnr": lps,
                        "s": round(time.perf_counter() - t0, 2),
                    }), flush=True)
    return 0


def gains(rows, metric: str, arm: str, ref: str = "D") -> np.ndarray:
    m = "cpsnr" if metric == "c" else "lpsnr"
    return np.array([r[m][arm] - r[m][ref] for r in rows])


def finite_nonneg(text: str) -> float:
    value = float(text)
    if not math.isfinite(value) or value < 0:
        raise argparse.ArgumentTypeError(f"must be a finite number >= 0, got {text!r}")
    return value


def summary(g: np.ndarray) -> dict:
    return {"mean": round(float(g.mean()), 3), "worst": round(float(g.min()), 2),
            "worse_0.1": int((g < -0.1).sum()), "n": int(g.size)}


def fit(argv) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("rows", nargs="+")
    ap.add_argument("--json")
    ap.add_argument("--max-worse", type=finite_nonneg, default=0.1, help="a tune row may lose at most this (dB) vs D, either metric")
    args = ap.parse_args(argv)
    rows = [json.loads(line) for p in args.rows for line in open(p) if line.strip()]
    rows = [r for r in rows if "cpsnr" in r]
    out = []
    for layout in sorted({r["layout"] for r in rows}):
        lr = [r for r in rows if r["layout"] == layout]
        tune = [r for r in lr if r["split"] == "tune"]
        held = [r for r in lr if r["split"] == "held"]
        arms = [a for a in lr[0]["cpsnr"] if a != "D"]

        def ok(arm):
            return all(gains(tune, m, arm).min() >= -args.max_worse for m in ("c", "l"))

        def score(arm):
            return (gains(tune, "c", arm) + gains(tune, "l", arm)).mean()

        picks = {"true": "true"}
        fams = sorted({a.split("@")[0] for a in arms if "@" in a})
        for fam in fams:
            fam_arms = [a for a in arms if a.split("@")[0] == fam]
            safe = [a for a in fam_arms if ok(a)]
            picks[fam] = max(safe, key=score) if safe else None
        print(f"## {layout}: {len(tune)} tune rows, {len(held)} held rows")
        for label, arm in picks.items():
            if arm is None:
                print(f"{label:7s} no arm keeps every tune row within {args.max_worse} dB of D")
                continue
            for setname, rs in (("tune", tune), ("held", held)):
                rec = {"layout": layout, "pick": label, "arm": arm, "set": setname,
                       "colour": summary(gains(rs, "c", arm)), "luma": summary(gains(rs, "l", arm))}
                for sc in sorted({r["scenario"] for r in rs}):
                    for snr in sorted({r["snr"] for r in rs}):
                        sub = [r for r in rs if r["scenario"] == sc and r["snr"] == snr]
                        rec[f"{sc} snr {snr:g}"] = {"colour": round(float(gains(sub, "c", arm).mean()), 3),
                                                    "luma": round(float(gains(sub, "l", arm).mean()), 3),
                                                    "worst": round(float(min(gains(sub, "c", arm).min(), gains(sub, "l", arm).min())), 2)}
                out.append(rec)
                print(f"{label:7s} {arm:12s} {setname}: colour {rec['colour']}  luma {rec['luma']}")
        for arm in arms:  # every arm on both sets, for the write-up's table
            rec = {"layout": layout, "arm": arm}
            for setname, rs in (("tune", tune), ("held", held)):
                for m, lab in (("c", "colour"), ("l", "luma")):
                    g = gains(rs, m, arm)
                    rec[f"{setname}_{lab}"] = round(float(g.mean()), 3)
                    rec[f"{setname}_{lab}_worst"] = round(float(g.min()), 2)
                    rec[f"{setname}_{lab}_worse_0.1"] = int((g < -0.1).sum())
            out.append(rec)
    if args.json:
        with open(args.json, "w") as f:
            for rec in out:
                f.write(json.dumps(rec) + "\n")
    return 0


BUCKETS = ((0.0, 1.0, "<1"), (1.0, 2.0, "1-2"), (2.0, 4.0, "2-4"), (4.0, float("inf"), ">=4"))


def bucket(argv) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("rows", nargs="+")
    ap.add_argument("--grain", required=True, help="tools/noise_estimator_accuracy.py --clean rows")
    ap.add_argument("--key", default="haar2")
    ap.add_argument("--json")
    args = ap.parse_args(argv)
    grain = {}
    for line in open(args.grain):
        g = json.loads(line)
        if args.key in g:
            grain[(g["file"], tuple(g["tile"]))] = g[args.key] / 1000.0  # stored as sigma x 1000
    rows = [json.loads(line) for p in args.rows for line in open(p) if line.strip()]
    rows = [r for r in rows if "cpsnr" in r and (r["file"], tuple(r["tile"])) in grain]
    out = []
    for layout in sorted({r["layout"] for r in rows}):
        arms = [a for a in rows[0]["cpsnr"] if a != "D"]
        for split in ("tune", "held"):
            rs = [r for r in rows if r["layout"] == layout and r["split"] == split]
            print(f"## {layout} {split}: luma / colour gain over D, worst, rows worse than D by > 0.1 dB")
            for arm in arms:
                cells = []
                for lo, hi, lab in BUCKETS:
                    sub = [r for r in rs if lo <= (0.18 / r["snr"]) / grain[(r["file"], tuple(r["tile"]))] < hi]
                    if not sub:
                        continue
                    lg, cg = gains(sub, "l", arm), gains(sub, "c", arm)
                    rec = {"layout": layout, "split": split, "arm": arm, "bucket": lab, "n": len(sub),
                           "luma": round(float(lg.mean()), 3), "colour": round(float(cg.mean()), 3),
                           "worst": round(float(min(lg.min(), cg.min())), 2),
                           "worse_0.1": int(((lg < -0.1) | (cg < -0.1)).sum())}
                    out.append(rec)
                    cells.append(f"{lab:>3s} n{len(sub):3d} L{rec['luma']:+.2f} C{rec['colour']:+.2f} w{rec['worst']:+.2f} x{rec['worse_0.1']}")
                print(f"  {arm:12s} " + " | ".join(cells))
    if args.json:
        with open(args.json, "w") as f:
            for rec in out:
                f.write(json.dumps(rec) + "\n")
    return 0


if __name__ == "__main__":
    cmd, rest = sys.argv[1], sys.argv[2:]
    sys.exit({"sweep": sweep, "fit": fit, "bucket": bucket}[cmd](rest))
