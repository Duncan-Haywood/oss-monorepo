import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import linefig  # noqa: E402

TEXT = ["== A", "x y", "1 2", "2 4", "3 8", "next 1 2"]


class LineFig(unittest.TestCase):
    def test_table_parses_numeric_rows_only(self):
        xs, ys = linefig.table(TEXT, "== A", 0, [1])
        self.assertEqual((xs, ys), ([1.0, 2.0, 3.0], [[2.0, 4.0, 8.0]]))

    def test_table_splits_on_custom_separator(self):
        rows = ["== P", "| n | v |", "|---|---|", "| 1 | 2.5 |", "| 2 | 3.5 |"]
        xs, ys = linefig.table(rows, "== P", 0, [1], sep="|")
        self.assertEqual((xs, ys), ([1.0, 2.0], [[2.5, 3.5]]))

    def test_table_accepts_a_string(self):
        xs, ys = linefig.table("\n".join(TEXT), "== A", 0, [1])
        self.assertEqual(xs, [1.0, 2.0, 3.0])

    def test_table_section_ignores_equals_signs(self):
        xs, _ = linefig.table(TEXT, "A", 0, [1])
        self.assertEqual(xs, [1.0, 2.0, 3.0])

    def test_table_without_rows_exits(self):
        with self.assertRaises(SystemExit):
            linefig.table(TEXT, "== missing", 0, [1])

    def test_num_reads_value_with_standard_error(self):
        self.assertEqual(linefig.num("0.3818(0.0020)"), 0.3818)
        self.assertEqual(linefig.num("-1.5e-3(2e-4)"), -1.5e-3)
        self.assertEqual(linefig.num("0.38±0.02"), 0.38)
        self.assertEqual(linefig.num("12+-3"), 12.0)
        self.assertIsNone(linefig.num("(0.002)"))
        self.assertIsNone(linefig.num("n/a"))
        self.assertIsNone(linefig.num("0.3(0.1)x"))

    def test_table_parses_value_se_cells(self):
        rows = ["== S", "n mean(se)", "10 0.3818(0.0020)", "20 0.4010(0.0015)"]
        xs, ys = linefig.table(rows, "== S", 0, [1])
        self.assertEqual((xs, ys), ([10.0, 20.0], [[0.3818, 0.401]]))

    def test_vline_draws_and_widens_the_axis(self):
        series = [("s", [1, 2, 3], [2, 4, 8])]
        plain = linefig.svg_lines("T", "a", "x", "y", series)
        one = linefig.svg_lines("T", "a", "x", "y", series, vline=2.0)
        self.assertEqual(one.count('stroke-dasharray'), plain.count('stroke-dasharray') + 1)
        two = linefig.svg_lines("T", "a", "x", "y", series, vline=[1.5, 6])
        self.assertEqual(two.count('stroke-dasharray'), plain.count('stroke-dasharray') + 2)
        # x = 6 lies past the data, so the right-most point no longer sits at the plot's edge
        self.assertNotIn('<circle cx="624.0"', two)

    def test_svg_has_series_and_alt(self):
        svg = linefig.svg_lines("T", "alt text", "x", "y", [("s", [1, 2, 3], [2, 4, 8])])
        self.assertIn('aria-label="alt text"', svg)
        self.assertEqual(svg.count("<polyline"), 1)
        self.assertTrue(svg.endswith("</svg>\n"))

    def test_workcell_twin_figure_reproduces_committed_svg(self):
        exp = Path(__file__).resolve().parents[1] / "workcell-twin" / "experiments"
        before = (exp / "claim_vs_real.svg").read_bytes()
        subprocess.run([sys.executable, str(exp / "figure.py")], check=True, capture_output=True)
        self.assertEqual((exp / "claim_vs_real.svg").read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
