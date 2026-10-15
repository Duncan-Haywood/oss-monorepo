import math, unittest
from osrobot_uav.model import *


class T(unittest.TestCase):
    def test_hover_matches_momentum_theory(self):
        # 1 kg, four 0.25 m rotors: ideal power = T^1.5 / sqrt(2 rho A), then FM and drive losses
        a = 4 * math.pi * 0.125 ** 2
        ideal = (1 * G) ** 1.5 / math.sqrt(2 * RHO * a)
        self.assertAlmostEqual(hover_power(1.0, 0.25), ideal / (FM * ETA_DRIVE), places=6)
        self.assertGreater(hover_power(1.0, 0.25), 50)
        self.assertLess(hover_power(1.0, 0.25), 150)

    def test_forward_flight_induced_power_falls_with_speed(self):
        d, m = 0.3, 2.0
        vi_hover = hover_power(m, d)
        self.assertLess(fwd_power(m, d, 10) , vi_hover * 1.2)  # not wildly above hover
        v, p = mr_best_speed(m, d)
        self.assertTrue(3 < v < 25)
        self.assertLess(p / v, fwd_power(m, d, 3) / 3)

    def test_fixed_wing_speeds_are_the_polar_optima(self):
        m, S = 1.5, 0.2
        vr, vl, vmin = fw_speeds(m, S)
        f = lambda v: fw_power(m, S, v) / v
        if vr > vmin * 1.001:
            self.assertLess(f(vr), f(vr * 1.1)); self.assertLess(f(vr), f(vr * 0.9))
        g = lambda v: fw_power(m, S, v, BANK_N)
        if vl > vmin * 1.001:
            self.assertLess(g(vl), g(vl * 1.1)); self.assertLess(g(vl), g(vl * 0.9))

    def test_closure_balances_mass(self):
        ms = Mission(2000, 600, 0.5)
        r = close(mr_mission_energy, mr_nonbattery, ms, 0.3)
        self.assertIsNotNone(r)
        e = mr_mission_energy(r["mass"], 0.3, ms) * (1 + RESERVE)
        self.assertAlmostEqual(r["m_bat"], e / (DOD * E_PACK), places=5)
        self.assertAlmostEqual(r["mass"], mr_nonbattery(r["mass"], 0.3, ms) + r["m_bat"], places=5)

    def test_mass_rises_with_payload_and_loiter(self):
        a = size_fixedwing(Mission(2000, 600, 0.5))["mass"]
        self.assertGreater(size_fixedwing(Mission(2000, 600, 1.0))["mass"], a)
        self.assertGreater(size_fixedwing(Mission(2000, 1800, 0.5))["mass"], a)

    def test_infeasible_returns_none(self):
        self.assertIsNone(size_multirotor(Mission(3000, 5400, 0.5)))

    def test_frozen_design_reproduces_its_own_mission(self):
        ms = Mission(3000, 1200, 0.5)
        for kind, f in (("mr", size_multirotor), ("fw", size_fixedwing)):
            d = f(ms)
            self.assertAlmostEqual(frozen_max_loiter(kind, d, ms), 1200, delta=1.0)

    def test_frozen_design_cannot_go_too_far(self):
        d = size_fixedwing(Mission(3000, 1200, 0.5))
        self.assertIsNone(frozen_max_loiter("fw", d, Mission(20000, 600, 0.5)))


if __name__ == "__main__":
    unittest.main()
