import math, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import retune as R

A, H0 = 3.0, 0.5


class T(unittest.TestCase):
    def test_twin_kappa_hits_rho(self):
        for rho in (0.0, 0.5, 0.9):
            self.assertAlmostEqual(R.g(A, R.kappa_twin(A, H0, rho), H0), rho, places=12)

    def test_closed_form_is_minimum(self):
        n, w = R.miss_law(H0, 0.3)
        ks = R.kappa_ms(A, n, w)
        m = R.ms(A, ks, n, w)
        for d in (-1e-3, 1e-3, -0.1, 0.1):
            self.assertGreater(R.ms(A, ks + d, n, w), m)

    def test_point_mass_recovers_deadbeat(self):
        ks = R.kappa_ms(A, [H0], [1.0])
        self.assertAlmostEqual(ks, R.kappa_twin(A, H0, 0.0), places=12)
        self.assertAlmostEqual(R.ms(A, ks, [H0], [1.0]), 0.0, places=20)

    def test_retune_never_worse_ms(self):
        for q in (0.05, 0.2, 0.5):
            n, w = R.miss_law(H0, q)
            best = R.ms(A, R.kappa_ms(A, n, w), n, w)
            for rho in (0.0, 0.3, 0.5):
                self.assertLessEqual(best, R.ms(A, R.kappa_twin(A, H0, rho), n, w) + 1e-12)

    def test_as_optimum_beats_ms_optimum_lyapunov(self):
        n, w = R.miss_law(H0, 0.4)
        ka = R.kappa_as(A, n, w)
        self.assertLessEqual(R.lyap(A, ka, n, w), R.lyap(A, R.kappa_ms(A, n, w), n, w) + 1e-9)

    def test_largest(self):
        self.assertAlmostEqual(R.largest(lambda x: x < 0.3, 0, 1), 0.3, places=9)
        self.assertIsNone(R.largest(lambda x: False, 0, 1))
        self.assertEqual(R.largest(lambda x: True, 0, 1), 1)


if __name__ == "__main__":
    unittest.main()
