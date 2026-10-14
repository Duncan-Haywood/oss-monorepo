import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from selfrep_costpayback.cost import (MACHINES, PLASTIC_PAIR, SHOPS, VITAMIN_UNIT_PRICE, Prices,
                                      breakeven_filament_price, cost_paybacks, machine_cost, saving_cost_per_copy)
from selfrep_recyclers.machines import paybacks, per_copy_saving, with_params

RL = "printer+cnc+laser"


class T(unittest.TestCase):
    def test_every_vitamin_is_priced(self):
        for ps in MACHINES.values():
            for p in ps:
                self.assertIn(p.name, VITAMIN_UNIT_PRICE)

    def test_saving_is_mass_saving_times_price(self):
        pl_kg, al_kg = per_copy_saving("lm8uu", SHOPS["printer+cnc+laser+casting"])
        pl, al = saving_cost_per_copy("lm8uu", SHOPS["printer+cnc+laser+casting"])
        self.assertAlmostEqual(pl, pl_kg * 20.0)
        self.assertAlmostEqual(al, al_kg * 6.0)

    def test_vitamin_scale_raises_cost(self):
        a = machine_cost(PLASTIC_PAIR, SHOPS[RL])
        b = machine_cost(PLASTIC_PAIR, SHOPS[RL], Prices(vitamin_scale=2.0))
        self.assertAlmostEqual(b[0], 2 * a[0])
        self.assertAlmostEqual(b[1], a[1])

    def test_no_scrap_never_pays_back(self):
        self.assertIsNone(cost_paybacks("lm8uu", RL, with_params(s=0.0))["shredder+extruder"][3])

    def test_furnace_only_with_casting(self):
        self.assertNotIn("furnace", cost_paybacks("lm8uu", RL))

    def test_pricier_filament_shortens_payback_on_savings(self):
        # savings scale with the filament price, machine cost much less (vitamins dominate)
        a = cost_paybacks("lm8uu", RL)["shredder+extruder"][3]
        b = cost_paybacks("lm8uu", RL, pr=Prices(filament=40.0))["shredder+extruder"][3]
        self.assertLess(b, a)

    def test_breakeven_price_meets_target(self):
        p = breakeven_filament_price("lm8uu", RL, 20)
        c = cost_paybacks("lm8uu", RL, pr=Prices(filament=p))["shredder+extruder"][3]
        self.assertAlmostEqual(c, 20, delta=0.01)

    def test_cost_and_mass_paybacks_differ(self):
        m = paybacks("lm8uu", RL)["shredder+extruder"][2]
        c = cost_paybacks("lm8uu", RL)["shredder+extruder"][3]
        self.assertNotAlmostEqual(m, c, delta=1.0)


if __name__ == "__main__":
    unittest.main()
