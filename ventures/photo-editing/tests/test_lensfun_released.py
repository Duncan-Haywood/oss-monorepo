"""``lens_profiles`` (lensfun's master-branch geometry) against lensfun's latest release, 0.3.4.

``tools/lensfun_released_check.py`` explains the identity used here: the 0.3 release keeps Hugin's formula
as calibrated and measures a pixel by ``hypot(W - 1, H - 1)``, master divides by ``d`` and measures by
``hypot(W, H)``, and one exact change of radius takes one to the other. These tests write lensfun 0.3.4's
pipeline out step by step (v0.3.4 ``modifier.cpp`` constructor, ``mod-coord.cpp`` ``ModifyCoord_Dist_*``)
and check our warp against it through that identity. When lensfunpy is installed (it bundles liblensfun
0.3.4) they also run the real library, comparing only the coordinates its SSE loops compute with the
pixel's own factor (the tool's docstring describes the lane bug).
"""

from __future__ import annotations

import math
import unittest

from shootflow import dng_opcodes as do
from shootflow import lens_profiles as lp
from test_lens_profiles import DB_XML, db

try:
    import lensfunpy  # noqa: F401

    HAVE_LENSFUNPY = True
except ImportError:  # pragma: no cover - optional
    HAVE_LENSFUNPY = False


def released_source(warp, dist, cs, crop, x, y, w, h):
    """Our warp, carried to lensfun 0.3's geometry by the exact identity (the same as the tool's)."""

    a, b, c = dist.terms
    d = 1 - a - b - c if dist.model == "ptlens" else (1 - a if dist.model == "poly3" else 1.0)
    unit = 2.0 * cs.crop * math.hypot(cs.aspect, 1.0) / crop
    s3, sm = unit / math.hypot(w - 1, h - 1), unit / math.hypot(w, h)
    cx, cy = (w - 1) / 2.0, (h - 1) / 2.0
    k = s3 * d / sm
    # The identity reads the warp out to radius k > 1 at the corners: lift the opcode's clamp at max_valid_radius
    # (1), which would otherwise hold the polynomial at r = 1 there.
    warp = do.WarpRectilinear2(tuple(t[:18] + (4.0,) for t in warp.terms), warp.cx, warp.cy, warp.reciprocal)
    sx, sy = do.warp_source(warp, 0, cx + k * (x - cx), cy + k * (y - cy), w, h)
    return cx + (sm / s3) * (sx - cx), cy + (sm / s3) * (sy - cy)


def lensfun_03(model, terms, cal_crop, cal_aspect, crop, x, y, W, H):
    """lensfun v0.3.4: where output pixel (x, y) reads from (lfModifier constructor, then ModifyCoord_Dist_*)."""

    Wc, Hc = W - 1, H - 1
    size = min(Wc, Hc)
    image_aspect = max(Wc, Hc) / size
    cc = 1 / math.sqrt(image_aspect**2 + 1) * cal_crop / crop * math.sqrt(cal_aspect**2 + 1)
    norm = 2.0 / size * cc
    cx, cy = Wc / size * cc, Hc / size * cc
    u, v = x * norm - cx, y * norm - cy
    r2 = u * u + v * v
    r = math.sqrt(r2)
    if model == "ptlens":
        a, b, c = terms
        poly = a * r2 * r + b * r2 + c * r + (1 - a - b - c)
    elif model == "poly3":
        poly = (1 - terms[0]) + terms[0] * r2
    else:
        poly = 1 + terms[0] * r2 + terms[1] * r2 * r2
    return (u * poly + cx) / norm, (v * poly + cy) / norm


CASES = (
    ("Testcam TC 18-55mm f/3.5-5.6 IS", 18, 1.5),  # ptlens, calibrated
    ("Testcam TC 18-55mm f/3.5-5.6 IS", 30, 1.5),  # ptlens, interpolated
    ("Testcam TC 18-55mm f/3.5-5.6 IS", 24, 2.0),  # a smaller sensor than the calibration's
    ("Testcam TC 50mm f/1.8", 50, 1.0),  # poly3 on a 4:3 calibration
    ("Other 50mm f/1.8", 50, 1.0),  # poly5
)


