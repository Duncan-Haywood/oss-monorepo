import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from eda_clocksweep import sweep as S  # noqa: E402


class Sweep(unittest.TestCase):
    def test_script_unconstrained_is_baseline(self):
        self.assertEqual(S.script(None), "strash; dc2; map; topo; stime")

    def test_script_constrained(self):
        s = S.script(4000)
        self.assertIn("map -D 4000", s)
        self.assertIn("upsize -D 4000", s)
        self.assertIn("dnsize -D 4000", s)
        self.assertTrue(s.endswith("stime"))

    def test_met(self):
        self.assertTrue(S.met({"delay_ps": 3999.9}, 4000))
        self.assertTrue(S.met({"delay_ps": 4000}, 4000))
        self.assertFalse(S.met({"delay_ps": 4000.1}, 4000))

    def test_feasible_front_drops_slow_designs(self):
        rows = [{"area_um2": 1, "cycles": 9, "delay_ps": 5000},   # smallest but too slow for T=4000
                {"area_um2": 2, "cycles": 5, "delay_ps": 3000},
                {"area_um2": 3, "cycles": 2, "delay_ps": 3900},
                {"area_um2": 4, "cycles": 4, "delay_ps": 3000}]   # dominated by row 1
        self.assertEqual(sorted(S.feasible_front(rows, 4000)), [1, 2])
        self.assertEqual(sorted(S.feasible_front(rows, 6000)), [0, 1, 2])
        self.assertEqual(S.feasible_front(rows, 100), [])

    def test_parse_reads_yosys_stat(self):
        out = "Number of cells: 10\nChip area for module '\\a': 123.5\nDelay =  42.00 ps"
        m = S.F.parse(out)
        self.assertEqual((m["area_um2"], m["delay_ps"], m["cells"]), (123.5, 42.0, 10))


if __name__ == "__main__":
    unittest.main()
