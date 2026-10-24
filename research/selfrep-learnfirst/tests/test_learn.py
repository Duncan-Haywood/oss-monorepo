import pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_learnfirst import learn as L


class T(unittest.TestCase):
    def test_only_vitamins_listed(self):
        self.assertTrue(all(not L.C.makeable(p, L.SHOP) for p in L.vitamin_lines()))

    def test_gains_sum_to_closure_ceiling(self):
        g = L.gains()
        base = L.C.closure(L.VARIANT, L.SHOP)[0]
        for m in ("lines", "units", "mass", "cost"):
            self.assertAlmostEqual(base[m] + sum(v[m] for v in g.values()), 1.0, places=9)

    def test_ranking_descending(self):
        g = L.gains()
        r = L.ranking(g, "mass")
        self.assertEqual([g[n]["mass"] for n in r], sorted((g[n]["mass"] for n in r), reverse=True))

    def test_lines_to_reach_monotone_and_unreachable(self):
        g = L.gains()
        self.assertLessEqual(L.lines_to_reach(g, "mass", .1), L.lines_to_reach(g, "mass", .5))
        self.assertIsNone(L.lines_to_reach(g, "mass", .99))

    def test_kendall_tau_extremes(self):
        a = ["a", "b", "c", "d"]
        self.assertEqual(L.kendall_tau(a, a), 1.0)
        self.assertEqual(L.kendall_tau(a, a[::-1]), -1.0)

    def test_stability_is_deterministic_and_sums_to_one(self):
        w1, t1 = L.top_stability("mass", n=50, seed=3)
        w2, t2 = L.top_stability("mass", n=50, seed=3)
        self.assertEqual((w1, t1), (w2, t2))
        self.assertAlmostEqual(sum(w1.values()), 1.0)

    def test_kind_gains_sum_to_total(self):
        k = L.by_kind()
        g = L.gains()
        self.assertAlmostEqual(sum(v["mass"] for v in k.values()), sum(v["mass"] for v in g.values()))


if __name__ == "__main__":
    unittest.main()
