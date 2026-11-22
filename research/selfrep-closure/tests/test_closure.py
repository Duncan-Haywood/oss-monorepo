import pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_closure.bom import SHOPS, PARTS
from selfrep_closure.closure import closure, sensitivity, vitamins, makeable, parts_for


class T(unittest.TestCase):
    def test_printed_unit_count(self):
        self.assertEqual(sum(p.qty for p in PARTS if p.kind == "printed"), 44)

    def test_monotone_in_shop(self):
        order = ["printer", "printer+cnc+laser", "printer+cnc+laser+casting"]
        for v in ("lm8uu", "brass"):
            prev = None
            for s in order:
                c, _ = closure(v, SHOPS[s])
                if prev:
                    for k in c:
                        self.assertGreaterEqual(c[k], prev[k] - 1e-12)
                prev = c

    def test_casting_helps_only_brass(self):
        a, _ = closure("lm8uu", SHOPS["printer+cnc+laser"]); b, _ = closure("lm8uu", SHOPS["printer+cnc+laser+casting"])
        self.assertEqual(a, b)
        a, _ = closure("brass", SHOPS["printer+cnc+laser"]); b, _ = closure("brass", SHOPS["printer+cnc+laser+casting"])
        self.assertGreater(b["lines"], a["lines"])

    def test_brass_needs_both(self):
        p = [p for p in PARTS if p.variant == "brass"][0]
        self.assertFalse(makeable(p, {"fdm", "cast"}))
        self.assertTrue(makeable(p, {"fdm", "cast", "cnc"}))

    def test_vitamins_complement(self):
        ps = parts_for("lm8uu"); procs = SHOPS["printer"]
        self.assertEqual(len(vitamins("lm8uu", procs)) + sum(makeable(p, procs) for p in ps), len(ps))

    def test_all_zero_with_no_processes_and_sensitivity_brackets(self):
        c, _ = closure("lm8uu", set())
        self.assertEqual(c["lines"], 0)
        c, _ = closure("lm8uu", SHOPS["printer"]); s = sensitivity("lm8uu", SHOPS["printer"], n=300)
        self.assertLess(s["mass"][0], s["mass"][2])
        self.assertTrue(s["mass"][0] < c["mass"] < s["mass"][2] * 1.5)

    def test_headline_numbers(self):
        # Pins the README / results.txt headline values so a change to quantities, makers or
        # assumed costs cannot pass silently (quality audit 2026-11-22, defect 1).
        c, tot = closure("lm8uu", SHOPS["printer"])
        self.assertEqual((tot["lines"], tot["units"]), (51, 468))
        self.assertAlmostEqual(c["lines"], 18 / 51)
        self.assertAlmostEqual(c["units"], 44 / 468)
        self.assertAlmostEqual(c["cost"], 0.114, places=3)
        c, _ = closure("lm8uu", SHOPS["printer+cnc+laser"])
        self.assertAlmostEqual(c["lines"], 22 / 51)
        self.assertAlmostEqual(c["units"], 197 / 468)
        self.assertAlmostEqual(c["mass"], 0.224, places=3)
        self.assertAlmostEqual(c["cost"], 0.159, places=3)
        c, _ = closure("brass", SHOPS["printer+cnc+laser+casting"])
        self.assertAlmostEqual(c["lines"], 23 / 51)
        self.assertAlmostEqual(c["cost"], 0.211, places=3)
        s = sensitivity("lm8uu", SHOPS["printer"])
        self.assertEqual([round(100 * x) for x in s["cost"]], [9, 11, 15])


if __name__ == "__main__":
    unittest.main()
