import os, sys, unittest
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_stuck import stuck_starts, continue_schedule
from simdesign_startsconverge import run_checkpoints


class T(unittest.TestCase):
    def test_stuck_threshold(self):
        ref = np.array([[1.0, 1.0, 0.0, 0.0]] * 5)
        same = ref.copy(); one = ref.copy(); one[0, 0] = 0.0  # 1 of 20 elements = 5%
        self.assertEqual(stuck_starts([same, one], ref, 0.01), [1])
        self.assertEqual(stuck_starts([same, one], ref, 0.10), [])

    def test_single_stage_equals_plain_run(self):
        x0 = np.full((8, 24), 0.5)
        a = continue_schedule(x0, 24, 8, [(3.0, 15)])
        b = run_checkpoints(x0, 24, 8, [15])[15]["x"]
        self.assertTrue(np.allclose(a, b))

    def test_stages_chain_and_hold_volume(self):
        x0 = np.full((8, 24), 0.5)
        a = continue_schedule(x0, 24, 8, [(1.0, 10), (3.0, 10)])
        mid = run_checkpoints(x0, 24, 8, [10], penal=1.0)[10]["x"]
        b = run_checkpoints(mid, 24, 8, [10], penal=3.0)[10]["x"]
        self.assertTrue(np.allclose(a, b))
        self.assertAlmostEqual(a.mean(), 0.5, delta=0.005)

    def test_input_not_mutated(self):
        x0 = np.full((8, 24), 0.5); c = x0.copy()
        continue_schedule(x0, 24, 8, [(2.0, 5)])
        self.assertTrue(np.array_equal(x0, c))
