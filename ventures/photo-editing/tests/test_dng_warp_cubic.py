"""Tests for the cubic (Catmull-Rom) resampling kernel the warps can use (``kernel="cubic"``, ``--warp-kernel cubic``).

The DNG 1.7.1.0 specification recommends "a suitable resampling kernel, such as
a cubic spline" for WarpRectilinear and WarpRectilinear2 (p. 107). The kernel
here is Keys' cubic convolution with a = -0.5, the Catmull-Rom spline, which
reproduces any quadratic exactly: on a quadratic ramp every interior warped
pixel must equal the ramp at the source point the warp names, where bilinear
sampling is off by up to a quarter of the curvature. Both engines must give
the same bytes, as they do for bilinear.
"""

from __future__ import annotations

import random
import unittest
from array import array

from shootflow import dng_opcodes as do
from shootflow import raw_develop as rd
from test_dng_opcodes import HAVE_NUMPY
from test_dng_warp import warp_tag
from test_raw_develop import make_dng, patch_sensor


def quad(w, h, c=(0.2, 0.25, 0.15), b=(0.004, 0.003, 0.005), q=(0.0004, -0.0001, 0.0002)):
    """Each plane ``c + b x + q x^2`` (independent of y), kept inside 0..1."""

    rgb = array("d")
    for _y in range(h):
        for x in range(w):
            for p in range(3):
                rgb.append(c[p] + b[p] * x + q[p] * x * x)
    return rgb


SHRINK = do.WarpRectilinear(((0.93, 0.02, 0.0, 0.0, 0.0, 0.0),), 0.5, 0.5)


