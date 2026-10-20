import pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_judgement.judge import SHOP, JUDGED, base_makeable, score, drop_one, add_one, monte_carlo
from selfrep_closure.bom import SHOPS
from selfrep_closure.closure import closure


class T(unittest.TestCase):
    def test_baseline_matches_closure_project(self):
        for v in ("lm8uu", "brass"):
            c, _ = closure(v, SHOPS[SHOP])
            s = score(v, base_makeable(v))
            for k in ("lines", "mass", "cost"):
                self.assertAlmostEqual(c[k], s[k])

    def test_buying_never_raises_closure(self):
        for v in ("lm8uu", "brass"):
            _, rows = drop_one(v)
            self.assertTrue(rows)
            for n, d in rows:
                self.assertIn(n, JUDGED)
                self.assertTrue(all(x < 0 for x in d.values()))

    def test_making_never_lowers_closure(self):
        for v in ("lm8uu", "brass"):
            _, rows = add_one(v)
            for _, _, d in rows:
                self.assertTrue(all(x > 0 for x in d.values()))

    def test_lm8uu_has_no_brass_line(self):
        _, rows = drop_one("lm8uu")
        self.assertNotIn("8x25 mm brass bushing", [n for n, _ in rows])

    def test_monte_carlo_ordered_and_deterministic(self):
        a = monte_carlo("brass", n=300); b = monte_carlo("brass", n=300)
        self.assertEqual(a, b)
        for lo, mid, hi in a.values():
            self.assertLessEqual(lo, mid); self.assertLessEqual(mid, hi)


if __name__ == "__main__":
    unittest.main()
