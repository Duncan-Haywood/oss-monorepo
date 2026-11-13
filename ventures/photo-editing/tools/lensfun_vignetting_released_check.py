"""shootflow's lensfun vignetting (``lens_profiles.build_vignette``) against the real lensfun library, on every lens
with a ``pa`` calibration it ships.

lensfunpy (``pip install lensfunpy``, MIT) bundles liblensfun 0.3.4, lensfun's latest release, and that release's
database. ``tools/lensfun_released_check.py`` does this for distortion; this script does it for vignetting. For
each lens there with a ``pa`` calibration that ``lens_profiles.load_db`` reads from the same files and finds by the
same name, it tries every calibration point (focal, aperture, distance), the geometric midpoint between each pair
of apertures calibrated at one focal length and distance, and the midpoint between neighbouring calibrated focal
lengths at each aperture and distance (both interpolated), on a 3:2 and a 4:3 frame, at the calibration's crop
factor and at 1.5 times it. Lensfun's ``Modifier.apply_color_modification`` (vignetting only) runs on a float32
image of ones, so each pixel comes back as lensfun's gain.

**Two pixel units, one identity.** lensfun 0.3.4 (``modifier.cpp``, ``AddColorCallbackVignetting``) measures the
``pa`` radius as ``r_px * 2 calib crop / (crop * hypot(w - 1, h - 1))``; lensfun's master branch, which
``lens_profiles`` follows, uses ``hypot(w, h)`` (``NormScale``; the real focal length cancels). Both centre on
``((w - 1) / 2, (h - 1) / 2)``. So the release's gain is ours with ``vignetting_scale`` times
``hypot(w, h) / hypot(w - 1, h - 1)``. Three gaps are reported, as relative errors of the gain:

- **port**: lensfun 0.3.4 against ``1 / c`` from our ``interpolate_vignetting`` terms in 0.3.4's pixel unit, in
  float64. This checks the interpolation and the units against compiled code;
- **float32**: lensfun 0.3.4 against its own loop re-run in float32 here (``r2 += 2 ns x + ns^2`` along a row, as
  ``ModifyColor_DeVignetting_PA`` does), which should match to rounding, so any port gap left is ours, not float;
- **shipped**: lensfun 0.3.4 against the FixVignetteRadial that ``build_vignette`` writes (master's unit and the
  polynomial fit): what a user of the release would see change.

Usage: python3 tools/lensfun_vignetting_released_check.py [--width 1200] [--json out.json]
"""

from __future__ import annotations

import argparse
import itertools
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from shootflow import dng_opcodes as do  # noqa: E402
from shootflow import lens_profiles as lp  # noqa: E402


def released_scale(cs: lp.CalibrationSet, crop: float, w: int, h: int) -> float:
    """``vignetting_scale`` in lensfun 0.3.4's pixel unit (``hypot(w - 1, h - 1)``, not ``hypot(w, h)``)."""

    return lp.vignetting_scale(cs, crop, w, h) * math.hypot(w, h) / math.hypot(w - 1, h - 1)


def exact_gain(terms, s: float, w: int, h: int, xs: np.ndarray, ys: np.ndarray) -> np.ndarray:
    """``1 / c`` in float64 at pixels (xs, ys), ``r = 1`` (in units of ``s``) at the farthest pixel centre."""

    m = math.hypot((w - 1) / 2.0, (h - 1) / 2.0)
    u = ((xs - (w - 1) / 2.0) ** 2 + (ys - (h - 1) / 2.0) ** 2) / (m * m) * s * s
    return 1.0 / (1.0 + u * (terms[0] + u * (terms[1] + u * terms[2])))


