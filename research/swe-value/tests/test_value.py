import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_value.value import *


class T(unittest.TestCase):
    def test_kappa_perfect_and_chance(self):
        a = {i: 1 + i % 3 for i in range(30)}
        self.assertAlmostEqual(kappa(a, dict(a)), 1.0)
        self.assertAlmostEqual(kappa(a, dict(a), "none"), 1.0)
        # b is a shift of a by one position: no agreement beyond chance
        b = {i: 1 + (i + 1) % 3 for i in range(30)}
        self.assertLess(kappa(a, b, "none"), 0)

    def test_kappa_known_value(self):
        # Cohen (1960) style 2x2 check: 20 yes/yes, 5 yes/no, 10 no/yes, 15 no/no -> kappa 0.4
        a, b, i = {}, {}, 0
        for x, y, n in [(1, 1, 20), (1, 3, 5), (3, 1, 10), (3, 3, 15)]:
            for _ in range(n):
                a[i], b[i] = x, y
                i += 1
        self.assertAlmostEqual(kappa(a, b, "none"), 0.4, places=6)

    def test_pass_structure(self):
        order = ["x-a", "x-b1", "x-b2", "y-solo", "x-m"]
        fam = {"x-b1": "x-b", "x-b2": "x-b"}
        s = pass_structure(order, {"x-m"}, fam)
        self.assertEqual(s, {"x-a": 2, "x-b1": 2, "x-b2": 1, "y-solo": 2, "x-m": 3})

    def test_milestone_slugs(self):
        md = "1. `selfrep-closure`: model\n   2. `chip-rtl-loop`: x\n- `not-one`: y\n"
        self.assertEqual(milestone_slugs(md), {"selfrep-closure", "chip-rtl-loop"})

    def test_pass_text_first_in_track_is_novel(self):
        docs = {"a-1": "radar clutter detector", "a-2": "radar clutter detector threshold",
                "b-1": "garment sewing pattern"}
        v = tfidf(docs)
        score, sim = pass_text(["a-1", "a-2", "b-1"], v, lambda s: s[0])
        self.assertEqual(score["a-1"], 3)
        self.assertEqual(score["b-1"], 3)
        self.assertEqual(score["a-2"], 1)
        self.assertGreater(sim["a-2"], 0.5)

    def test_cosine_bounds(self):
        v = tfidf({"p": "alpha beta gamma", "q": "delta epsilon zeta"})
        self.assertAlmostEqual(cosine(v["p"], v["p"]), 1.0)
        self.assertEqual(cosine(v["p"], v["q"]), 0.0)

    def test_class_cost_and_ratio(self):
        cc = class_cost({"a": 1, "b": 1, "c": 3}, {"a": 100, "b": 300, "c": 50})
        self.assertEqual(cc[1]["n"], 2)
        self.assertEqual(cc[3]["median"], 50)
        self.assertAlmostEqual(value_per_kloc({"a": 1, "b": 3}, {"a": 500, "b": 500}), 4.0)

    def test_bootstrap_interval_contains_point(self):
        items = [(2, 100)] * 20 + [(1, 100)] * 20
        lo, hi = bootstrap_ratio(items)
        self.assertLess(lo, 15.0)
        self.assertGreater(hi, 15.0)


if __name__ == "__main__":
    unittest.main()
