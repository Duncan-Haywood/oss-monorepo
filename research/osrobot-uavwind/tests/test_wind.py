import math, unittest
from osrobot_uav import model as M
from osrobot_uavwind.wind import *


class T(unittest.TestCase):
    def test_zero_wind_matches_osrobot_uav(self):
        ms0, msw = M.Mission(3000, 1200, 0.5), WindMission(3000, 1200, 0.5, wind=0.0)
        self.assertAlmostEqual(size_multirotor(msw)["mass"], M.size_multirotor(ms0)["mass"], places=2)
        self.assertAlmostEqual(size_fixedwing(msw)["mass"], M.size_fixedwing(ms0)["mass"], places=2)
        self.assertAlmostEqual(size_vtol(msw)["mass"], M.size_vtol(ms0)["mass"], places=2)

    def test_leg_time_factor(self):
        v, w = 15.0, 5.0
        self.assertAlmostEqual(leg_time_factor(v, 0.0), 2 / v)
        self.assertAlmostEqual(leg_time_factor(v, w), 1 / (v - w) + 1 / (v + w))
        self.assertGreater(leg_time_factor(v, w), leg_time_factor(v, 0.0))  # a head+tail pair is a net loss

    def test_transit_speed_is_a_minimum(self):
        m, S, w = 1.3, 0.14, 6.0
        v, p = fw_transit(m, S, w)
        f = lambda u: M.fw_power(m, S, u) * leg_time_factor(u, w)
        self.assertLessEqual(f(v), f(v * 1.05) + 1e-9)
        if v > w * 1.05 + 0.6:
            self.assertLessEqual(f(v), f(v * 0.95) + 1e-9)

    def test_mass_is_monotone_in_wind(self):
        prev = {}
        for w in (0, 4, 8):
            ms = WindMission(3000, 600, 0.5, wind=w)
            for k, f in (("mr", size_multirotor), ("fw", size_fixedwing)):
                r = f(ms)["mass"]
                self.assertGreaterEqual(r, prev.get(k, 0) - 1e-6)
                prev[k] = r

    def test_translational_lift_credit_only_lowers_multirotor_power(self):
        import osrobot_uavwind.wind as W
        try:
            W.CREDIT = False
            hi = W.mr_station_power(2.0, 0.3, 8.0)
            W.CREDIT = True
            lo = W.mr_station_power(2.0, 0.3, 8.0)
        finally:
            W.CREDIT = False
        self.assertGreaterEqual(hi, M.hover_power(2.0, 0.3) - 1e-9)
        self.assertLess(lo, hi)

    def test_too_strong_wind_does_not_close(self):
        self.assertIsNone(size_multirotor(WindMission(3000, 600, 0.5, wind=19.5)))

    def test_closure_balances_mass(self):
        ms = WindMission(2000, 600, 0.5, wind=6)
        r = M.close(fw_mission_energy, fw_nonbattery, ms, 0.2)
        e = fw_mission_energy(r["mass"], 0.2, ms) * (1 + M.RESERVE)
        self.assertAlmostEqual(r["m_bat"], e / (M.DOD * M.E_PACK), places=5)

    def test_frozen_reproduces_own_mission_and_loses_time_in_wind(self):
        ms = WindMission(3000, 1200, 0.5, wind=0.0)
        for kind, f in (("mr", size_multirotor), ("fw", size_fixedwing)):
            d = f(ms)
            self.assertAlmostEqual(frozen_loiter(kind, d, ms), 1200, delta=1.0)
            self.assertLess(frozen_loiter(kind, d, WindMission(3000, 1200, 0.5, wind=9.0)) or 0, 1200)


if __name__ == "__main__":
    unittest.main()
