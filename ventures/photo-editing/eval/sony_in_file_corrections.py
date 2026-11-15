"""Sony's in-file lens corrections (ARW 0x7032, 0x7035, 0x7037) against lensfun's calibration of the same lens.

For each ARW given: read the three tables (``shootflow.sony_corrections``), find the lens and focal length in
lensfun as ``--lens-db`` would (the file's own EXIF LensModel), then

1. distortion: fit the numbers the format leaves open, the fixed-point scale ``alpha`` and the knot radius
   ``R`` (the radius of the last knot in lensfun's Hugin units, 1 = half the short side), with a free zoom, by
   least squares of Sony's source radius on lensfun's (``gap``), under two readings of what the knot radius is;
   then the gap with the decoded values (alpha = 2^-14, R = the corner), in pixels on a frame 6000 px wide;
2. lateral colour: Sony's red and blue factor at 2^-21 against lensfun's TCA factor at the same radius;
3. vignetting: Sony's gain against lensfun's ``1 / (1 + k1 r^2 + k2 r^4 + k3 r^6)``, in stops.

Usage: PYTHONPATH=src python3 eval/sony_in_file_corrections.py LENSFUN_DB_DIR FILE.ARW...
Results: eval/sony-in-file-corrections-2026-11-15.md
"""

from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from lens_spec_real_files import tags  # noqa: E402

from shootflow import lens_profiles as lp  # noqa: E402
from shootflow import sony_corrections as sc  # noqa: E402

RHOS = [i / 100 for i in range(101)]


def lf_factor(dist: lp.Distortion, r: float) -> float:
    a, b, c = dist.terms
    if dist.model == "ptlens":
        return a * r**3 + b * r**2 + c * r + 1.0 - a - b - c
    if dist.model == "poly3":
        return 1.0 - a + a * r**2
    return 1.0 + a * r**2 + b * r**4


def gap(corr, dist, alpha: float, R: float, z: float, h: int) -> list[float]:
    """Sony's source radius minus lensfun's, as a fraction of the half-diagonal, at 100 output radii.

    ``R`` is the knots' last radius in lensfun's Hugin units and ``z`` a free zoom (Sony's tables carry their own,
    knot 0 is not zero). h = 1: knot radius is the output (corrected) radius, source = rho * m(rho). h = 2: knot
    radius is the source radius, output = rho / m(rho)."""

    out = []
    for i in range(1, 101):
        rho = i / 100
        m = 1.0 + alpha * sc._interp(corr.distortion, rho)
        u = rho * R * z if h == 1 else rho * R * z / m
        out.append(rho * (m - z * lf_factor(dist, u)))
    return out


def rms(v):
    return math.sqrt(sum(x * x for x in v) / len(v))


def best_zoom(corr, dist, alpha, R, h):
    return min((rms(gap(corr, dist, alpha, R, k / 1000, h)), k / 1000) for k in range(900, 1101, 2))


def fit(corr, dist, h: int):
    """Free fit of alpha (2^-16 to 2^-12 in steps of 2^0.05), R (1.2 to 2.6) and the zoom."""

    best = None
    for e in range(-320, -240):
        for k in range(120, 262, 4):
            err, z = best_zoom(corr, dist, 2.0 ** (e / 20), k / 100, h)
            if best is None or err < best[0]:
                best = (err, e / 20, k / 100, z)
    return best


