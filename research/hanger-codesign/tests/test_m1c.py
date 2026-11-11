"""Milestone 1c wiring: the base configuration reproduces milestones 1 and 1b, and the mesh and
EA knobs reach the sheet and the 2D chain."""
import importlib.util
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("m1c", HERE.parent / "experiments" / "m1c_ea_mesh" / "run.py")
m1c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m1c)


class TestM1c(unittest.TestCase):
    def test_configs(self):
        self.assertEqual(m1c.CONFIGS[0], m1c.BASE)
        self.assertEqual((m1c.CHUNK, m1c.TOL, m1c.MAXIT), (3000, 0.002, 60000))  # milestone 1b's rule
        self.assertIn(2.5, m1c.OFFSETS)

    def test_base_first_chunk_is_milestone_1_solve(self):
        old = m1c.MAXIT
        m1c.MAXIT = m1c.CHUNK
        try:
            traj = m1c.solve(("A", 1.0, m1c.BASE))[3]
        finally:
            m1c.MAXIT = old
        self.assertAlmostEqual(traj[0][1], 1.921, places=3)  # milestone 1 results.txt, A +1

    def test_2d_chain_reproduces_1b_posthoc_and_sees_ea(self):
        self.assertAlmostEqual(m1c.run2("A", 1.0, 150.0, m1c.DS), 0.1822, places=4)  # posthoc_2d.txt
        self.assertNotAlmostEqual(m1c.run2("A", 1.0, 40.0, m1c.DS), 0.1822, places=2)


if __name__ == "__main__":
    unittest.main()
