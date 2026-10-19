import os, random, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from accel_nsga import search as S

MODELS, DP = S.load_models(), S.load_dp()


class T(unittest.TestCase):
    def test_space_size_and_p1_matches_kws(self):
        sp = S.Space(MODELS, DP, 1e9)
        self.assertEqual(sp.size(), 40 * 6 * 4 * 4)
        import json
        with open(S.KWS) as f:
            rows = json.load(f)["rows"]
        for i, r in enumerate(rows):
            e = sp.evaluate((i, 0, 0, 0))
            self.assertEqual(e["cyc"], r["cycles"][0])
            self.assertEqual(e["area"], r["cells"])
            self.assertAlmostEqual(e["energy"], r["energy_nj"])

    def test_banks_cap_throughput(self):
        sp = S.Space(MODELS, DP, 1e9)
        self.assertEqual(sp.evaluate((0, 5, 0, 0))["cyc"], sp.evaluate((0, 0, 0, 0))["cyc"])
        self.assertLess(sp.evaluate((0, 5, 3, 0))["cyc"], sp.evaluate((0, 5, 0, 0))["cyc"])

    def test_hypervolume_by_hand(self):
        ref = (0.0, 1.0, 1.0)
        self.assertAlmostEqual(S.hypervolume([(1.0, 0.0, 0.0)], ref), 1.0)
        self.assertAlmostEqual(S.hypervolume([(0.5, 0.5, 0.5)], ref), 0.125)
        # Over val [.5,1] only A counts: .5 * (.5*.5). Over [0,.5] the 2-D staircase of A and B is .25 + .125.
        A, B = (1.0, 0.5, 0.5), (0.5, 0.0, 0.75)
        self.assertAlmostEqual(S.area2d([(0.5, 0.5), (0.0, 0.75)], 1.0, 1.0), 0.5 * 0.5 + 0.5 * 0.25)
        self.assertAlmostEqual(S.hypervolume([A, B], ref), 0.5 * 0.25 + 0.5 * (0.5 * 0.5 + 0.5 * 0.25))

    def test_front_is_nondominated_and_feasible(self):
        sp = S.Space(MODELS, DP, 50)
        items = [(g, sp.evaluate(g)) for g in sp.all_genes()]
        front = S.pareto_set(items)
        self.assertTrue(front)
        for _, r in front:
            self.assertTrue(r["ok"])
            self.assertFalse(any(S.dominates(r2, r) for _, r2 in items))

    def test_budget_respected_and_deterministic(self):
        sp = S.Space(MODELS, DP, 200)
        a = S.nsga2(sp, 150, random.Random(1))
        self.assertLessEqual(len(a), 150)
        b = S.nsga2(sp, 150, random.Random(1))
        self.assertEqual(sorted(g for g, _ in a), sorted(g for g, _ in b))
        self.assertEqual(len(S.random_search(sp, 150, random.Random(1))), 150)


if __name__ == "__main__":
    unittest.main()
