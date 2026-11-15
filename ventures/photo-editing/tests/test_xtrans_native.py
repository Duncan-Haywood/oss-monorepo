"""The C path of the directional X-Trans demosaic (``shootflow.xtrans_native``) against the numpy reference.

The C function repeats ``xtrans_demosaic._directional_piece`` step for step (reflected edges as
``np.pad(mode="reflect")``, the directional green in double as numpy promotes it, float32 elsewhere, the
same order of operations), so the outputs must be equal bit for bit on every layout, phase and setting.
Skipped when numpy is missing or no C compiler builds the library.
"""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None

from shootflow import xtrans_native
from test_raf import XE1_PATTERN


def _rotate(pat, dy, dx):
    return tuple(pat[((y + dy) % 6) * 6 + (x + dx) % 6] for y in range(6) for x in range(6))


def _scene(h, w, seed=0):
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    c = 0.4 + 0.3 * np.sin(x * x / (3.0 * w)) * np.cos(y / 3.0)  # a chirp: edges at every angle and pitch
    c = np.where(x * 0.9 + y * 0.3 > w / 2, c * 0.35, c)  # a hard step
    c += rng.normal(0, 0.02, size=(h, w)).astype(np.float32)  # noise
    c[h // 3, :] = 1.5  # an over-range line (a blown highlight after white balance)
    c[:, w // 4] = 0.0  # a dead column
    return np.clip(c, 0, None).astype(np.float32)


@unittest.skipIf(np is None, "numpy not installed")
@unittest.skipUnless(np is not None and xtrans_native.available(), "no C compiler for the native demosaic")
class NativeXTrans(unittest.TestCase):
    def setUp(self):
        from shootflow.xtrans_demosaic import directional

        self.d = directional

    def same(self, c, pat, **kw):
        a = self.d(c, pat, native=False, **kw)
        b = self.d(c, pat, native=True, **kw)
        self.assertEqual(a.dtype, b.dtype)
        self.assertTrue(np.array_equal(a, b), float(np.max(np.abs(a - b))))

    def test_bit_identical_every_phase(self):
        c = _scene(61, 83)
        for dy in range(6):
            for dx in (0, 1, 3, 5):
                with self.subTest(dy=dy, dx=dx):
                    self.same(c, _rotate(XE1_PATTERN, dy, dx))

    def test_settings(self):
        c = _scene(50, 70, seed=3)
        for clamp in (True, False):
            for passes in (1, 2, 3):
                for median in (0, 1, 2):
                    with self.subTest(clamp=clamp, passes=passes, median=median):
                        self.same(c, XE1_PATTERN, clamp=clamp, passes=passes, median_passes=median)

    def test_bayer_layout_and_small_frames(self):
        for h, w in ((6, 6), (7, 13), (6, 40), (40, 7), (25, 31)):
            c = _scene(h, w, seed=h * w)
            for pat in (XE1_PATTERN, (0, 1, 1, 2), (1, 2, 0, 1)):
                with self.subTest(h=h, w=w, pat=pat[:4]):
                    self.same(c, pat)

    def test_sparse_layout_takes_the_wide_fallback(self):
        # A sparse 6x6 layout (found by search) where some 3x3 windows hold no red or no blue but every
        # 5x5 does, so _box_average falls back to box3(box3(.)) there; the C path must do the same.
        pat = (1, 1, 2, 1, 1, 1, 1, 2, 1, 2, 2, 1, 1, 1, 0, 1, 0, 1, 0, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1)
        c = _scene(40, 52, seed=5)
        self.assertFalse(np.isnan(self.d(c, pat, native=False)).any())
        self.same(c, pat)

    def test_bands_and_threads(self):
        c = _scene(500, 90, seed=7)
        one = self.d(c, XE1_PATTERN, native=False, band_rows=None)
        for band_rows, threads in ((None, 1), (60, 1), (192, 4), (66, 3)):
            with self.subTest(band_rows=band_rows, threads=threads):
                b = self.d(c, XE1_PATTERN, native=True, band_rows=band_rows, threads=threads)
                self.assertTrue(np.array_equal(one, b))

    def test_flat_and_scale(self):
        c = np.full((30, 36), 0.25, dtype=np.float32)
        self.same(c, XE1_PATTERN)
        self.same(_scene(30, 36) * 4000, XE1_PATTERN, scale=1000.0)

    def test_homogeneity_falls_back_and_switch(self):
        c = _scene(30, 36)
        a = self.d(c, XE1_PATTERN, select="homogeneity")  # auto: numpy, no error
        self.assertEqual(a.shape, (30, 36, 3))
        with self.assertRaises(RuntimeError):
            self.d(c, XE1_PATTERN, select="homogeneity", native=True)
        old = os.environ.get("SHOOTFLOW_NATIVE")
        os.environ["SHOOTFLOW_NATIVE"] = "0"
        saved = dict(xtrans_native._STATE)
        xtrans_native._STATE.clear()
        try:
            self.assertFalse(xtrans_native.available())
            with self.assertRaises(RuntimeError):
                self.d(c, XE1_PATTERN, native=True)
        finally:
            xtrans_native._STATE.clear()
            xtrans_native._STATE.update(saved)
            if old is None:
                os.environ.pop("SHOOTFLOW_NATIVE", None)
            else:
                os.environ["SHOOTFLOW_NATIVE"] = old


if __name__ == "__main__":
    unittest.main()
