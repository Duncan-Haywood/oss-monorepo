import sys, unittest
from pathlib import Path
HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "free-sprtcert"))
from sprtcap import stopping_law, quantile, mean, tail  # noqa: E402
from sprtcert import sprt  # noqa: E402

A = B = 0.05


class Tests(unittest.TestCase):
    def test_stop_law_sums_to_one(self):
        r = stopping_law(0.03, 0.05, 0.01, A, B, 400)
        self.assertAlmostEqual(sum(r["stop"]), 1.0, places=9)

    def test_large_cap_matches_untruncated_sprt(self):
        r = stopping_law(0.05, 0.05, 0.01, A, B, 2000)
        e = sprt(0.05, 0.05, 0.01, A, B, nmax=2000)
        self.assertAlmostEqual(r["accept"], e["accept"], places=6)
        self.assertAlmostEqual(mean(r["stop"]), e["asn"], places=6)

    def test_truncation_never_exceeds_cap(self):
        r = stopping_law(0.03, 0.05, 0.01, A, B, 100)
        self.assertEqual(len(r["stop"]), 101)
        self.assertGreater(r["truncated"], 0)
        self.assertLessEqual(quantile(r["stop"], 1.0), 100)

    def test_tail_and_quantile_consistent(self):
        r = stopping_law(0.05, 0.05, 0.01, A, B, 1000)
        q = quantile(r["stop"], 0.9)
        self.assertLessEqual(tail(r["stop"], q), 0.1 + 1e-12)
        self.assertGreater(tail(r["stop"], q - 1), 0.1 - 1e-12)

    def test_tiny_cap_decides_by_sign_of_lr(self):
        # cap 1: one trial, success -> LR for p1 favoured -> accept; failure -> reject
        r = stopping_law(0.0, 0.05, 0.01, A, B, 1)
        self.assertEqual(r["accept"], 1.0)
        r = stopping_law(1.0, 0.05, 0.01, A, B, 1)
        self.assertEqual(r["accept"], 0.0)


if __name__ == "__main__":
    unittest.main()
