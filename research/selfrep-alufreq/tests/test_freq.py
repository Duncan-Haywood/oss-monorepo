import pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_alufreq import freq
from selfrep_rodmodes import modes as m


class T(unittest.TestCase):
    def test_diameter_reaches_target(self):
        d = freq.diameter("aluminium", 30.0)
        self.assertGreaterEqual(m.frequency("aluminium", d, freq.L), 30.0 - 1e-6)
        self.assertLess(m.frequency("aluminium", d * 0.99, freq.L), 30.0)

    def test_aluminium_thinner_than_hardwood(self):
        self.assertLess(freq.diameter("aluminium", 20.0), freq.diameter("hardwood", 20.0))

    def test_diameter_monotone_in_target(self):
        ds = [freq.diameter("aluminium", f) for f in (10, 20, 40, 60)]
        self.assertEqual(ds, sorted(ds))

    def test_heavier_carriage_needs_thicker_rod(self):
        self.assertLess(freq.diameter("aluminium", 20, 0.2), freq.diameter("aluminium", 20, 0.6))

    def test_holder_limit_frequency_consistent_with_fit(self):
        fmax = freq.max_frequency_within_holder("aluminium")
        self.assertTrue(freq.row("aluminium", fmax * 0.99)["fits"])
        self.assertFalse(freq.row("aluminium", fmax * 1.05)["fits"])

    def test_substitution_table_restored(self):
        before = freq.alu.rd.SUBS[4]
        freq.row("aluminium", 20.0)
        self.assertIs(freq.alu.rd.SUBS[4], before)


if __name__ == "__main__":
    unittest.main()
