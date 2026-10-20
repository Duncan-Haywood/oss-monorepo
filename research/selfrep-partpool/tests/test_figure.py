import importlib.util, unittest, xml.dom.minidom
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments"
spec = importlib.util.spec_from_file_location("partpool_figure", EXP / "figure.py")
fig = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fig)


class FigureTest(unittest.TestCase):
    def test_parses_committed_results(self):
        xs, ys = fig.table(fig.TEXT, "== B.", 0, [1, 2, 3])
        self.assertEqual(xs, [2, 4, 8, 16, 32, 64])
        self.assertEqual(ys[0][-1], 300.0)

    def test_committed_svg_wellformed(self):
        xml.dom.minidom.parseString((EXP / "time_to_fleet.svg").read_text())


if __name__ == "__main__":
    unittest.main()
