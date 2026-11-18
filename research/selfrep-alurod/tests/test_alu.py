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
        before = alu.rd.SUBS[alu.rod_sub_index()]
        alu.design_with("aluminium", .01)
        self.assertIs(alu.rd.SUBS[alu.rod_sub_index()], before)

    def test_closure_rises_with_diameter(self):
        self.assertLess(alu.closure("aluminium", .008), alu.closure("aluminium", .012))


    def test_published_numbers_at_the_0p2_mm_spec(self):
        # Pins README "Results" (quality audit 2026-11-12, portfolio/quality/audits/2026-11-12-selfrep-alurod.json):
        # all five seeded bugs survived the earlier tests, which never checked a published number.
        d = b.min_diameter("aluminium", 2e-4, .42, 5.0)
        w = b.min_diameter("hardwood", 2e-4, .42, 5.0)
        al, wood, steel = alu.design_with("aluminium", d), alu.design_with("hardwood", w), alu.rd.design(())
        self.assertEqual(round(alu.imported_stock_g(al)), 2360)
        self.assertEqual(round(alu.imported_stock_g(wood)), 2190)
        self.assertEqual(round(alu.vitamin_mass_g(al)), 3608)
        self.assertEqual(round(1000 * alu.closure("aluminium", d)), 395)
        self.assertEqual(round(b.rod_set_mass_g("aluminium", d) / 6, 1), 88.7)
        self.assertTrue(alu.fits(d))
        self.assertFalse(alu.fits(b.min_diameter("aluminium", 1e-4, .42, 5.0)))  # 12.3 mm

    def test_rod_substitution_found_by_name(self):
        self.assertEqual(alu.rd.SUBS[alu.rod_sub_index()].name, "wood-smooth-rods")
        with self.assertRaises(LookupError):
            alu.rod_sub_index("no-such-substitution")


if __name__ == "__main__":
    unittest.main()
