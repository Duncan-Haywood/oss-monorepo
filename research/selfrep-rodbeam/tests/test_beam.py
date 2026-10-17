import math, pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_rodbeam import beam as b


class T(unittest.TestCase):
    def test_closed_form(self):
        # steel 8 mm, 0.42 m, 5 N: P L^3 / (48 E I) with I = pi d^4/64
        I = math.pi * 0.008 ** 4 / 64
        self.assertAlmostEqual(b.deflection("steel", .008, .42, 5.0), 5 * .42 ** 3 / (48 * 200e9 * I))

    def test_deflection_scales(self):
        d0 = b.deflection("hardwood", .008, .4, 5)
        self.assertAlmostEqual(b.deflection("hardwood", .016, .4, 5), d0 / 16)       # d^-4
        self.assertAlmostEqual(b.deflection("hardwood", .008, .8, 5), d0 * 8)        # L^3
        self.assertAlmostEqual(b.deflection("hardwood", .008, .4, 10), d0 * 2)       # P

    def test_min_diameter_meets_spec_and_is_tight(self):
        for m in b.MATERIALS:
            d = b.min_diameter(m, 0.0002, .42, 5.0)
            self.assertLessEqual(b.deflection(m, d, .42, 5.0), 0.0002 * (1 + 1e-9))
            self.assertLessEqual(b.stress(d, .42, 5.0), b.MATERIALS[m][2] * (1 + 1e-9))
            self.assertTrue(b.deflection(m, d * .99, .42, 5.0) > 0.0002 or b.stress(d * .99, .42, 5.0) > b.MATERIALS[m][2])

    def test_steel_rod_mass_matches_bom(self):
        self.assertAlmostEqual(1000 * b.mass("steel", .008, .35), 138.1, delta=1.0)  # BOM lists 140 g

    def test_matching_steel_stiffness_needs_E_ratio_fourth_root(self):
        ds = b.deflection("steel", .008, .42, 5.0)
        d = b.min_diameter("hardwood", ds, .42, 5.0)
        self.assertAlmostEqual(d / .008, (200 / 10) ** .25, places=6)

    def test_closure_rises_with_dowel_mass_and_matches_published_at_30g(self):
        from selfrep_redesign import design as rd
        procs = {"fdm", "cnc", "laser"}
        d30 = math.sqrt(0.030 / (700 * math.pi / 4 * (sum(n * L for L, n in b.RODS) / 6)))  # diameter giving 30 g/rod
        self.assertAlmostEqual(b.wood_design_closure(d30, procs),
                               rd.closure_of(rd.design(tuple(range(len(rd.SUBS)))), procs, "mass"), places=6)
        self.assertLess(b.wood_design_closure(.008, procs), b.wood_design_closure(.016, procs))


if __name__ == "__main__":
    unittest.main()
