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

    def test_table_without_rows_exits(self):
        with self.assertRaises(SystemExit):
            linefig.table(TEXT, "== missing", 0, [1])

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
