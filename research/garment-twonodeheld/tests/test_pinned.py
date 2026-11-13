"""Pins the headline numbers in README.md / experiments/results.txt.

unittest.TestCase so `python3 -m unittest discover` (what CI runs) finds it;
the bare pytest functions in test_held.py are also run from here. Added by the
2026-11-13 quality audit, where 5 of 7 seeded bugs survived the old tests.
"""
import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
sys.path.insert(0, os.path.dirname(__file__))
from garment_twonodeheld import held as h
import test_held

BAND = (33.6, 33.7)


class Pinned(unittest.TestCase):
    def test_tuned_band_and_train_mean(self):
        b, s = h.tune(h.TRAIN, h.OURS)
        self.assertEqual(tuple(round(x, 6) for x in b), BAND)
        self.assertAlmostEqual(s, 0.880, delta=5e-4)

    def test_held_out_between_mean(self):
        self.assertAlmostEqual(h.mean_score(h.TEST_BETWEEN, h.OURS, band=BAND), 0.834, delta=5e-4)

    def test_lag_changes_the_score(self):
        sc = h.TRAIN[0]
        self.assertNotEqual(h.score(sc, h.OURS, band=BAND, lag=5.0), h.score(sc, h.OURS, band=BAND))

    def test_pytest_functions(self):
        for name in dir(test_held):
            if name.startswith("test_"):
                getattr(test_held, name)()


if __name__ == "__main__":
    unittest.main()
