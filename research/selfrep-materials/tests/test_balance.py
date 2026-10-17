import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from dataclasses import replace
from selfrep_materials.balance import (Params, balance, melt_energy_kwh_per_kg, parts_by_feedstock,
                                       vitamin_mass, SHOPS)
from selfrep_closure.closure import parts_for

PRN, FULL = SHOPS["printer"], SHOPS["printer+cnc+laser+casting"]


class T(unittest.TestCase):
    def test_mass_conservation_printer(self):
        # imports = product + scrap_lost + vitamins mass (recycling or not)
        for rec in (True, False):
            b = balance("lm8uu", PRN, recycle=rec)
            prod = sum(parts_by_feedstock("lm8uu", PRN).values())
            self.assertAlmostEqual(b["total_import_kg"], vitamin_mass("lm8uu", PRN) + prod + b["scrap_lost_kg"] - b["eol_used_kg"], 9)

    def test_mass_conservation_full(self):
        for var in ("lm8uu", "brass"):
            for rec in (True, False):
                b = balance(var, FULL, recycle=rec)
                prod = sum(parts_by_feedstock(var, FULL).values())
                self.assertAlmostEqual(b["total_import_kg"], vitamin_mass(var, FULL) + prod + b["scrap_lost_kg"] - b["eol_used_kg"], 9)

    def test_vitamin_plus_makeable_is_total_mass(self):
        tot = sum(p.qty * p.mass_g for p in parts_for("lm8uu")) / 1000
        self.assertAlmostEqual(tot, vitamin_mass("lm8uu", FULL) + sum(parts_by_feedstock("lm8uu", FULL).values()), 9)

    def test_recycling_never_increases_imports(self):
        for sh in SHOPS.values():
            self.assertLessEqual(balance("brass", sh)["total_import_kg"], balance("brass", sh, recycle=False)["total_import_kg"] + 1e-12)

    def test_phi_zero_equals_no_recycle_for_plastic(self):
        a = balance("lm8uu", PRN, replace(Params(), phi=0.0))["imports_kg"]["filament (virgin)"]
        b = balance("lm8uu", PRN, recycle=False)["imports_kg"]["filament (virgin)"]
        self.assertAlmostEqual(a, b)

    def test_virgin_plastic_closed_form_when_phi_not_binding(self):
        p = replace(Params(), phi=1.0)
        P = parts_by_feedstock("lm8uu", PRN)["filament"]
        v = balance("lm8uu", PRN, p)["imports_kg"]["filament (virgin)"]
        self.assertAlmostEqual(v, P * (1 - p.r * p.s) / (1 - p.s))

    def test_conservation_with_end_of_life_plastic(self):
        for eol in (0.5, 1.0, 3.0):
            b = balance("lm8uu", PRN, replace(Params(), eol=eol))
            prod = sum(parts_by_feedstock("lm8uu", PRN).values())
            self.assertAlmostEqual(b["total_import_kg"] + b["eol_used_kg"], vitamin_mass("lm8uu", PRN) + prod + b["scrap_lost_kg"], 9)

    def test_phi_cap_binds_with_end_of_life(self):
        P = parts_by_feedstock("lm8uu", PRN)["filament"]
        p = replace(Params(), eol=5.0, phi=0.3)
        v = balance("lm8uu", PRN, p)["imports_kg"]["filament (virgin)"]
        self.assertAlmostEqual(v, (P / (1 - p.s)) * (1 - p.phi))

    def test_aluminium_melt_energy_textbook_range(self):
        # theory about 0.27 kWh/kg at 100% efficiency
        self.assertAlmostEqual(melt_energy_kwh_per_kg(1.0), 0.27, delta=0.02)

    def test_casting_needed_to_remelt_offcuts(self):
        a = balance("lm8uu", SHOPS["printer+cnc+laser"])["imports_kg"]
        b = balance("lm8uu", FULL)["imports_kg"]
        self.assertLess(b["aluminium sheet"], a["aluminium sheet"])


if __name__ == "__main__":
    unittest.main()
