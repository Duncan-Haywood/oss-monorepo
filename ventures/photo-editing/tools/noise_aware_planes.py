"""Luma, white-balance gains and per-plane profiles: three open questions about ``--demosaic noise-aware``.

The 2026-11-16 notes (``eval/xtrans-noise-aware-blend-2026-11-16.md``, ``eval/noise-profile-real-dngs-2026-11-16.md``)
left three things open, and this tool measures all three on the same borrowed scenes:

1. **Luma.** The blend was scored on colour PSNR only. Every arm here records luma PSNR as well.
2. **White-balance gains.** The synthetic noise was drawn on the white-balanced plane, the same on every
   colour. A real sensor's noise is drawn *before* white balance, so on the plane the blend sees, red and
   blue carry their gain times green's sigma (camera gains are typically R 1.5-2.5, B 1.3-2.5). The developer
   carries the profile with one mean gain (shot x mean g, read x mean g^2). This tool draws the noise on the
   raw scale with each file's own as-shot gains and compares that carry with a per-colour one (shot x g_k,
   read x g_k^2, ``frame_measures`` with a (3, 2) noise).
3. **Per-plane profiles.** Ten real DNGs write a different (shot, read) per plane. The Pixel 6 Pro's red and
   blue state 1.69x green's shot term and 2.25x its read term; the "pixel" scenario draws that.

Scenarios, per tile and SNR (SNR at 18% grey on the raw scale, 80% shot, as ``add_noise``):

* ``equal``: the old set-up (noise on the white-balanced plane, the same on every colour), so the luma of
  the shipped blend can be read against the old colour numbers;
* ``wb``: one profile for all planes, drawn on the raw scale, then white-balanced with the file's gains;
* ``pixel``: as ``wb`` with the Pixel 6 Pro's per-plane ratios.

Arms: ``D`` directional (the default), ``B`` bilinear, ``mean`` the blend with the carry the developer ships
(averaged pairs, mean gain), ``planes`` the blend with per-colour noise, and each blend again through
``guard_profile`` as the developer runs it (``mean+g``, ``planes+g``), with the guard's ratio.

Usage (from ``ventures/photo-editing``)::

    PYTHONPATH=src python tools/noise_aware_planes.py [--bayer | --raf X-E1.raf] --cache /tmp/truths FILES... > rows.jsonl
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time

import numpy as np

sys.path.insert(0, __file__.rsplit("/", 1)[0])
import xtrans_demosaic_check as chk
from xtrans_frame_choice import _truth, split_of, tiles

# Pixel 6 Pro (HDR+ 1.0.471358035zd, raw.pixls.us): NoiseProfile R (1.30e-5, 1.27e-7), G (7.7e-6, 5.64e-8),
# B (1.29e-5, 1.27e-7): red and blue over green.
PIXEL_RATIOS = ((1.69, 2.25), (1.0, 1.0), (1.68, 2.25))


def gains_of(path: str) -> np.ndarray:
    """The file's as-shot white-balance gains, green 1 (rawpy's camera_whitebalance; green's two entries
    averaged when the fourth is set)."""

    import rawpy

    with rawpy.imread(path) as raw:
        wb = [float(x) for x in raw.camera_whitebalance]
    g = wb[1] if not wb[3] else (wb[1] + wb[3]) / 2.0
    if not all(x > 0 for x in wb[:3]) or g <= 0:
        return np.array([2.0, 1.0, 1.6])  # a typical daylight pair when the file states none
    return np.array([wb[0] / g, 1.0, wb[2] / g])


def draw(clean_wb, pat, gains, snr, ratios, seed):
    """Noise drawn on the raw scale (white-balanced mosaic over each sensel's gain), per colour (shot, read) =
    base x ``ratios``, then white-balanced again. Returns the noisy plane and the true per-colour raw model."""

    from shootflow.xtrans_demosaic import colour_map

    cmap = colour_map(pat, *clean_wb.shape)
    sigma = 0.18 / snr
    base = np.array([0.8 * sigma**2 / 0.18, 0.2 * sigma**2])
    raw_model = np.array([[base[0] * a, base[1] * b] for a, b in ratios])
    g = gains[cmap]
    x = clean_wb / g
    rng = np.random.default_rng(seed)
    var = raw_model[cmap, 0] * np.clip(x, 0.0, None) + raw_model[cmap, 1]
    return (x + rng.normal(size=x.shape) * np.sqrt(var)) * g, raw_model


def carries(raw_model, gains):
    """The two carries of a raw-scale per-colour model to the white-balanced plane: what ships (pairs averaged,
    then shot x mean g, read x mean g^2) and per colour (shot_k x g_k, read_k x g_k^2)."""

    avg = raw_model.mean(axis=0)
    mean = (float(avg[0] * gains.mean()), float(avg[1] * (gains**2).mean()))
    planes = np.stack([raw_model[:, 0] * gains, raw_model[:, 1] * gains**2], axis=1)
    return mean, planes


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("files", nargs="+")
    ap.add_argument("--raf")
    ap.add_argument("--bayer", action="store_true")
    ap.add_argument("--snr", type=float, action="append", default=None)
    ap.add_argument("--tile", type=int, default=480)
    ap.add_argument("--crops", type=int, default=3)
    ap.add_argument("--cache")
    ap.add_argument("--scenario", action="append", default=None, choices=("equal", "wb", "pixel"))
    args = ap.parse_args(argv)
    snrs = args.snr or [60.0, 25.0, 12.0]
    scenarios = args.scenario or ["equal", "wb", "pixel"]

    import rawpy

    from shootflow.xtrans_demosaic import RAMPS, blend, frame_measures, guard_profile

    if args.bayer:
        from shootflow.bayer_demosaic import directional

        pat = (0, 1, 1, 2)
    else:
        from shootflow.xtrans_demosaic import directional

        pat = chk._pattern(rawpy.imread(args.raf))
    lo, hi = RAMPS[2 if args.bayer else 6]
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
                        mean = (0.8 * sig2 / 0.18, 0.2 * sig2)
                        planes = np.tile(mean, (3, 1))
                    else:
                        ratios = PIXEL_RATIOS if sc == "pixel" else ((1.0, 1.0),) * 3
                        c, raw_model = draw(clean, pat, gains, snr, ratios, seed)
                        mean, planes = carries(raw_model, gains)
                    b = chk.ours_bilinear(c, pat)
                    d = directional(c, pat)
                    arms = {"D": d, "B": b}
                    guard = {}
                    for label, model in (("mean", mean), ("planes", planes)):
                        arms[label] = blend(b, d, frame_measures(c, pat, b, d, noise=model, blocks=True)["q_blocks"], lo, hi)
                        used, ratio = guard_profile(c, pat, model)
                        guard[label] = None if math.isnan(ratio) else round(ratio, 4)
                        arms[label + "+g"] = blend(b, d, frame_measures(c, pat, b, d, noise=used, blocks=True)["q_blocks"], lo, hi)
                    sc_rows = {k: chk.scores(v, truth) for k, v in arms.items()}
                    print(json.dumps({
                        "layout": "bayer" if args.bayer else "xtrans", "file": name, "split": split_of(name),
                        "tile": [ty, tx], "snr": snr, "scenario": sc, "gains": [round(float(x), 4) for x in gains],
                        "cpsnr": {k: v["cpsnr"] for k, v in sc_rows.items()},
                        "lpsnr": {k: v["lpsnr"] for k, v in sc_rows.items()},
                        "guard_ratio": guard, "s": round(time.perf_counter() - t0, 2),
                    }), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