def lens_named(d, name):
    return next(ln for ln in d.lenses if ln.name == name)


class ReleasedGeometryTests(unittest.TestCase):
    def setUp(self):
        self.db = db()

    def test_our_warp_is_lensfun_03_through_the_identity(self):
        for name, focal, crop in CASES:
            lens = lens_named(self.db, name)
            dist, cs = lp.interpolate_distortion(lens, crop, focal)
            for W, H in ((600, 400), (401, 300), (300, 450)):
                warp = lp.build_warp(lens, focal, crop, W, H, fill=False).warp
                for x, y in (
                    (0, 0),
                    (W - 1, H - 1),
                    (W // 3, H // 5),
                    (W - 7, 3),
                    (W // 2, H // 2),
                    (11, H // 2),
                ):
                    sx, sy = released_source(warp, dist, cs, crop, x, y, W, H)
                    lx, ly = lensfun_03(dist.model, dist.terms, cs.crop, cs.aspect, crop, x, y, W, H)
                    self.assertAlmostEqual(sx, lx, delta=1e-9, msg=(name, focal, W, H, x, y))
                    self.assertAlmostEqual(sy, ly, delta=1e-9, msg=(name, focal, W, H, x, y))

    def test_the_conventions_differ_by_about_d(self):
        # At the frame's corner the 0.3 release reads from d times as far out as master does, to about 1/W.
        lens = lens_named(self.db, "Testcam TC 18-55mm f/3.5-5.6 IS")
        dist, cs = lp.interpolate_distortion(lens, 1.5, 18)
        W, H = 600, 400
        warp = lp.build_warp(lens, 18, 1.5, W, H, fill=False).warp
        old = released_source(warp, dist, cs, 1.5, 0, 0, W, H)
        new = do.warp_source(warp, 0, 0, 0, W, H)
        c = ((W - 1) / 2, (H - 1) / 2)
        ratio = math.hypot(old[0] - c[0], old[1] - c[1]) / math.hypot(new[0] - c[0], new[1] - c[1])
        self.assertAlmostEqual(ratio, 1 - sum(dist.terms), delta=0.01)

    @unittest.skipUnless(HAVE_LENSFUNPY, "lensfunpy not installed")
    def test_real_lensfun_library(self):
        import lensfunpy

        # lensfun 0.3.4 reads database version 1; the fixture uses nothing version 2 added.
        ldb = lensfunpy.Database(
            xml=DB_XML.replace('version="2"', 'version="1"'), load_common=False, load_bundled=False
        )
        W, H = 600, 400  # a multiple of 4 wide: every row 16-byte aligned, so the SSE loops run
        for name, focal, crop in CASES:
            lens = lens_named(self.db, name)
            L = next(x for x in ldb.lenses if x.model == name)
            mod = lensfunpy.Modifier(L, crop, W, H)
            mod.initialize(focal, 8.0, scale=1.0, flags=lensfunpy.ModifyFlags.DISTORTION)
            grid = mod.apply_geometry_distortion()
            dist, cs = lp.interpolate_distortion(lens, crop, focal)
            warp = lp.build_warp(lens, focal, crop, W, H, fill=False).warp
            sse = dist.model in ("ptlens", "poly3")
            worst = 0.0
            for y in range(0, H, 9):
                for x in range(W):
                    sx, sy = released_source(warp, dist, cs, crop, x, y, W, H)
                    lx, ly = grid[y, x]
                    if not sse or x % 4 == 0:
                        worst = max(worst, abs(sx - float(lx)))
                    if not sse or x % 4 == 3:
                        worst = max(worst, abs(sy - float(ly)))
            # float32 inside lensfun, and for ptlens its approximate square root (_mm_rcp_ps(_mm_rsqrt_ps)).
            self.assertLess(worst, 0.03 if dist.model == "ptlens" else 2e-3, (name, focal, crop))


if __name__ == "__main__":
    unittest.main()
