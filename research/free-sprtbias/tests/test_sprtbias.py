import sys, unittest
from pathlib import Path
HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
from sprtbias import false_certify, tolerated_ratio, derated_size  # noqa: E402

A = B = 0.05


class Tests(unittest.TestCase):
    def test_unbiased_matches_nominal(self):
        for kind in ("fixed", "sprt"):
            self.assertLessEqual(false_certify(0.05, 1.0, 0.05, 0.01, A, B, kind), 0.0501)

    def test_known_fixed_size(self):
        self.assertEqual(derated_size(1.0, 0.05, 0.01, A, B)[0], 181)  # free-sprtcert's published n

    def test_more_optimism_more_false_certificates(self):
        for kind in ("fixed", "sprt"):
            v = [false_certify(0.05, r, 0.05, 0.01, A, B, kind) for r in (1.0, 0.9, 0.7, 0.5)]
            self.assertEqual(v, sorted(v))

    def test_tolerated_ratio_inverts(self):
        r = tolerated_ratio(0.10, 0.05, 0.01, A, B, "fixed")
        self.assertAlmostEqual(false_certify(0.05, r, 0.05, 0.01, A, B, "fixed"), 0.10, delta=0.005)

    def test_derating_cannot_separate(self):
        self.assertIsNone(derated_size(5.0, 0.05, 0.01, A, B))

    def test_derating_grows_n_and_restores_guard(self):
        n1 = derated_size(1.0, 0.05, 0.01, A, B)[0]
        n2, c2 = derated_size(1.25, 0.05, 0.01, A, B)
        self.assertGreater(n2, n1)
        from sprtcert import accept_prob_fixed
        self.assertLessEqual(accept_prob_fixed(n2, c2, 0.05 / 1.25), 0.05)


if __name__ == "__main__":
    unittest.main()
