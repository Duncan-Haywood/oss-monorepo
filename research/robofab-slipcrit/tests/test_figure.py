import importlib.util
import json
import unittest
import xml.dom.minidom
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments"
spec = importlib.util.spec_from_file_location("figure_mod", EXP / "figure.py")
fig = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fig)


class FigureTest(unittest.TestCase):
    def test_svg_is_wellformed_and_committed_copy_is_current(self):
        d = json.loads((EXP / "results.json").read_text())
        s = fig.svg(d)
        xml.dom.minidom.parseString(s)
        self.assertEqual(s.count("<rect"), 1 + 12 + 3)
        self.assertEqual(s, (EXP / "spread.svg").read_text())


if __name__ == "__main__":
    unittest.main()
