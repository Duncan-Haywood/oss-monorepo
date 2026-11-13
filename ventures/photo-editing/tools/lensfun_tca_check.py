"""Every lensfun lens with lateral colour (TCA), run as ShootFlow's three-plane WarpRectilinear2, against
lensfun's own pipeline; and how far apart red and blue land at the corner without the correction.

For each lens with a TCA calibration in a lensfun ``data/db`` folder, at every calibrated focal length
and the midpoint between each pair, on a frame ``--width`` pixels wide at the calibration's aspect ratio
from a camera of the calibration's crop factor, this compares ``dng_opcodes.warp_source`` on
``lens_profiles.build_warp`` (no fill zoom) with ``tests/test_lens_tca.lensfun_rgb_source`` (lensfun's
distortion then TCA, written out step by step) at the corners, edge midpoints and random pixels, for all
three colour planes.

Usage: python3 tools/lensfun_tca_check.py LENSFUN_DB_DIR [--width 6000] [--json out.json]
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "tests"))
from shootflow import dng_opcodes as do  # noqa: E402
from shootflow import lens_profiles as lp  # noqa: E402
from test_lens_tca import lensfun_rgb_source  # noqa: E402


def pct(xs, q):
    xs = sorted(xs)
    return round(xs[min(len(xs) - 1, int(q * (len(xs) - 1) + 0.5))], 3) if xs else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("db")
    ap.add_argument("--width", type=int, default=6000)
    ap.add_argument("--json")
    args = ap.parse_args()
    db = lp.load_db(args.db)
    rng = random.Random(1)
    worst, worst_at, cases, lenses = 0.0, "", 0, 0
    sep, models, skipped = [], {}, 0
    for lens in db.lenses:
        cs = next((c for c in lens.calibrations if c.tca and c.distortion), None)
        if cs is None:
            continue
        lenses += 1
        W = args.width
        H = int(round(W / cs.aspect))
        focals = sorted({t.focal for t in cs.tca})
        for f in focals + [(a + b) / 2 for a, b in zip(focals, focals[1:])]:
            try:
                corr = lp.build_warp(lens, f, cs.crop, W, H, fill=False)
            except lp.LensProfileError:
                skipped += 1
                continue
            dist = lp.interpolate_distortion(lens, cs.crop, f)[0]
            tca = lp.interpolate_tca(lens, cs.crop, f)
            key = f"{dist.model}+{tca.model}"
            models[key] = models.get(key, 0) + 1
            pts = [(0, 0), (W - 1, H - 1), (W - 1, 0), (W // 2, 0), (0, H // 2)]
            pts += [(rng.randrange(W), rng.randrange(H)) for _ in range(10)]
            for x, y in pts:
                for p in range(3):
                    g = do.warp_source(corr.warp, p, float(x), float(y), W, H)
                    l_ = lensfun_rgb_source(dist, tca, cs.crop, cs.aspect, cs.crop, x, y, W, H, p)
                    e = max(abs(g[0] - l_[0]), abs(g[1] - l_[1]))
                    if e > worst:
                        worst, worst_at = e, f"{lens.name} at {f:g} mm"
            r = do.warp_source(corr.warp, 0, 0.0, 0.0, W, H)
            b = do.warp_source(corr.warp, 2, 0.0, 0.0, W, H)
            sep.append(math.hypot(r[0] - b[0], r[1] - b[1]))
            cases += 1
    out = {
        "lenses_with_tca": lenses,
        "cases": cases,
        "skipped": skipped,
        "models": models,
        "largest_gap_px": worst,
        "largest_gap_at": worst_at,
        "corner_red_blue_px": {"median": pct(sep, 0.5), "p90": pct(sep, 0.9), "p99": pct(sep, 0.99), "max": pct(sep, 1.0)},
        "share_over_1px": round(sum(s > 1 for s in sep) / max(len(sep), 1), 4),
        "share_over_2px": round(sum(s > 2 for s in sep) / max(len(sep), 1), 4),
        "width": args.width,
    }
    print(json.dumps(out, indent=2))
    if args.json:
        with open(args.json, "w") as fh:
            json.dump(out, fh, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
