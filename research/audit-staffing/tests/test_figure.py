import importlib.util
import unittest
import xml.dom.minidom
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments"
spec = importlib.util.spec_from_file_location("audit_staffing_figure", EXP / "figure.py")
fig = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fig)


class FigureTest(unittest.TestCase):
    def test_parses_committed_results(self):
        rows = fig.parse((EXP / "results.txt").read_text())
        self.assertEqual(len(rows), 8)
        self.assertEqual(rows[0][0], 0.5)
        self.assertAlmostEqual(rows[0][1], 76.84)

    def test_svg_is_wellformed_and_committed_copy_is_current(self):
        rows = fig.parse((EXP / "results.txt").read_text())
        s = fig.svg(rows)
        xml.dom.minidom.parseString(s)
        self.assertEqual(s, (EXP / "cost_vs_stake.svg").read_text())


if __name__ == "__main__":
    unittest.main()
