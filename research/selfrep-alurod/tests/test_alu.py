import pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_alurod import alu
from selfrep_rodbeam import beam as b


class T(unittest.TestCase):
    def test_aluminium_matches_steel_at_fourth_root_of_modulus_ratio(self):
        ds = b.deflection("steel", .008, .42, 5.0)
        d = b.min_diameter("aluminium", ds, .42, 5.0)
        self.assertAlmostEqual(d / .008, (200 / 69) ** .25, places=6)

    def test_aluminium_fits_holder_limit_where_wood_does_not(self):
        ds = b.deflection("steel", .008, .42, 5.0)
        self.assertTrue(alu.fits(b.min_diameter("aluminium", ds, .42, 5.0)))
        self.assertFalse(alu.fits(b.min_diameter("hardwood", ds, .42, 5.0)))

    def test_same_stiffness_aluminium_rod_set_is_lighter_than_steel(self):
        ds = b.deflection("steel", .008, .42, 5.0)
        d = b.min_diameter("aluminium", ds, .42, 5.0)
        self.assertLess(b.rod_set_mass_g("aluminium", d), b.rod_set_mass_g("steel", .008))
        self.assertGreater(b.rod_set_mass_g("aluminium", d), b.rod_set_mass_g("aluminium", .008))

    def test_rod_line_is_makeable_and_vitamins_drop(self):
        base = alu.vitamin_mass_g(alu.design_with("aluminium", .008))
        steel = sum(p.qty * p.mass_g for p in alu.rd.design(()) if not alu.rd.makeable(p, alu.PROCS))
        self.assertLess(base, steel)

    def test_substitution_table_restored(self):
        before = alu.rd.SUBS[4]
        alu.design_with("aluminium", .01)
        self.assertIs(alu.rd.SUBS[4], before)

    def test_closure_rises_with_diameter(self):
        self.assertLess(alu.closure("aluminium", .008), alu.closure("aluminium", .012))


if __name__ == "__main__":
    unittest.main()
