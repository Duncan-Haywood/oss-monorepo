"""Milestone 1 wiring: the reused models load and score a sourced fabric."""
import importlib.util
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("m1", HERE.parent / "experiments" / "m1_kes_fidelity" / "run.py")
m1 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m1)


class TestM1(unittest.TestCase):
    def test_fabrics_are_the_sourced_four(self):
        self.assertEqual(m1.FABRICS, ["A", "B", "C", "D"])
        self.assertAlmostEqual(m1.KES["D"][1], 0.1249)

    def test_garment_uses_measured_bending(self):
        g = m1.garment("C")
        self.assertAlmostEqual(g.B, 0.0270)
        self.assertEqual(g.EA, m1.EA)

    def test_width_offset_moves_only_width(self):
        h0, h1 = m1.width("A", 0.0), m1.width("A", 2.0)
        self.assertAlmostEqual(h1.w - h0.w, 2.0)
        self.assertEqual((h0.slope, h0.bow, h0.r), (h1.slope, h1.bow, h1.r))

    def test_2d_score_is_finite_and_wood_beats_wire(self):
        g = m1.garment("A")
        wood = m1.run2(m1.m2.STOCK["wood-shaped"], g)
        wire = m1.run2(m1.m2.STOCK["wire"], g)
        self.assertTrue(0.0 < wood < wire)


if __name__ == "__main__":
    unittest.main()
