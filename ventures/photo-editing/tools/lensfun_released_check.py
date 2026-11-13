"""shootflow's lensfun correction (``lens_profiles``) against the real lensfun library, on every lens it ships.

lensfunpy (``pip install lensfunpy``, MIT) bundles liblensfun 0.3.4, lensfun's latest release, and that
release's database. This script runs lensfun's own C code on every rectilinear lens in that database with a
ptlens, poly3 or poly5 calibration: at each calibrated focal length and at the midpoint between neighbours
(where lensfun interpolates), on a 3:2 and a 4:3 frame, at the calibration's crop factor and at 1.5 times it.
It asks ``Modifier.apply_geometry_distortion`` (distortion only, scale 1) where each pixel reads from and
compares that with ``dng_opcodes.warp_source`` on the WarpRectilinear2 that ``lens_profiles.build_warp``
makes (``fill=False``).

**Two conventions, one identity.** ``lens_profiles`` follows lensfun's master branch, which divides the
ptlens and poly3 terms by ``d`` (``1 - a - b - c``, or ``1 - k1``) so the centre keeps its scale; the 0.3
release keeps Hugin's formula as calibrated. The two also measure a pixel slightly differently: master by
``hypot(W, H)``, 0.3 by ``hypot(W - 1, H - 1)`` (``s3`` and ``sm`` below, Hugin units per pixel). With
``P`` the Hugin factor, 0.3 sends output radius ``R`` to ``R P(s3 R)`` and master to ``R P(sm R / d) / d``,
so exactly::

    source_0.3(p) = c + (sm / s3) (source_master(c + (s3 d / sm)(p - c)) - c)

and the script compares the left side, built from our warp, with lensfun 0.3.4.

**A bug in lensfun 0.3.4.** Its SSE loops for ptlens and poly3 (``mod-coord-sse.cpp``,
``ModifyCoord_Dist_PTLens_SSE`` and ``ModifyCoord_Dist_Poly3_SSE``) compute the factor for pixels 4k..4k+3
in one register but multiply it, lane by lane, into the interleaved registers (x0, y0, x1, y1) and
(x2, y2, x3, y3). Only the x of pixel 4k and the y of pixel 4k+3 get their own pixel's factor; the other
six coordinates take a neighbour's. Lensfun's master branch fixed it (it multiplies x and y first and
interleaves after, with ``_mm_unpacklo_ps``). So two gaps are reported: "own lanes", just the coordinates
lensfun computes with their own factor, which checks our port; and "all", every coordinate, which for
ptlens and poly3 is the size of that bug as shipped. poly5 has no SSE loop. The width is a multiple of 4
so every row is 16-byte aligned and takes the SSE path.

Usage: python3 tools/lensfun_released_check.py [--width 1200] [--json out.json]
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


def released_source(warp, dist, cs, crop: float, x: float, y: float, w: int, h: int) -> tuple[float, float]:
    """Where lensfun 0.3.4 sends output pixel (x, y), from ``lens_profiles``' master-convention warp (no fill)."""

    a, b, c = dist.terms
    d = 1 - a - b - c if dist.model == "ptlens" else (1 - a if dist.model == "poly3" else 1.0)
    unit = 2.0 * cs.crop * math.hypot(cs.aspect, 1.0) / crop
    s3 = unit / math.hypot(w - 1, h - 1)
    sm = unit / math.hypot(w, h)
    cx, cy = (w - 1) / 2.0, (h - 1) / 2.0
    k = s3 * d / sm
    # The identity reads the warp out to radius k > 1 at the corners: lift the opcode's clamp at max_valid_radius
    # (1), which would otherwise hold the polynomial at r = 1 there.
    warp = do.WarpRectilinear2(tuple(t[:18] + (4.0,) for t in warp.terms), warp.cx, warp.cy, warp.reciprocal)
    sx, sy = do.warp_source(warp, 0, cx + k * (x - cx), cy + k * (y - cy), w, h)
    return cx + (sm / s3) * (sx - cx), cy + (sm / s3) * (sy - cy)


