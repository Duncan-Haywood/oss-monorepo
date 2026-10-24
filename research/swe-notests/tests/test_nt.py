import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_notests.nt import has_count, stratum, partial_table, partial_stat, partial_perm, cost_strata, usable, cost_perm


def run(t=0, track="research", date="2026-10-17", outcome="success", cost=1.0):
    return {"track": track, "date": date, "tests_added": t, "outcome": outcome, "cost_usd": cost}


class T(unittest.TestCase):
    def test_has_count(self):
        self.assertTrue(has_count(run(0)))
        for v in (None, True, -1, "3", 2.5):
            self.assertFalse(has_count({"tests_added": v}))

    def test_stratum_regime(self):
        self.assertEqual(stratum(run(date="2026-10-15"))[1], "early")
        self.assertEqual(stratum(run(date="2026-10-16"))[1], "late")

    def test_partial_table_counts(self):
        t = partial_table([run(0, outcome="partial"), run(0), run(3), run(None)])
        self.assertEqual(t[("research", "late")], [1, 2, 0, 1])

    def test_partial_stat_weighting(self):
        self.assertAlmostEqual(partial_stat({"a": [1, 2, 0, 2]}), 0.5)
        self.assertEqual(partial_stat({"a": [1, 0, 0, 2]}), 0.0)

    def test_no_effect_not_significant(self):
        runs = [run(i % 2, outcome="partial" if i % 7 == 0 else "success") for i in range(200)]
        _, p = partial_perm(runs, n=300)
        self.assertGreater(p, 0.05)

    def test_strong_effect_significant(self):
        runs = [run(0, outcome="partial") for _ in range(30)] + [run(2) for _ in range(30)]
        obs, p = partial_perm(runs, n=300)
        self.assertAlmostEqual(obs, 1.0)
        self.assertLess(p, 0.01)

    def test_cost_strata_and_ratio(self):
        runs = [run(0, cost=1.0) for _ in range(3)] + [run(2, cost=2.0) for _ in range(3)] + [run(1, cost=None)]
        g = usable(cost_strata(runs))
        obs, _ = cost_perm(g, n=50)
        self.assertAlmostEqual(obs, -0.693147, places=5)


if __name__ == "__main__":
    unittest.main()
