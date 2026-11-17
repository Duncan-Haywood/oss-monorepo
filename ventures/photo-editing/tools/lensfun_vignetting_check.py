"""Every lensfun vignetting calibration, run as ShootFlow's FixVignetteRadial, against lensfun's own gain;
and how much the corners are brightened.

For each lens with a ``pa`` vignetting calibration in a lensfun ``data/db`` folder, at every calibration
point (focal length, aperture, distance) and at the geometric midpoint between each pair of apertures
calibrated at the same focal length and distance (an interpolated case), on a frame ``--width`` pixels
wide at the calibration's aspect ratio from a camera of the calibration's crop factor, this compares
``dng_opcodes.vignette_gain`` on ``lens_profiles.build_vignette`` with
``tests/test_lens_vignetting.lensfun_gain`` (lensfun's pipeline written out) at the corners, edge
midpoints, centre and 10 random pixels.

Usage: python3 tools/lensfun_vignetting_check.py LENSFUN_DB_DIR [--width 6000] [--json out.json]
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
from test_lens_vignetting import lensfun_gain  # noqa: E402


def pct(xs, q):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(q * (len(xs) - 1) + 0.5))] if xs else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("db")
    ap.add_argument("--width", type=int, default=6000)
    ap.add_argument("--json")
    args = ap.parse_args()
    db = lp.load_db(args.db)
    rng = random.Random(1)
    lenses = cases = refused = none = 0
    reasons = {"dark": 0, "fit": 0}
    fit_errs, pixel_errs, corner_ev = [], [], []
    worst_pixel, worst_at, worst_fit, worst_fit_at = 0.0, "", 0.0, ""
    for lens in db.lenses:
        cs = next((c for c in lens.calibrations if c.vignetting), None)
        if cs is None:
            continue
        lenses += 1
        W = args.width
        H = int(round(W / cs.aspect))
        points = {(v.focal, v.aperture, v.distance) for v in cs.vignetting}
        groups: dict[tuple[float, float], list[float]] = {}
        for f, a, d in points:
            groups.setdefault((f, d), []).append(a)
        for (f, d), aps in groups.items():
            aps = sorted(set(aps))
            points |= {(f, math.sqrt(a * b), d) for a, b in zip(aps, aps[1:])}
        for f, a, d in sorted(points):
            if a <= 0 or d <= 0:
                none += 1
                continue
            try:
                vc = lp.build_vignette(lens, f, cs.crop, W, H, a, d)
            except lp.LensProfileError as exc:
                refused += 1
                reasons[("dark" if "darkens" in str(exc) else "fit")] += 1
                continue
            if vc is None:
                none += 1
                continue
            cases += 1
            fit_errs.append(vc.max_error)
            corner_ev.append(math.log2(vc.corner_gain))
            if vc.max_error > worst_fit:
                worst_fit, worst_fit_at = vc.max_error, f"{lens.name} [{lens.source}] {f:g} mm f/{a:g} {d:g} m"
            pts = [(0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1), (W // 2, 0), (0, H // 2), (W // 2, H // 2)]
            pts += [(rng.randrange(W), rng.randrange(H)) for _ in range(10)]
            e = 0.0
            for x, y in pts:
                want = lensfun_gain(vc.vignetting.terms, cs.crop, cs.crop, W, H, x, y)
                got = do.vignette_gain(vc.opcode, float(x), float(y), W, H)
                e = max(e, abs(got / want - 1.0))
            pixel_errs.append(e)
            if e > worst_pixel:
                worst_pixel, worst_at = e, f"{lens.name} [{lens.source}] {f:g} mm f/{a:g} {d:g} m"
    over = lambda xs, t: round(100.0 * sum(1 for x in xs if x > t) / max(len(xs), 1), 2)  # noqa: E731
    out = {
        "lensfun_files": db.files,
        "lenses_with_vignetting": lenses,
        "cases": cases,
        "refused": refused,
        "refused_why": reasons,
        "no_correction": none,
        "fit_error": {"median": pct(fit_errs, 0.5), "p90": pct(fit_errs, 0.9), "p99": pct(fit_errs, 0.99),
                      "max": worst_fit, "max_at": worst_fit_at,
                      "over_0.1pct": over(fit_errs, 0.001), "over_1pct": over(fit_errs, 0.01),
                      "over_5pct": over(fit_errs, 0.05)},
        "pixel_error_max": worst_pixel, "pixel_error_max_at": worst_at,
        "pixel_error_over_fit_bound": sum(1 for p, f in zip(pixel_errs, fit_errs) if p > f + 1e-12),
        "pixel_error_most_over_fit_bound": max((p - f for p, f in zip(pixel_errs, fit_errs)), default=0.0),
        "corner_ev": {"median": pct(corner_ev, 0.5), "p90": pct(corner_ev, 0.9), "p99": pct(corner_ev, 0.99),
                      "max": max(corner_ev) if corner_ev else None,
                      "over_half_stop_pct": over(corner_ev, 0.5), "over_one_stop_pct": over(corner_ev, 1.0)},
    }
    print(json.dumps(out, indent=2))
    if args.json:
        with open(args.json, "w") as fh:
            json.dump(out, fh, indent=2)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
