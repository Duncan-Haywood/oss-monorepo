import pathlib, random, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_redesign import design as d

PROCS = {"fdm", "cnc", "laser"}


class T(unittest.TestCase):
    def test_no_substitution_matches_closure_module(self):
        from selfrep_closure.closure import closure
        c, _ = closure("lm8uu", PROCS)
        for m in ("lines", "mass", "cost"):
            self.assertAlmostEqual(d.closure_of(d.design(()), PROCS, m), c[m])

    def test_substitutions_remove_vitamins(self):
        base = d.vitamin_kinds(d.design(()), PROCS)
        self.assertLess(d.vitamin_kinds(d.design(tuple(range(len(d.SUBS)))), PROCS), base)

    def test_zero_budget_changes_nothing(self):
        self.assertEqual(d.exhaustive(0, PROCS, "mass")[0], ())

    def test_exhaustive_respects_budget_and_beats_greedy(self):
        for b in (0.5, 1.0, 2.0, 4.0):
            e, ve = d.exhaustive(b, PROCS, "mass")
            g, vg = d.greedy(b, PROCS, "mass")
            self.assertLessEqual(d.penalty(e), b)
            self.assertLessEqual(d.penalty(g), b)
            self.assertGreaterEqual(ve + 1e-12, vg)

    def test_random_never_beats_exhaustive(self):
        rng = random.Random(0)
        for b in (1.0, 2.0):
            self.assertLessEqual(d.random_search(b, PROCS, "mass", 20, rng)[1], d.exhaustive(b, PROCS, "mass")[1] + 1e-12)


if __name__ == "__main__":
    unittest.main()