def opcode_gain(vg, w: int, h: int, xs: np.ndarray, y: float) -> np.ndarray:
    """``dng_opcodes.vignette_gain`` over a row, vectorised (checked against it at the row's ends and middle)."""

    k0, k1, k2, k3, k4 = vg.k
    cxp, cyp, m = do._spec_frame(vg.cx, vg.cy, w, h)
    u = ((xs + 0.5 - cxp) ** 2 + (y + 0.5 - cyp) ** 2) / (m * m)
    g = 1.0 + u * (k0 + u * (k1 + u * (k2 + u * (k3 + u * k4))))
    for i in (0, len(xs) // 2, len(xs) - 1):
        assert abs(g[i] - do.vignette_gain(vg, float(xs[i]), y, w, h)) < 1e-12
    return g


def float32_row(terms, s: float, w: int, h: int, y: int) -> np.ndarray:
    """``ModifyColor_DeVignetting_PA`` for one row, in float32 as liblensfun 0.3.4 runs it."""

    f = np.float32
    m = math.hypot((w - 1) / 2.0, (h - 1) / 2.0)
    ns = f(s / m)  # pa units per pixel
    x = f(f(0.0) * ns - f((w - 1) / 2.0) * ns)
    yy = f(f(y) * ns - f((h - 1) / 2.0) * ns)
    p0, p1, p2 = f(terms[0]), f(terms[1]), f(terms[2])
    r2 = f(x * x + yy * yy)
    d1, d2 = f(2.0 * ns), f(ns * ns)
    out = np.empty(w, np.float32)
    for i in range(w):
        r4 = f(r2 * r2)
        r6 = f(r4 * r2)
        c = f(f(f(f(1.0) + f(p0 * r2)) + f(p1 * r4)) + f(p2 * r6))
        out[i] = f(f(1.0) / c)
        r2 = f(r2 + f(f(d1 * x) + d2))
        x = f(x + ns)
    return out


def points(cs: lp.CalibrationSet) -> list[tuple[float, float, float, bool]]:
    calib = {(v.focal, v.aperture, v.distance) for v in cs.vignetting}
    out = {p: False for p in calib}
    by_fd: dict[tuple[float, float], set[float]] = {}
    by_ad: dict[tuple[float, float], set[float]] = {}
    for f, a, d in calib:
        by_fd.setdefault((f, d), set()).add(a)
        by_ad.setdefault((a, d), set()).add(f)
    for (f, d), aps in by_fd.items():
        for a, b in itertools.pairwise(sorted(aps)):
            out.setdefault((f, math.sqrt(a * b), d), True)
    for (a, d), fs in by_ad.items():
        for p, q in itertools.pairwise(sorted(fs)):
            out.setdefault(((p + q) / 2.0, a, d), True)
    return sorted((f, a, d, i) for (f, a, d), i in out.items() if a > 0 and d > 0)


def pcts(xs) -> str:
    xs = np.asarray(xs)
    return ", ".join(f"p{p} {100 * np.percentile(xs, p):.4g}%" for p in (50, 90, 99, 100))


def main(argv=None) -> int:
    import lensfunpy

    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--width", type=int, default=1200)
    ap.add_argument("--rows", type=int, default=7, help="rows compared per case (evenly spaced, both edges)")
    ap.add_argument("--json")
    args = ap.parse_args(argv)

    db_dir = os.path.join(os.path.dirname(lensfunpy.__file__), "db_files")
    ours = lp.load_db(db_dir)
    ldb = lensfunpy.Database(
        paths=sorted(os.path.join(db_dir, f) for f in os.listdir(db_dir) if f.endswith(".xml")),
        load_common=False,
        load_bundled=False,
    )
    W = args.width
    rows, skipped, lensfun_none, ours_none, refused, f32_rows = [], 0, 0, 0, 0, 0
    worst_f32 = 0.0
    for L in ldb.lenses:
        mine = [ln for ln in ours.lenses if ln.name == L.model and (not ln.maker or L.maker in ln.maker)]
        if len(mine) != 1:
            skipped += 1
            continue
        lens = mine[0]
        cs0 = next((c for c in lens.calibrations if c.vignetting), None)
        if cs0 is None:
            continue
        for aspect in (1.5, 4 / 3):
            H = round(W / aspect)
            ys = np.linspace(0, H - 1, args.rows).round().astype(int)
            xs = np.arange(W, dtype=np.float64)
            for crop in (cs0.crop, cs0.crop * 1.5):
                for f, a, d, interp in points(cs0):
                    mod = lensfunpy.Modifier(L, crop, W, H)
                    mod.initialize(f, a, d, scale=1.0, pixel_format=np.float32, flags=lensfunpy.ModifyFlags.VIGNETTING)
                    img = np.ones((H, W, 3), np.float32)
                    applied = mod.apply_color_modification(img)
                    found = lp.interpolate_vignetting(lens, crop, f, a, d)
                    if not applied or found is None:
                        if bool(applied) != (found is not None):
                            print(f"  MISMATCH lensfun applied={applied} ours={found is not None}: {L.model} {f:g} mm f/{a:g} {d:g} m")
                        lensfun_none += not applied
                        ours_none += found is None
                        continue
                    vig, cs = found
                    s3 = released_scale(cs, crop, W, H)
                    port = shipped = 0.0
                    try:
                        vc = lp.build_vignette(lens, f, crop, W, H, a, d)
                    except lp.LensProfileError:
                        vc = None
                        refused += 1
                    for y in ys:
                        lf = img[y, :, 0].astype(np.float64)
                        ex = exact_gain(vig.terms, s3, W, H, xs, np.full(W, float(y)))
                        port = max(port, float(np.max(np.abs(lf / ex - 1.0))))
                        if vc is not None:
                            g = opcode_gain(vc.opcode, W, H, xs, float(y))
                            shipped = max(shipped, float(np.max(np.abs(lf / g - 1.0))))
                    if f32_rows < 400:  # the float32 re-run is slow in Python: the first 400 rows
                        y = int(ys[0])
                        mine32 = float32_row(vig.terms, s3, W, H, y)
                        worst_f32 = max(worst_f32, float(np.max(np.abs(img[y, :, 0].astype(np.float64) / mine32 - 1.0))))
                        f32_rows += 1
                    corner = float(img[0, 0, 0])
                    rows.append(
                        {
                            "lens": L.model,
                            "focal": f,
                            "aperture": a,
                            "distance": d,
                            "interpolated": interp,
                            "crop": crop,
                            "aspect": aspect,
                            "corner_gain": corner,
                            "port": port,
                            "shipped": shipped if vc is not None else None,
                        }
                    )
    print(
        f"cases: {len(rows)} over {len({r['lens'] for r in rows})} lenses, frame {W} px wide "
        f"({skipped} lenses not matched one to one; lensfun applied none in {lensfun_none}, ours in {ours_none}; "
        f"{refused} refused by build_vignette)"
    )
    print(f"  interpolated: {sum(r['interpolated'] for r in rows)}; corner gain median {np.median([r['corner_gain'] for r in rows]):.3f}")
    print("  port (our terms and units, float64, vs lensfun 0.3.4): " + pcts([r["port"] for r in rows]))
    print(f"  float32 re-run vs lensfun 0.3.4, {f32_rows} rows: largest {100 * worst_f32:.3g}%")
    sh = [r["shipped"] for r in rows if r["shipped"] is not None]
    print("  shipped FixVignetteRadial vs lensfun 0.3.4:           " + pcts(sh))
    for r in sorted(rows, key=lambda r: -r["port"])[:5]:
        print(f"  port {100 * r['port']:.4f}%  {r['lens']} @ {r['focal']:g} mm f/{r['aperture']:g} {r['distance']:g} m crop {r['crop']:.3g}")
    for r in sorted((r for r in rows if r["shipped"] is not None), key=lambda r: -r["shipped"])[:5]:
        print(f"  shipped {100 * r['shipped']:.3f}%  {r['lens']} @ {r['focal']:g} mm f/{r['aperture']:g} {r['distance']:g} m crop {r['crop']:.3g}")
    if args.json:
        with open(args.json, "w") as fh:
            json.dump(rows, fh, indent=1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
