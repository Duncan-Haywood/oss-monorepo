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

    # --- sourced part list (quality fix 2026-11-14; audit 2026-11-08-selfrep-materials.json) ---

    def test_sourced_fasteners_are_per_printer_not_box_sizes(self):
        from selfrep_materials.sourced import FASTENERS_PER_PRINTER as F
        # sums of the "Parts Required" lists, RepRap wiki "Prusa Mendel Assembly (iteration 2)" oldid=191295
        self.assertEqual(F, {"M8 nut": 82, "M8 washer": 88, "M3x20 bolt": 23, "M3 nut": 38,
                             "M3 washer": 62, "M3x10 bolt": 18})
        q = {p.name: p.qty for p in balance_parts("lm8uu", "sourced")}
        self.assertEqual(q["M8 nut"], 82)
        self.assertEqual(q["M3x40 bolt (print bed)"], 4)

    def test_sourced_printed_mass_is_stl_volume_times_density(self):
        from selfrep_materials.sourced import STL
        vol = {"bar-clamp": 2.424, "x-end-motor": 50.886, "wade": 51.561}  # also recomputed by numpy-stl
        for k, v in vol.items():
            self.assertAlmostEqual(STL[k]["volume_cm3"], v, 3)
            self.assertTrue(STL[k]["watertight"])
        ps = balance_parts("lm8uu", "sourced")
        printed = sum(p.qty * p.mass_g for p in ps if p.kind == "printed")
        self.assertAlmostEqual(printed, 479.7 * 1.24, delta=0.5)          # 0.595 kg solid PLA
        self.assertEqual(sum(p.qty for p in ps if p.kind == "printed"), 44)
        half = balance_parts("lm8uu", "sourced", fill=0.5)
        self.assertAlmostEqual(sum(p.qty * p.mass_g for p in half if p.kind == "printed"), printed / 2, 6)

    def test_sourced_mass_conservation(self):
        for var in ("lm8uu", "brass"):
            for fill in (0.5, 1.0):
                prm = Params(bom="sourced", fill=fill)
                for rec in (True, False):
                    b = balance(var, FULL, prm, rec)
                    prod = sum(parts_by_feedstock(var, FULL, prm).values())
                    self.assertAlmostEqual(b["total_import_kg"], vitamin_mass(var, FULL, prm) + prod + b["scrap_lost_kg"] - b["eol_used_kg"], 9)

    def test_sourced_headline_vitamin_share(self):
        b = balance("lm8uu", FULL, Params(bom="sourced"))
        self.assertAlmostEqual(b["imports_kg"]["vitamins"] / b["total_import_kg"], 0.831, delta=0.002)
        self.assertAlmostEqual(b["imports_kg"]["filament (virgin)"], 0.595 / 0.9 * (1 - 0.8 * 0.1), delta=0.002)

    def test_energy_totals_by_hand(self):
        # printing 8 kWh/kg x printed mass; melt energy x aluminium offcut mass; machining 2 kWh/kg
        prm = Params(bom="sourced")
        prod = parts_by_feedstock("lm8uu", FULL, prm)
        e = balance("lm8uu", FULL, prm)["energy_kwh"]
        self.assertAlmostEqual(e["print"], 8.0 * prod["filament"], 9)
        off = sum(v for k, v in prod.items() if k.startswith("aluminium")) * (1 / 0.7 - 1)
        self.assertAlmostEqual(e["melt Al"], melt_energy_kwh_per_kg(0.25) * off, 9)
        self.assertGreater(e["melt Al"], 0.0)
        self.assertAlmostEqual(e["machine"], 2.0 * sum(v for k, v in prod.items() if k != "filament"), 9)

    def test_unknown_bom_rejected(self):
        with self.assertRaises(ValueError):
            balance("lm8uu", PRN, Params(bom="nope"))
        with self.assertRaises(ValueError):
            balance_parts("lm8uu", "sourced", fill=0.0)


def balance_parts(variant, bom, fill=1.0):
    from selfrep_materials.balance import bom_parts
    return bom_parts(variant, Params(bom=bom, fill=fill))


if __name__ == "__main__":
    unittest.main()
