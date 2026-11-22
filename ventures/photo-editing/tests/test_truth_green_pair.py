"""``tools/truth_noise_check.py green_pair18`` and ``near_clean_gate`` joining ``truth_gg18``
(eval/noise-pca-mpcws-noisy-truth-2026-11-22.md)."""

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

HAVE_NUMPY = importlib.util.find_spec("numpy") is not None
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

SITES = [(0, 1), (1, 0)]  # RGGB's two green sites


@unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
class GreenPair(unittest.TestCase):
    def setUp(self):
        import numpy as np

        from truth_noise_check import green_pair18

        self.np, self.gp = np, green_pair18
        rng = np.random.default_rng(3)
        self.rng = rng
        self.h = 960
        self.level = 0.2 + 0.4 * np.linspace(0, 1, self.h)[None, :] * np.ones((self.h, 1))  # a smooth ramp
        self.white = rng.normal(size=(self.h, self.h)) * 0.004

    def test_white_noise_reads_its_own_level_in_truth_units(self):
        sigma = 0.01
        sub = self.level + self.rng.normal(size=self.level.shape) * sigma
        # truth units: say the truth carries white raw noise at 3x its raw sigma
        got = self.gp(sub, self.white, SITES, level=0.3, white_in_truth=3 * 0.004)
        self.assertAlmostEqual(got / (3 * sigma), 1.0, delta=0.05)

    def test_correlated_noise_reads_above_a_white_scaling(self):
        np = self.np
        sigma = 0.01
        n = self.rng.normal(size=self.level.shape) * sigma
        # noise shared over 2 x 2 sensels (each cell one draw): the per-sensel sigma is the same, but 4 x 4 bins
        # average only 4 independent draws instead of 16, so the binned grain is twice the white case's
        cells = np.repeat(np.repeat(n[::2, ::2], 2, axis=0), 2, axis=1)
        jitter = self.rng.normal(size=self.level.shape) * sigma * 0.05  # keeps the two sites from cancelling exactly
        got = self.gp(self.level + cells + jitter, self.white, SITES, level=0.3, white_in_truth=0.004)
        self.assertIsNotNone(got)
        self.assertLess(got, sigma * 0.5)  # shared by both sites: the difference cancels it (the note's caveat)
        # one draw per column over 4 rows: each site's 4 x 4 bin holds 2 independent draws, not 4, so the binned
        # grain is sqrt(2) times what white noise of the same per-sensel sigma gives, and the reading says so
        streaks = np.repeat(self.rng.normal(size=(self.h // 4, self.h)) * sigma, 4, axis=0)
        got = self.gp(self.level + streaks, self.white, SITES, level=0.3, white_in_truth=0.004)
        self.assertAlmostEqual(got / (np.sqrt(2) * sigma), 1.0, delta=0.05)

    def test_needs_two_green_sites(self):
        self.assertIsNone(self.gp(self.level, self.white, [(0, 1)], level=0.3, white_in_truth=0.004))


@unittest.skipUnless(HAVE_NUMPY, "numpy not installed")
class JoinIntoCleanEnough(unittest.TestCase):
    def test_the_larger_truth_reading_decides(self):
        import near_clean_gate as ncg

        row = {"file": "a.pef", "tile": [0, 0], "split": "tune", "snr": 25.0, "truth_grain18": 0.005,
               "cpsnr": {"D": 1}, "lpsnr": {"D": 1}}
        self.assertTrue(ncg.clean_enough(row))  # 0.18 / 0.005 = 36 >= 25
        with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False) as f:
            f.write(json.dumps(row) + "\n")
        with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False) as gf:
            gf.write(json.dumps({"file": "a.pef", "tile": [0, 0], "gg18": 0.01}) + "\n")
        self.assertEqual(len(ncg.load([f.name], clean_truths=True)), 1)
        self.assertEqual(len(ncg.load([f.name], clean_truths=True, gg=ncg.gg_of(gf.name))), 0)  # 18 < 25


if __name__ == "__main__":
    unittest.main()
