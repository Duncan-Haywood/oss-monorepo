import math, random, unittest
from crn_twin import *


def mc_rho(w, q, reps, seed, mode="stream"):
    rng = random.Random(seed)
    sab = saa = sbb = 0.0
    for _ in range(reps):
        a, b = sample_pair(w, q, rng, mode)
        sab += a * b; saa += a * a; sbb += b * b
    return sab / math.sqrt(saa * sbb)


class M(unittest.TestCase):
    def test_no_extra_draws_full_correlation(self):
        self.assertAlmostEqual(rho_exact(weights("flat", 20), 0.0), 1.0)

    def test_terminal_cost_closed_form(self):
        for q in (0.05, 0.3):
            self.assertAlmostEqual(rho_exact(weights("terminal", 20), q), (1 - q) ** 20, places=12)

    def test_flat_matches_simulation(self):
        w = weights("flat", 20)
        for q in (0.05, 0.3):
            self.assertLess(abs(mc_rho(w, q, 40000, 1) - rho_exact(w, q)), 0.012)

    def test_ramp_and_discount_match_simulation(self):
        for kind in ("ramp", "discount"):
            w = weights(kind, 20)
            self.assertLess(abs(mc_rho(w, 0.1, 40000, 2) - rho_exact(w, 0.1)), 0.012)

    def test_counter_streams_restore_full_correlation(self):
        self.assertGreater(mc_rho(weights("terminal", 20), 0.3, 2000, 3, "counter"), 0.999999)

    def test_rho_monotone_in_q(self):
        w = weights("flat", 20)
        rs = [rho_exact(w, q) for q in (0.0, 0.05, 0.1, 0.3, 0.6)]
        self.assertTrue(all(a > b for a, b in zip(rs, rs[1:])))

    def test_sample_size_scales_with_one_minus_rho(self):
        w = weights("flat", 20)
        r = rho_exact(w, 0.1)
        self.assertAlmostEqual(n_required(diff_var_exact(w, 0.1), 1.0) / n_required(diff_var_exact(w, 0.1, paired=False), 1.0), 1 - r)

    def test_t_quantile_known(self):
        self.assertAlmostEqual(t_quantile(0.975, 10), 2.2281, places=3)


if __name__ == "__main__":
    unittest.main()
