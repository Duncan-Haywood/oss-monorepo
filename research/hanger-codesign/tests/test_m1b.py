"""Milestone 1b wiring: the chunked solve reproduces milestone 1's first 3000 iterations."""
import importlib.util
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("m1b", HERE.parent / "experiments" / "m1b_converged" / "run.py")
m1b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m1b)


class TestM1b(unittest.TestCase):
    def test_grid_contains_milestone_1_offsets(self):
        self.assertTrue(set(m1b.m1.OFFSETS) <= set(m1b.OFFSETS))
        self.assertEqual(m1b.FABRICS, ["A", "B", "C", "D"])

    def test_first_chunk_is_milestone_1_solve(self):
        old = m1b.MAXIT
        m1b.MAXIT = m1b.CHUNK
        try:
            code, o, traj, _ = m1b.solve(("A", 1.0))
        finally:
            m1b.MAXIT = old
        self.assertEqual(len(traj), 1)
        self.assertEqual(traj[0][0], 3000)
        self.assertAlmostEqual(traj[0][1], 1.921, places=3)  # milestone 1 results.txt, A +1


if __name__ == "__main__":
    unittest.main()
