import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_uavcal.cal import *


class CalTests(unittest.TestCase):
    def test_pack_energy_matches_published_label(self):
        self.assertAlmostEqual(AIRCRAFT[0][2], 77.0, places=1)       # 5000 mAh x 15.4 V
        self.assertAlmostEqual(AIRCRAFT[1][2], 78.54, places=2)      # 6800 mAh x 11.55 V

    def test_endurance_grows_with_rotor_diameter(self):
        es = [endurance_min(1.05, 77.0, d, None, 0.9)[0] for d in DIAMS]
        self.assertEqual(es, sorted(es))

    def test_endurance_is_energy_over_power(self):
        e, v = endurance_min(1.05, 77.0, 0.22, 6.0, 1.0)
        self.assertAlmostEqual(e * 60 * (M.fwd_power(1.05, 0.22, 6.0) + M.P_AVIONICS), 77.0 * 3600, places=3)

    def test_matching_diameter_reproduces_published_endurance(self):
        d = matching_diameter(1.45, 78.54, 38.0, 6.0, 0.9)
        self.assertAlmostEqual(endurance_min(1.45, 78.54, d, 6.0, 0.9)[0], 38.0, places=4)

    def test_hover_power_matches_momentum_theory(self):
        # ideal hover power for 1.05 kg, 4 x 0.22 m rotors, divided by FM x drive efficiency
        a = 4 * math.pi * 0.11 ** 2
        ideal = (1.05 * 9.81) ** 1.5 / math.sqrt(2 * 1.225 * a)
        self.assertAlmostEqual(M.hover_power(1.05, 0.22), ideal / (0.70 * 0.85 * 0.95), places=6)

    def test_sourced_diameter_is_9_4_inch(self):
        self.assertAlmostEqual(SOURCED_DIAM["DJI Mavic 3E"], 0.23876, places=5)

    def test_sourced_diameter_endurance_between_swept_neighbours(self):
        e = endurance_min(1.05, 77.0, SOURCED_DIAM["DJI Mavic 3E"], None, 0.9)[0]
        self.assertGreater(e, endurance_min(1.05, 77.0, 0.22, None, 0.9)[0])
        self.assertLess(e, endurance_min(1.05, 77.0, 0.25, None, 0.9)[0])


if __name__ == "__main__":
    unittest.main()
