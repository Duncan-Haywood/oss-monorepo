import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "hanger-kes" / "src")]
from hanger_kes.kes import EAS, KES, best_offsets, kes_garment  # noqa: E402
from hanger_fit import model as hf  # noqa: E402


class TestKes(unittest.TestCase):
    def test_reference_fabric_has_unit_mass(self):
        g = kes_garment("A", 150.0)
        self.assertAlmostEqual(g.body, hf.garment("M", "tee").body)
        self.assertEqual(g.B, 0.0066)

    def test_mass_follows_weight(self):
        a, d = kes_garment("A", 150.0), kes_garment("D", 150.0)
        self.assertAlmostEqual(d.body / a.body, 24.60 / 12.55)

    def test_table_values_in_order(self):
        # B rises A < B < C < D in the source table
        bs = [KES[c][1] for c in "ABCD"]
        self.assertEqual(bs, sorted(bs))

    def test_best_offset_in_grid(self):
        s, errs = best_offsets("A", EAS[1])
        self.assertEqual(len(errs), 7)
        self.assertEqual(s["best_err"], min(errs))
        self.assertGreater(s["best_err"], 0.0)


if __name__ == "__main__":
    unittest.main()