def main(argv=None) -> int:
    import lensfunpy

    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--width", type=int, default=1200)
    ap.add_argument("--json")
    args = ap.parse_args(argv)

    db_dir = os.path.join(os.path.dirname(lensfunpy.__file__), "db_files")
    ours = lp.load_db(db_dir)
    ldb = lensfunpy.Database(
        paths=sorted(os.path.join(db_dir, f) for f in os.listdir(db_dir) if f.endswith(".xml")),
        load_common=False,
        load_bundled=False,
    )
    W = args.width // 4 * 4
    rows, skipped = [], 0
    for L in ldb.lenses:
        if L.type != lensfunpy.LensType.RECTILINEAR:
            continue
        mine = [ln for ln in ours.lenses if ln.name == L.model and (not ln.maker or L.maker in ln.maker)]
        if len(mine) != 1:
            skipped += 1
            continue
        lens = mine[0]
        cs0 = lens.calibrations[0] if lens.calibrations else None
        if cs0 is None or not cs0.distortion:
            skipped += 1
            continue
        first = cs0.distortion[0].model
        focals = sorted({d.focal for d in cs0.distortion if d.model == first})
        tries = list(focals) + [(p + q) / 2 for p, q in itertools.pairwise(focals)]
        for aspect in (1.5, 4 / 3):
            H = round(W / aspect)
            ys = np.linspace(0, H - 1, 7).round().astype(int)
            for crop in (cs0.crop, cs0.crop * 1.5):
                for f in tries:
                    mod = lensfunpy.Modifier(L, crop, W, H)
                    mod.initialize(f, 8.0, scale=1.0, flags=lensfunpy.ModifyFlags.DISTORTION)
                    g = mod.apply_geometry_distortion()
                    if g is None:  # lensfun found no distortion it would apply
                        skipped += 1
                        continue
                    found = lp.interpolate_distortion(lens, crop, f)
                    if found is None:
                        skipped += 1
                        continue
                    dist, cs = found
                    try:
                        warp = lp.build_warp(lens, f, crop, W, H, fill=False).warp
                    except lp.LensProfileError:
                        skipped += 1
                        continue
                    sse = dist.model in ("ptlens", "poly3")
                    own = every = 0.0
                    for y in ys:
                        # one pixel quad in four: its x = 4k (own x lane), 4k + 1, 4k + 2 (mixed) and 4k + 3 (own y)
                        for x in (q + i for q in range(0, W, 16) for i in range(4)):
                            sx, sy = released_source(warp, dist, cs, crop, float(x), float(y), W, H)
                            ex, ey = abs(sx - float(g[y, x, 0])), abs(sy - float(g[y, x, 1]))
                            every = max(every, ex, ey)
                            if not sse or x % 4 == 0:
                                own = max(own, ex)
                            if not sse or x % 4 == 3:
                                own = max(own, ey)
                    rows.append(
                        {
                            "lens": L.model,
                            "focal": f,
                            "crop": crop,
                            "aspect": aspect,
                            "model": dist.model,
                            "interpolated": f not in focals,
                            "own_px": own,
                            "all_px": every,
                        }
                    )
    print(
        f"cases: {len(rows)} over {len({r['lens'] for r in rows})} lenses ({skipped} skipped), frame {W} px wide"
    )
    for model in ("ptlens", "poly3", "poly5"):
        grp = [r for r in rows if r["model"] == model]
        if not grp:
            continue
        own = np.array([r["own_px"] for r in grp])
        al = np.array([r["all_px"] for r in grp])
        print(f"{model}: {len(grp)} cases ({sum(r['interpolated'] for r in grp)} interpolated)")
        print(
            "  own lanes (our port vs lensfun 0.3.4), px: "
            + ", ".join(f"p{p} {np.percentile(own, p):.4f}" for p in (50, 90, 99, 100))
        )
        print(
            "  every coordinate, px:                      "
            + ", ".join(f"p{p} {np.percentile(al, p):.4f}" for p in (50, 90, 99, 100))
        )
    for r in sorted(rows, key=lambda r: -r["own_px"])[:5]:
        print(
            f"  own {r['own_px']:.4f} px  {r['lens']} @ {r['focal']:g} mm crop {r['crop']:.3g} aspect {r['aspect']:.3g}"
        )
    for r in sorted(rows, key=lambda r: -r["all_px"])[:5]:
        print(
            f"  all {r['all_px']:.4f} px  {r['lens']} @ {r['focal']:g} mm crop {r['crop']:.3g} aspect {r['aspect']:.3g}"
        )
    if args.json:
        with open(args.json, "w") as fh:
            json.dump(rows, fh, indent=1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