def main(db_dir: str, files: list[str]) -> int:
    db = lp.load_db(db_dir)
    for path in files:
        corr = sc.from_arw(open(path, "rb").read())
        name = os.path.basename(path)
        if corr is None:
            print(f"{name}: no in-file corrections")
            continue
        ifd0, exif = tags(path)
        info = lp.shot_info(ifd0, exif)
        cam = lp.find_camera(db, info.make, info.model)
        lenses = lp.find_lenses(db, info.lens, cam) if info.lens else []
        print(f"{name}: {info.model}, {info.lens}, {info.focal:g} mm f/{info.aperture:g}")
        print("  " + sc.describe(corr))
        if not lenses or cam is None:
            print("  lensfun: no lens")
            continue
        lens = lenses[0][1]
        corner = math.hypot(1.5, 1.0)  # 3:2 frame, crops agree (checked below)
        half_diag_px = math.hypot(3000, 2000)
        got = lp.interpolate_distortion(lens, cam.crop, info.focal)
        if got and corr.distortion:
            dist, cs = got
            print(f"  lensfun {lens.name} at {info.focal:g} mm: {dist.model} {dist.terms}, calibration crop "
                  f"{cs.crop:g} (camera {cam.crop:g}), aspect {cs.aspect:g}")
            for h, label in ((1, "knots on the corrected radius"), (2, "knots on the source radius")):
                err, e, R, z = fit(corr, dist, h)
                ferr, fz = best_zoom(corr, dist, sc.DISTORTION_SCALE, corner, h)
                worst = max(abs(g) for g in gap(corr, dist, sc.DISTORTION_SCALE, corner, fz, h))
                print(f"  {label}: free fit alpha = 2^{e:.2f}, R = {R:.2f} (corner {corner:.3f}), rms "
                      f"{err * half_diag_px:.2f} px; decoded (2^-14, corner, zoom {fz:.3f}): rms "
                      f"{ferr * half_diag_px:.2f} px, max {worst * half_diag_px:.2f} px")
            lfc = (lf_factor(dist, corner) / lf_factor(dist, 0) - 1) * 100
            sny = (corr.distortion_factor(1) / corr.distortion_factor(0) - 1) * 100
            print(f"  corner shift relative to the centre: Sony {sny:+.2f}% "
                  f"({abs(corr.distortion_factor(1) - 1) * half_diag_px:.0f} px), lensfun {lfc:+.2f}%")
            for deg in (5, 7):
                kr = sc.warp_terms(corr, deg)
                print(f"  WarpRectilinear2 fit, degree {deg}: max {sc.max_fit_error(corr, kr, half_diag_px):.2f} px")
        tca = lp.interpolate_tca(lens, cam.crop, info.focal)
        if tca and corr.ca_red:
            rows = []
            for rho in (0.0, 0.5, 0.75, 1.0):
                r = rho * corner
                vr, vb, cr, cb, br, bb = (tuple(tca.terms) + (0.0,) * 6)[:6]
                if tca.model == "poly3":
                    lr, lb = vr + cr * r + br * r * r, vb + cb * r + bb * r * r
                else:
                    lr, lb = vr, vb
                sr, sb = corr.ca_factors(rho)
                rows.append(f"rho {rho:.2f}: red Sony {(sr - 1) * 1e4:+.1f} lensfun {(lr - 1) * 1e4:+.1f}, blue Sony "
                            f"{(sb - 1) * 1e4:+.1f} lensfun {(lb - 1) * 1e4:+.1f}")
            print("  lateral colour (per 10,000 of the radius):\n    " + "\n    ".join(rows))
            sr, sb = corr.ca_factors(1.0)
            lr = lr if tca.model == "poly3" else vr
            print(f"  corner red-blue spread at 6000 px: Sony {(sr - sb) * half_diag_px:+.2f} px, lensfun "
                  f"{(lr - lb) * half_diag_px:+.2f} px")
        vig = lp.interpolate_vignetting(lens, cam.crop, info.focal, info.aperture or 0, info.distance or 1000.0)
        if corr.vignetting:
            rows = []
            for rho in (0.25, 0.5, 0.75, 1.0):
                s = math.log2(corr.vignetting_gain(rho))
                if vig:
                    k1, k2, k3 = vig[0].terms
                    c = 1 + k1 * rho**2 + k2 * rho**4 + k3 * rho**6
                    rows.append(f"rho {rho:.2f}: Sony +{s:.2f} stops, lensfun +{-math.log2(c):.2f}")
                else:
                    rows.append(f"rho {rho:.2f}: Sony +{s:.2f} stops, lensfun none at f/{info.aperture:g}")
            print("  vignetting gain:\n    " + "\n    ".join(rows))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2:]))
