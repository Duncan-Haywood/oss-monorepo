import importlib.util
import unittest
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments"
spec = importlib.util.spec_from_file_location("alias_figure", EXP / "figure.py")
fig = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fig)


class FigureTest(unittest.TestCase):
    def test_parses_all_rows_from_committed_results(self):
        rows = fig.parse_section2((EXP / "results.txt").read_text())
        self.assertEqual(len(rows), 14)
        self.assertEqual(rows[0][0], 2.0)
        v, twin, naive, unfold = next(r for r in rows if r[0] == 12.0)
        self.assertAlmostEqual(naive, 14.9290)

    def test_svg_is_wellformed_and_committed_copy_is_current(self):
        import xml.dom.minidom
        rows = fig.parse_section2((EXP / "results.txt").read_text())
        s = fig.svg(rows)
        xml.dom.minidom.parseString(s)
        self.assertEqual(s, (EXP / "rmse_vs_speed.svg").read_text())


if __name__ == "__main__":
    unittest.main()
