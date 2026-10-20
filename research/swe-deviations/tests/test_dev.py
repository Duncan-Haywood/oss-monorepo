import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_deviations.dev import deviated, stratum, strata, usable, perm_test, partial_table, partial_perm, stat


def run(track="ventures", date="2026-10-17", dev=False, cost=1.0, outcome="success"):
    return {"track": track, "date": date, "deviations": [{"file": "x", "why": "y"}] if dev else [],
            "cost_usd": cost, "outcome": outcome}


class T(unittest.TestCase):
    def test_deviated(self):
        self.assertTrue(deviated({"deviations": [1]}))
        for d in ([], None, "text"):
            self.assertFalse(deviated({"deviations": d}))
        self.assertFalse(deviated({}))

    def test_stratum_regime(self):
        self.assertEqual(stratum({"track": "a", "date": "2026-10-15"}), ("a", "early"))
        self.assertEqual(stratum({"track": "a", "date": "2026-10-16"}), ("a", "late"))

    def test_strata_skips_missing_and_bool(self):
        g = strata([run(dev=True), run(cost=None), {**run(), "cost_usd": True}], "cost_usd")
        self.assertEqual(g, {("ventures", "late"): ([1.0], [])})

    def test_usable(self):
        g = {"k": ([1.0] * 3, [1.0] * 3), "j": ([1.0], [1.0] * 5)}
        self.assertEqual(list(usable(g)), ["k"])

    def test_no_effect_is_not_significant(self):
        rs = [run(dev=i % 2 == 0, cost=1.0 + (i % 5)) for i in range(60)]
        obs, p = perm_test(usable(strata(rs, "cost_usd")), n=500)
        self.assertAlmostEqual(obs, 0.0, places=6)
        self.assertGreater(p, 0.5)

    def test_clear_effect_is_detected(self):
        rs = [run(dev=True, cost=10 + i % 3) for i in range(20)] + [run(dev=False, cost=1 + i % 3) for i in range(20)]
        obs, p = perm_test(usable(strata(rs, "cost_usd")), n=500)
        self.assertGreater(obs, 1.5)
        self.assertLess(p, 0.01)

    def test_partial(self):
        rs = [run(dev=True, outcome="partial")] * 5 + [run(dev=True)] * 5 + [run()] * 10
        t = partial_table(rs)
        self.assertEqual(t[("ventures", "late")], [5, 10, 0, 10])
        obs, p = partial_perm(rs, n=500)
        self.assertAlmostEqual(obs, 0.5)
        self.assertLess(p, 0.05)

    def test_deterministic(self):
        rs = [run(dev=i % 3 == 0, cost=1 + i % 7) for i in range(40)]
        g = usable(strata(rs, "cost_usd"))
        self.assertEqual(perm_test(g, n=200), perm_test(g, n=200))


if __name__ == "__main__":
    unittest.main()
