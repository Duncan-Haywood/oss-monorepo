import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from selfrep_recyclers.machines import (MACHINES, PLASTIC_PAIR, machine_import_kg, machine_mass_kg, paybacks,
                                        per_copy_saving, with_params)
from selfrep_recyclers.machines import SHOPS


class T(unittest.TestCase):
    def test_vitamin_plus_made_is_total(self):
        for n, ps in MACHINES.items():
            tot = sum(p.qty * p.mass_g for p in ps) / 1000.0
            v, m = machine_mass_kg([n], SHOPS["printer+cnc+laser+casting"])
            self.assertAlmostEqual(v + m, tot)

    def test_printer_alone_cannot_cut_sheet(self):
        v1, m1 = machine_mass_kg(["shredder"], SHOPS["printer"])
        v2, m2 = machine_mass_kg(["shredder"], SHOPS["printer+cnc+laser"])
        self.assertGreater(v1, v2)
        self.assertGreater(m2, m1)

    def test_furnace_is_all_vitamins(self):
        v, m = machine_mass_kg(["furnace"], SHOPS["printer+cnc+laser+casting"])
        self.assertEqual(m, 0.0)

    def test_import_at_least_mass(self):
        for shop in SHOPS:
            v, m = machine_mass_kg(PLASTIC_PAIR, SHOPS[shop])
            self.assertGreaterEqual(machine_import_kg(PLASTIC_PAIR, SHOPS[shop]), v + m - 1e-9)

    def test_no_saving_without_scrap(self):
        pl, me = per_copy_saving("lm8uu", SHOPS["printer+cnc+laser+casting"], with_params(s=0.0))
        self.assertAlmostEqual(pl, 0.0)

    def test_saving_matches_materials_text(self):
        pl, me = per_copy_saving("lm8uu", SHOPS["printer+cnc+laser+casting"])
        self.assertAlmostEqual(pl, 0.10, delta=0.02)   # 1.22 -> 1.12 kg of filament
        self.assertAlmostEqual(me, 0.06, delta=0.03)   # about 0.06 kg of aluminium

    def test_payback_shrinks_with_retired_plastic(self):
        a = paybacks("lm8uu", "printer+cnc+laser")["shredder+extruder"][2]
        b = paybacks("lm8uu", "printer+cnc+laser", with_params(eol=1.0))["shredder+extruder"][2]
        self.assertLess(b, a)

    def test_furnace_only_with_casting(self):
        self.assertNotIn("furnace", paybacks("lm8uu", "printer+cnc+laser"))
        self.assertIn("furnace", paybacks("lm8uu", "printer+cnc+laser+casting"))


if __name__ == "__main__":
    unittest.main()
