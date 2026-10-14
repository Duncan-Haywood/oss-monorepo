import pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_alusearch import search as s


class T(unittest.TestCase):
    def test_steel_has_zero_penalty_and_wood_8mm_is_capped_or_high(self):
        self.assertEqual(s.rod_penalty("steel", None), 0.0)
        self.assertGreater(s.rod_penalty("hardwood", 0.008), 0.9)

    def test_aluminium_at_steel_equivalent_diameter_costs_K(self):
        d = 0.008 * (200 / 69) ** .25
        self.assertAlmostEqual(s.rod_penalty("aluminium", d), s.K, places=6)

    def test_penalty_falls_with_diameter(self):
        for m in ("hardwood", "aluminium"):
            self.assertGreater(s.rod_penalty(m, .008), s.rod_penalty(m, .010))
            self.assertGreater(s.rod_penalty(m, .010), s.rod_penalty(m, .012))

    def test_zero_budget_is_the_baseline_steel_design(self):
        rod, others, v, pen = s.exhaustive(0.0, "mass")
        self.assertEqual((rod[0], others, pen), ("steel", (), 0.0))

    def test_value_nondecreasing_in_budget(self):
        vals = [s.exhaustive(b, "mass")[2] for b in (0, .5, 1, 2, 3, 4)]
        self.assertEqual(vals, sorted(vals))

    def test_all_substitutions_with_aluminium_match_alurod_design(self):
        rod = ("aluminium", 0.010)
        a = s.rd.closure_of(s.design_of(rod, s.OTHER), s.PROCS, "mass")
        self.assertAlmostEqual(a, s.alu.closure("aluminium", 0.010), places=9)

    def test_no_others_with_rod_leaves_other_vitamins(self):
        rod = ("aluminium", 0.010)
        none = s.design_of(rod, ())
        names = {p.name for p in none}
        self.assertIn("LM8UU linear bearing", names)
        self.assertNotIn("printed bushing", names)
        self.assertIn("aluminium rod", names)
        self.assertNotIn("350 mm 8 mm smooth rod", names)


if __name__ == "__main__":
    unittest.main()
