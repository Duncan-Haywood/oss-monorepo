import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from selfrep_recyclers.machines import (CASTABLE_AL, MACHINES, PLASTIC_PAIR, balance_credit_kg, furnace_saving_kg,
                                        machine_import_kg, machine_mass_kg, paybacks, per_copy_saving, with_params)
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
        # the furnace can only stand in for bar stock: 0.020 kg of pulleys / 0.70 yield
        self.assertAlmostEqual(me, 0.020 / 0.70, places=9)

    def test_payback_shrinks_with_retired_plastic(self):
        a = paybacks("lm8uu", "printer+cnc+laser")["shredder+extruder"][2]
        b = paybacks("lm8uu", "printer+cnc+laser", with_params(eol=1.0))["shredder+extruder"][2]
        self.assertLess(b, a)

    def test_furnace_only_with_casting(self):
        self.assertNotIn("furnace", paybacks("lm8uu", "printer+cnc+laser"))
        self.assertIn("furnace", paybacks("lm8uu", "printer+cnc+laser+casting"))

    def test_remelt_cannot_replace_sheet(self):
        # quality audit 2026-11-08: the balance credited remelt against sheet a crucible cannot make
        cast = SHOPS["printer+cnc+laser+casting"]
        self.assertEqual(CASTABLE_AL, ("aluminium bar",))
        self.assertLess(furnace_saving_kg("lm8uu", cast), balance_credit_kg("lm8uu", cast))
        self.assertAlmostEqual(balance_credit_kg("lm8uu", cast), 0.069, places=6)

    def test_melt_loss_binds_only_when_pool_short(self):
        cast = SHOPS["printer+cnc+laser+casting"]
        self.assertAlmostEqual(furnace_saving_kg("lm8uu", cast, with_params(m_loss=0.4)), 0.020 / 0.70)
        # pool (0.2214 - 0.155 + 0.02857 - 0.020) * 0.3 = 0.0225 < bar stock
        self.assertAlmostEqual(furnace_saving_kg("lm8uu", cast, with_params(m_loss=0.7)), 0.0225, places=6)

    def test_no_furnace_saving_without_casting(self):
        self.assertEqual(furnace_saving_kg("lm8uu", SHOPS["printer+cnc+laser"]), 0.0)

    def test_headline_paybacks_by_hand(self):
        # plastic: (3.448 + 1.52 vitamins) + (3.0 + 1.0)/0.7 MDF + 0.6/0.9 filament = 11.349 kg;
        # saving 1.2222 - 1.1244 = 0.0978 kg/copy. Furnace: 6.5 kg / (0.02/0.7) = 227.5 copies.
        pb = paybacks("lm8uu", "printer+cnc+laser+casting")
        imp, sav, n = pb["shredder+extruder"]
        self.assertAlmostEqual(imp, 3.448 + 1.52 + 4.0 / 0.7 + 0.6 / 0.9, places=6)
        self.assertAlmostEqual(n, 116.07, delta=0.01)
        self.assertAlmostEqual(pb["furnace"][2], 227.5, places=6)


if __name__ == "__main__":
    unittest.main()
