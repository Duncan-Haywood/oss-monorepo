import os, sys, unittest
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_contlength import run_ramp, penal_schedule
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "simdesign-starts", "src"))
from simdesign_starts import run_from


class T(unittest.TestCase):
    def test_zero_ramp_is_fixed_penalty(self):
        self.assertTrue(np.all(penal_schedule(20, 0) == 3.0))

    def test_schedule_ramps_then_holds(self):
        s = penal_schedule(150, 75)
        self.assertEqual(s[0], 1.0); self.assertEqual(s[-1], 3.0); self.assertTrue(np.all(s[75:] == 3.0))
        self.assertTrue(np.all(np.diff(s) >= 0)); self.assertEqual(sorted(set(s)), [1.0, 1.5, 2.0, 2.5, 3.0])

    def test_short_ramp_reaches_full_penalty_early(self):
        s = penal_schedule(50, 10)
        self.assertEqual(s[9], 3.0); self.assertEqual(s[0], 1.0)

    def test_ramp_75_matches_simdesign_starts_continuation(self):
        x0 = np.full((6, 18), 0.5)
        a = run_ramp(x0, 18, 6, 10, iters=20)["compliance"]
        b = run_from(x0, 18, 6, iters=20, continuation=True)["compliance"]  # starts ramps over iters/2 = 10
        self.assertAlmostEqual(a, b, places=6)

    def test_run_keeps_volume(self):
        r = run_ramp(np.full((8, 24), 0.5), 24, 8, 5, iters=12)
        self.assertAlmostEqual(r["x"].mean(), 0.5, delta=0.005)
