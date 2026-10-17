import math, random, unittest
from tail_risk_elicitation import *


def quantile_atoms(q, n=4000):
    return [(q((i + 0.5) / n), 1.0 / n) for i in range(n)]


class T(unittest.TestCase):
    def test_es_not_elicitable_alone(self):
        # Osband: level sets of an elicitable property are convex. Two laws with ES=1.6, a mixture with ES != 1.6.
        a = 0.5
        P0 = [(1.6, 1.0)]
        P1 = [(0.0, 0.9), (8.0, 0.1)]
        self.assertAlmostEqual(var_es(P0, a)[1], 1.6, 12)
        self.assertAlmostEqual(var_es(P1, a)[1], 1.6, 12)
        M = mixture(P0, P1, 0.5)
        self.assertGreater(abs(var_es(M, a)[1] - 1.6), 0.5)

    def test_joint_argmin_finite(self):
        rng = random.Random(3)
        for _ in range(20):
            atoms = [(rng.uniform(0.1, 5), 1.0) for _ in range(7)]
            z = sum(p for _, p in atoms); atoms = [(x, p / z) for x, p in atoms]
            al = rng.choice([0.5, 0.8, 0.9])
            v, e = var_es(atoms, al)
            base = expected_score(atoms, v, e, al)
            for _ in range(300):
                v2, e2 = v * rng.uniform(0.4, 1.8), e * rng.uniform(0.4, 1.8)
                self.assertGreaterEqual(expected_score(atoms, v2, e2, al), base - 1e-12)

    def test_ru_minimum_is_es_at_var_pareto(self):
        for a in (1.5, 2.5, 4.0):
            al = 0.9
            v, e = pareto_var_es(a, al)
            self.assertAlmostEqual(pareto_ru(a, al, v), e, 12)
            for f in (0.7, 0.9, 1.1, 1.5):
                self.assertGreater(pareto_ru(a, al, v * f), e)

    def test_exponential_matches_quadrature(self):
        al = 0.9
        v, e = expo_var_es(al)
        atoms = quantile_atoms(lambda u: -math.log(1 - u), 200000)
        self.assertAlmostEqual(ru(atoms, al, v), e, 2)
        self.assertAlmostEqual(expo_ru(al, v), e, 12)

    def test_excess_score_law_exponential(self):
        al = 0.9
        v, e = expo_var_es(al)
        atoms = quantile_atoms(lambda u: -math.log(1 - u), 200000)
        for v2, e2 in ((v * 1.3, e * 0.8), (v * 0.6, e * 1.5), (v, e * 2)):
            exact = excess_score(v2, e2, v, e, expo_ru(al, v2))
            num = expected_score(atoms, v2, e2, al) - expected_score(atoms, v, e, al)
            self.assertAlmostEqual(exact, num, 2)

    def test_es_factor_values(self):
        self.assertAlmostEqual(es_excess_factor(1.0), 0.0, 14)
        self.assertAlmostEqual(es_excess_factor(2.0), math.log(2) - 0.5, 14)
        self.assertAlmostEqual(es_excess_factor(0.5), -math.log(2) + 1, 14)
        self.assertGreater(es_excess_factor(0.5), es_excess_factor(2.0))

    def test_v_report_independent_of_e(self):
        # for any fixed e the best v is the VaR
        al = 0.8
        v, e = pareto_var_es(3.0, al)
        for e2 in (0.5 * e, e, 3 * e):
            vals = [(pareto_ru(3.0, al, v * f) / e2, f) for f in (0.8, 0.95, 1.0, 1.05, 1.3)]
            self.assertEqual(min(vals)[1], 1.0)

    def test_pareto_y_var_monte_carlo(self):
        rng = random.Random(5); a, al = 4.0, 0.9
        v, _ = pareto_var_es(a, al)
        ys = [v + max(pareto_sample(a, rng) - v, 0) / (1 - al) for _ in range(400000)]
        m = sum(ys) / len(ys); var = sum((y - m) ** 2 for y in ys) / len(ys)
        self.assertLess(abs(var / pareto_y_var(a, al) - 1), 0.08)
        self.assertEqual(pareto_y_var(1.8, al), math.inf)

    def test_es_estimate_exponential(self):
        rng = random.Random(1)
        xs = [-math.log(1 - rng.random()) for _ in range(200000)]
        self.assertLess(abs(es_estimate(xs, 0.9) - expo_var_es(0.9)[1]), 0.05)

    def test_tail_gap_nonneg_zero_at_var(self):
        atoms = quantile_atoms(lambda u: -math.log(1 - u), 5000)
        v, _ = var_es(atoms, 0.9)
        prof = tail_gap_profile(atoms, 0.9, [0.5 * v, v, 1.5 * v])
        self.assertAlmostEqual(prof[1][1], 0.0, 12)
        self.assertGreater(prof[0][1], 0); self.assertGreater(prof[2][1], 0)


if __name__ == "__main__":
    unittest.main()
