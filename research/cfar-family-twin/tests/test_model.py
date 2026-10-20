import math, unittest
from cfar_family_twin import *

N = 16


class T(unittest.TestCase):
    def test_os_formula_matches_twin_monte_carlo(self):
        S = ref_stats(math.inf, N, 60000, 1)
        for d, k in (("OS75", 12), ("OS50", 8)):
            a = os_twin_alpha(1e-2, N, k)
            self.assertAlmostEqual(os_twin_pfa(a, N, k), 1e-2, places=10)
            m, se = twin_pfa(a, S[d])
            self.assertLess(abs(m - 1e-2), 4 * se)

    def test_ca_threshold_matches_twin_monte_carlo(self):
        S = ref_stats(math.inf, N, 60000, 2)
        m, se = twin_pfa(ca_twin_alpha(1e-2, N), S["CA"])
        self.assertLess(abs(m - 1e-2), 4 * se)

    def test_calibrate_recovers_exact_os_threshold(self):
        S = ref_stats(math.inf, N, 100000, 3)
        a = calibrate(1e-2, S["OS75"], twin_pfa)
        self.assertAlmostEqual(a / os_twin_alpha(1e-2, N, 12), 1.0, delta=0.03)

    def test_rao_blackwell_matches_direct_simulation(self):
        tab = TextureTables(5.0)
        S = ref_stats(5.0, N, 60000, 4)
        for d in ("CA", "OS75", "LOG"):
            a = calibrate(1e-2, ref_stats(math.inf, N, 60000, 5)[d], twin_pfa)
            m, se = real_pfa(a, S[d], tab)
            mc = simulate_direct(d, a, N, 5.0, 120000, 6)
            self.assertAlmostEqual(mc / m, 1.0, delta=0.08)

    def test_pd_table_matches_direct_simulation(self):
        s = 100.0
        tab = TextureTables(5.0, (s,))
        S = ref_stats(5.0, N, 60000, 7)
        a = calibrate(1e-2, ref_stats(math.inf, N, 60000, 8)["CA"], twin_pfa)
        self.assertAlmostEqual(simulate_direct("CA", a, N, 5.0, 120000, 9, s=s) / real_pd(a, S["CA"], tab, s), 1.0, delta=0.03)

    def test_gaussian_limit_and_texture_inflates(self):
        a = ca_twin_alpha(1e-2, N)
        S = {nu: ref_stats(nu, N, 60000, 10)["CA"] for nu in (2.0, 20.0)}
        r = {nu: real_pfa(a, S[nu], TextureTables(nu))[0] for nu in S}
        self.assertGreater(r[2.0], r[20.0])
        self.assertGreater(r[20.0], 1e-2)

    def test_pd_conditional_is_continuous_at_equal_power(self):
        self.assertAlmostEqual(TextureTables._pd_cond(3.0, 1.0, 1.0 + 1e-6), TextureTables._pd_cond(3.0, 1.0, 1.0), places=4)


if __name__ == "__main__":
    unittest.main()
