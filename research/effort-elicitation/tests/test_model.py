import math, random, unittest
from effort_elicitation.model import *

class T(unittest.TestCase):
    def test_value_nonneg_and_monotone(self):
        for r in RULES:
            V = value_curve(r, 2, 3, 30)
            self.assertAlmostEqual(V[0], 0)
            self.assertTrue(all(V[i + 1] >= V[i] - 1e-12 for i in range(30)))

    def test_brier_closed_form(self):
        # Brier: V(n) = E[Var(p|data)] reduction = Var(p) - E Var(p|n); Var(p)=ab/((a+b)^2(a+b+1)); V(n)=Var(p)*n/(a+b+n)
        a, b = 2.0, 3.0
        var = a * b / ((a + b) ** 2 * (a + b + 1))
        V = value_curve("brier", a, b, 20)
        for n in range(21):
            self.assertAlmostEqual(V[n], var * n / (a + b + n), places=12)

    def test_monte_carlo(self):
        rnd = random.Random(1); a, b, n = 1.5, 0.7, 6
        S = SCORES["log"]; tot = 0; N = 60000
        for _ in range(N):
            p = rnd.betavariate(a, b); k = sum(rnd.random() < p for _ in range(n))
            q = (a + k) / (a + b + n); y = rnd.random() < p
            tot += S(q, y)
        V = value_curve("log", a, b, n)
        self.assertAlmostEqual(tot / N, V[n] + G_log(a / (a + b)), delta=0.02)

    def test_envelope_equals_implementable(self):
        for r in RULES:
            for a, b in [(1, 1), (0.3, 3), (0.5, 0.5)]:
                V = value_curve(r, a, b, 40)
                hull = set(concave_envelope_vertices(V))
                for n in range(1, 40):
                    lo, hi = implementable_interval(V, n, 0.01)
                    if n in hull:
                        self.assertLessEqual(lo, hi + 1e-9, (r, a, b, n))
                    else:
                        self.assertGreaterEqual(lo, hi - 1e-9, (r, a, b, n))

    def test_best_effort_at_design(self):
        V = value_curve("brier", 1, 1, 80)
        d = design("brier", 1, 1, 10, 0.001)
        self.assertEqual(best_effort(V, d["alpha"] * 1.0000001, 0.001), 10)

    def test_brier_rent_law_exact(self):
        # Brier: V(n)=v n/(s+n), binding constraint is m=n-1, so rent/cost = (n-1)/(a+b) exactly
        for a, b in [(1, 1), (2, 8), (0.2, 5)]:
            for n in (5, 30):
                d = design("brier", a, b, n, 0.001, nmax=4 * n)
                self.assertAlmostEqual(d["rent_per_cost"], (n - 1) / (a + b), places=6)

if __name__ == "__main__":
    unittest.main()
