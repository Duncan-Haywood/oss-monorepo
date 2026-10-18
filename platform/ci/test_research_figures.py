import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import research_figures  # noqa: E402


class FigurelessTest(unittest.TestCase):
    def test_svg_counts_as_figure_and_results_filter(self):
        with tempfile.TemporaryDirectory() as t:
            root = Path(t)
            for slug, files in {
                "has-png": ["experiments/results.txt", "experiments/a.png"],
                "has-svg": ["experiments/results.txt", "experiments/a.svg"],
                "none": ["experiments/results.txt"],
                "bare": ["README.md"],
                "_homepage": ["x.txt"],
            }.items():
                for f in files:
                    p = root / slug / f
                    p.parent.mkdir(parents=True, exist_ok=True)
                    p.write_text("x")
            self.assertEqual(research_figures.figureless(root), ["none"])
            self.assertEqual(research_figures.figureless(root, only_with_results=False), ["bare", "none"])


if __name__ == "__main__":
    unittest.main()