class KernelTests(unittest.TestCase):
    def test_weights_sum_to_one_and_reproduce_a_line(self):
        for t in (0.0, 0.1, 0.25, 0.5, 0.75, 0.999):
            w = do._cubic_weights(t)
            self.assertAlmostEqual(sum(w), 1.0, places=14)
            # sum w_k * (k - 1) over offsets -1, 0, 1, 2 is the fraction itself
            self.assertAlmostEqual(-w[0] + w[2] + 2 * w[3], t, places=14)

    def test_whole_pixel_is_that_pixel(self):
        self.assertEqual(do._cubic_weights(0.0), (0.0, 1.0, 0.0, 0.0))

    def test_quadratic_is_exact_where_bilinear_is_not(self):
        w, h = 40, 6
        src = quad(w, h)
        cubic = do.warp_rgb([SHRINK], src, w, h, kernel="cubic")
        lin = do.warp_rgb([SHRINK], src, w, h)
        worst_c = worst_b = 0.0
        y = h // 2
        for x in range(w):
            for p in range(3):
                sx, _sy = do.warp_source(SHRINK, p, x, y, w, h)
                if not 1.0 <= sx <= w - 3.0:  # all four taps inside the image
                    continue
                c, b, q = (0.2, 0.25, 0.15)[p], (0.004, 0.003, 0.005)[p], (0.0004, -0.0001, 0.0002)[p]
                want = c + b * sx + q * sx * sx
                k = (y * w + x) * 3 + p
                worst_c = max(worst_c, abs(cubic[k] - want))
                worst_b = max(worst_b, abs(lin[k] - want))
        self.assertLess(worst_c, 1e-12)
        self.assertGreater(worst_b, 1e-5)

    def test_overshoot_is_clipped_to_the_plane_range(self):
        # A hard 0 -> 1 edge: the unclipped spline rings below 0 and above 1 next to it.
        w, h = 24, 4
        src = array("d", ((1.0 if x >= w // 2 else 0.0) for _y in range(h) for x in range(w) for _p in range(3)))
        shift = do.WarpRectilinear(((0.97, 0, 0, 0, 0, 0),), 0.5, 0.5)
        out = do.warp_rgb([shift], src, w, h, kernel="cubic")
        self.assertGreaterEqual(min(out), 0.0)
        self.assertLessEqual(max(out), 1.0)
        capped = do.warp_rgb([shift], array("d", (v * 2.0 for v in src)), w, h, kernel="cubic", scale=(2.0, 2.0, 2.0))
        self.assertLessEqual(max(capped), 2.0)
        self.assertEqual(max(capped), 2.0)

    def test_outside_the_image_takes_the_edge(self):
        w, h = 10, 5
        src = quad(w, h)
        grow = do.WarpRectilinear(((1.4, 0, 0, 0, 0, 0),), 0.5, 0.5)  # corners read far outside the frame
        out = do.warp_rgb([grow], src, w, h, kernel="cubic")
        self.assertEqual(out[0:3], src[0:3])

    def test_unknown_kernel_raises(self):
        with self.assertRaises(ValueError):
            do.warp_rgb([SHRINK], quad(4, 4), 4, 4, kernel="lanczos")


@unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
class EngineTests(unittest.TestCase):
    def test_warp_planes_matches_warp_rgb_for_every_warp(self):
        import numpy as np

        rng = random.Random(5)
        w, h = 31, 19
        src = array("d", (rng.random() for _ in range(w * h * 3)))
        wr2_plane = (0.98, 0.0, 0.05, -0.01) + (0.0,) * 11 + (0.001, -0.002, 0.0, 1.0)
        warps = [
            do.WarpRectilinear(((0.97, 0.02, 0.003, 0.001, 0.001, -0.002), (1.01, -0.03, 0, 0, 0, 0)), 0.4, 0.6),
            do.WarpRectilinear2((wr2_plane,), 0.55, 0.45, False),
            do.WarpFisheye(((1.0, -0.05, 0.01, 0.0),), 0.5, 0.5),
        ]
        scale = (1.7, 1.0, 1.3)
        for wp in warps:
            with self.subTest(warp=type(wp).__name__):
                pure = do.warp_rgb([wp], src, w, h, kernel="cubic", scale=scale)
                arr = np.frombuffer(src.tobytes(), dtype=np.float64).reshape(h, w, 3).copy()
                npy = do.warp_planes([wp], arr, band=4, kernel="cubic", scale=scale)
                self.assertEqual(npy.tobytes(), pure.tobytes())

    def test_thread_count_and_band_height_never_change_the_bytes(self):
        import numpy as np

        rng = random.Random(9)
        w, h = 37, 29
        src = array("d", (rng.random() for _ in range(w * h * 3)))
        # Strong enough that source points fall past every edge, so the padded taps are exercised there too.
        wp = do.WarpRectilinear(((1.12, 0.05, 0.01, 0.0, 0.002, -0.003), (0.9, 0.04, 0, 0, 0, 0)), 0.45, 0.55)
        for kernel in do.WARP_KERNELS:
            pure = do.warp_rgb([wp], src, w, h, kernel=kernel)
            for band, threads in ((1, 1), (3, 4), (7, 2), (64, 1), (5, 16)):
                with self.subTest(kernel=kernel, band=band, threads=threads):
                    arr = np.frombuffer(src.tobytes(), dtype=np.float64).reshape(h, w, 3).copy()
                    npy = do.warp_planes([wp], arr, band=band, kernel=kernel, threads=threads)
                    self.assertEqual(npy.tobytes(), pure.tobytes())

    def test_cubic_is_the_default_kernel(self):
        self.assertEqual(rd.DevelopSettings().warp_kernel, "cubic")

    def test_develop_engines_agree_and_cubic_differs_from_bilinear(self):
        rng = random.Random(17)
        w, h = 40, 14
        sensor = [max(0, min(4095, v + rng.randint(-400, 400))) for v in patch_sensor(w, h, gain=1.3)]
        terms = [(0.92, 0.04, 0.0, 0.0, 0.001, -0.001), (0.93, 0.03, 0, 0, 0, 0), (0.94, 0.02, 0, 0, 0, 0)]
        raw = rd.parse_raw(make_dng(sensor, w, h, extra_raw_tags=[warp_tag(terms, 0.45, 0.55)]))
        for half in (False, True):
            with self.subTest(half=half):
                py = rd.develop(raw, rd.DevelopSettings(engine="python", half=half, warp_kernel="cubic"))
                npy = rd.develop(raw, rd.DevelopSettings(engine="numpy", half=half, warp_kernel="cubic"))
                lin = rd.develop(raw, rd.DevelopSettings(engine="numpy", half=half, warp_kernel="bilinear"))
                self.assertEqual(py[2].tobytes(), npy[2].tobytes())
                self.assertNotEqual(npy[2].tobytes(), lin[2].tobytes())


class CliTests(unittest.TestCase):
    def test_warp_kernel_flag_changes_the_output(self):
        import io
        import json
        import tempfile
        from pathlib import Path

        from shootflow.cli import main

        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "lens.dng"
            src.write_bytes(make_dng(patch_sensor(24, 8), 24, 8, extra_raw_tags=[warp_tag([(0.9, 0.03, 0, 0, 0, 0)])]))
            outs = []
            # Cubic is the default since 2026-11-13: no flag and "--warp-kernel bilinear" must differ.
            for i, extra in enumerate(([], ["--warp-kernel", "bilinear"])):
                out = io.StringIO()
                code = main(
                    ["develop", str(src), "--out", str(Path(tmp) / f"m{i}"), "--engine", "python", *extra],
                    stdout=out,
                    stderr=io.StringIO(),
                )
                self.assertEqual(code, 0)
                path = json.loads(out.getvalue())["developed"][0]["master"]
                outs.append(Path(path).read_bytes())
        self.assertNotEqual(outs[0], outs[1])


if __name__ == "__main__":
    unittest.main()
