"""The C path of the directional Bayer demosaic (``shootflow.bayer_native``) against the numpy reference.

The C function repeats ``bayer_demosaic._piece`` step for step in float32 with the same order of
operations, so with the default ``power=2`` the outputs are equal bit for bit (measured on real frames in
``eval/bayer-native-2026-11-15.md``); other powers go through ``powf`` and agree to a few ulps. Skipped
when numpy is missing or no C compiler builds the library.
"""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None

from shootflow import bayer_native

PHASES = ((0, 1, 1, 2), (2, 1, 1, 0), (1, 0, 2, 1), (1, 2, 0, 1))


def _scene(h, w, seed=0):
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    c = 0.4 + 0.3 * np.sin(x * x / (3.0 * w)) * np.cos(y / 3.0)  # a chirp: edges at every angle and pitch
    c = np.where(x * 0.9 + y * 0.3 > w / 2, c * 0.35, c)  # a hard step
    c += rng.normal(0, 0.02, size=(h, w)).astype(np.float32)  # noise
    c[h // 3, :] = 1.5  # an over-range line (a blown highlight after white balance)
    return np.clip(c, 0, None).astype(np.float32)


@unittest.skipIf(np is None, "numpy not installed")
@unittest.skipUnless(np is not None and bayer_native.available(), "no C compiler for the native demosaic")
class NativeBayer(unittest.TestCase):
    def setUp(self):
        from shootflow.bayer_demosaic import directional

        self.d = directional

    def test_bit_identical_every_phase_both_rb(self):
        c = _scene(97, 131)
        for pat in PHASES:
            for rb in ("weighted", "simple"):
                with self.subTest(pat=pat, rb=rb):
                    a = self.d(c, pat, rb=rb, native=False)
                    b = self.d(c, pat, rb=rb, native=True)
                    self.assertTrue(np.array_equal(a, b), float(np.max(np.abs(a - b))))

    def test_windows_and_tiny_frames(self):
        for h, w in ((2, 2), (3, 5), (5, 64), (64, 3), (33, 21)):
            c = _scene(h, w, seed=h * w)
            for window in (0, 1, 2, 3, 12):
                with self.subTest(h=h, w=w, window=window):
                    a = self.d(c, (0, 1, 1, 2), window=window, native=False)
                    b = self.d(c, (0, 1, 1, 2), window=window, native=True)
                    self.assertTrue(np.array_equal(a, b))

    def test_laplace_weights_bit_identical(self):
        c = _scene(83, 101)
        for lap in (0.25, 0.125, 0.2):
            with self.subTest(laplace=lap):
                a = self.d(c, (0, 1, 1, 2), laplace=lap, native=False)
                b = self.d(c, (0, 1, 1, 2), laplace=lap, native=True)
                self.assertTrue(np.array_equal(a, b), float(np.max(np.abs(a - b))))

    def test_learned_laplace_bit_identical(self):
        """laplace="learned" (eval/bayer-learned-native-2026-11-16.md): the eight features and the fitted
        per-sensel weight in C equal numpy's bit for bit on every phase, both red/blue modes, tiny frames,
        and for a 9-weight linear model and a constant one; a weight list of another length is refused."""

        from shootflow import bayer_demosaic as bd

        for pat in PHASES:
            for h, w in ((97, 131), (2, 2), (3, 5), (40, 9)):
                c = _scene(h, w, seed=h + w)
                for rb in ("weighted", "simple"):
                    with self.subTest(pat=pat, h=h, w=w, rb=rb):
                        a = self.d(c, pat, rb=rb, laplace="learned", native=False)
                        b = self.d(c, pat, rb=rb, laplace="learned", native=True)
                        self.assertTrue(np.array_equal(a, b), float(np.max(np.abs(a - b))))
        c = _scene(61, 73, seed=5)
        linear = tuple(bd.LEARNED_LAPLACE[:9])
        for coef in (linear, (0.2,) + (0.0,) * 8):
            a = self.d(c, (1, 0, 2, 1), laplace=coef, native=False)
            b = self.d(c, (1, 0, 2, 1), laplace=coef, native=True)
            self.assertTrue(np.array_equal(a, b))
        out = np.zeros((4, 4, 3), np.float32)
        with self.assertRaises(ValueError):
            bayer_native.piece(np.ones((8, 8), np.float32), np.ones((8, 8), np.int8), 2, 2.0, False, 1e-6, 2, 2, out,
                               learned=(0.1,) * 10)

    def test_learned_ring_edges(self):
        """The fused learned path keeps its intermediates in 8-row rings (eval/bayer-learned-fused-2026-11-16.md):
        every frame height from 2 to 19 rows, so the band is shorter than, as tall as and taller than the
        ring with the edge rows held, still equals numpy bit for bit."""

        for h in range(2, 20):
            for w in (2, 4, 13):
                c = _scene(h, w, seed=7 * h + w)
                with self.subTest(h=h, w=w):
                    a = self.d(c, (2, 1, 1, 0), laplace="learned", native=False)
                    b = self.d(c, (2, 1, 1, 0), laplace="learned", native=True, band=16)
                    self.assertTrue(np.array_equal(a, b), float(np.max(np.abs(a - b))))

    def test_learned_band_and_threads_change_nothing(self):
        c = _scene(301, 77, seed=3)
        whole = self.d(c, (0, 1, 1, 2), laplace="learned", native=True, band=1000, threads=1)
        for band, threads in ((16, 1), (37, 3), (128, 4)):
            got = self.d(c, (0, 1, 1, 2), laplace="learned", native=True, band=band, threads=threads)
            self.assertTrue(np.array_equal(got, whole), (band, threads))

    def test_other_powers_agree_to_rounding(self):
        c = _scene(70, 90)
        for power in (1.0, 3.5):
            a = self.d(c, (1, 2, 0, 1), power=power, native=False)
            b = self.d(c, (1, 2, 0, 1), power=power, native=True)
            self.assertLess(float(np.max(np.abs(a - b))), 1e-5)

    def test_band_and_threads_change_nothing(self):
        c = _scene(301, 77)
        ref = self.d(c, (2, 1, 1, 0), native=True, band=301, threads=1)
        for band, threads in ((16, 4), (37, 2), (128, None)):
            with self.subTest(band=band, threads=threads):
                self.assertTrue(np.array_equal(ref, self.d(c, (2, 1, 1, 0), native=True, band=band, threads=threads)))

    def test_auto_picks_c_and_falls_back(self):
        c = _scene(40, 50)
        self.assertTrue(np.array_equal(self.d(c, (0, 1, 1, 2)), self.d(c, (0, 1, 1, 2), native=True)))
        # the median clean-up and windows past 12 have no C path: auto runs numpy, native=True refuses
        self.assertTrue(np.array_equal(self.d(c, (0, 1, 1, 2), median_passes=1),
                                       self.d(c, (0, 1, 1, 2), median_passes=1, native=False)))
        with self.assertRaises(RuntimeError):
            self.d(c, (0, 1, 1, 2), median_passes=1, native=True)
        with self.assertRaises(RuntimeError):
            self.d(c, (0, 1, 1, 2), window=13, native=True)
        self.assertEqual(self.d(c, (0, 1, 1, 2), window=13).shape, (40, 50, 3))

    def test_switch_off(self):
        old = os.environ.get("SHOOTFLOW_NATIVE")
        saved = dict(bayer_native._STATE)
        try:
            os.environ["SHOOTFLOW_NATIVE"] = "0"
            bayer_native._STATE.clear()
            self.assertFalse(bayer_native.available())
        finally:
            bayer_native._STATE.clear()
            bayer_native._STATE.update(saved)
            if old is None:
                os.environ.pop("SHOOTFLOW_NATIVE", None)
            else:
                os.environ["SHOOTFLOW_NATIVE"] = old


if __name__ == "__main__":
    unittest.main()
