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


    def test_printed_substitute_costed_per_gram_like_selfrep_closure(self):
        # selfrep-closure prices a 25 g printed part at 0.5; a substitute pays the same rate per gram, so a
        # printed M8 nut (1.5 g) costs what the 0.03 steel nut costs. A flat 0.5 per part inflated cost closure
        # from 17.4% to 33.6% for this one swap (quality audit 2026-11-08).
        from selfrep_closure.bom import PARTS
        steel = next(p for p in PARTS if p.name == "M8 nut")
        printed = d.SUBS[[s.name for s in d.SUBS].index("printed-m8-nuts")].adds[0]
        self.assertAlmostEqual(printed.cost, steel.cost)
        for s in d.SUBS:
            for p in s.adds:
                if p.kind == "printed":
                    self.assertAlmostEqual(p.cost, p.mass_g * 0.5 / 25.0)

    def test_cost_closure_pinned(self):
        i = [s.name for s in d.SUBS].index("printed-m8-nuts")
        self.assertAlmostEqual(d.closure_of(d.design((i,)), PROCS, "cost"), 0.174, places=3)
        self.assertAlmostEqual(d.closure_of(d.design(tuple(range(len(d.SUBS)))), PROCS, "cost"), 0.240, places=3)

    def test_greedy_takes_best_gain_per_penalty(self):
        # mass objective, budget 1.0: gain per penalty ranks printed M8 nuts first (+2.6 / 0.3), then idlers and
        # M3 nuts; the wooden rods (+6.2 / 0.9) rank lower, so greedy ends at 26.1% while exhaustive finds 28.6%.
        names = lambda c: [d.SUBS[i].name for i in c]
        g, vg = d.greedy(1.0, PROCS, "mass")
        self.assertEqual(names(g), ["printed-m8-nuts", "printed-idlers", "printed-m3-nuts"])
        self.assertAlmostEqual(vg, 0.261, places=3)
        e, ve = d.exhaustive(1.0, PROCS, "mass")
        self.assertEqual(names(e), ["wood-smooth-rods"])
        self.assertAlmostEqual(ve, 0.286, places=3)


if __name__ == "__main__":
    unittest.main()
