import tempfile
import unittest
from pathlib import Path

import figureless_projects as fp


class FigurelessTest(unittest.TestCase):
    def test_classifies(self):
        with tempfile.TemporaryDirectory() as d:
            r = Path(d)
            for name, files in {
                "a": ["results.txt"],
                "b": ["results.txt", "experiments/fig.svg"],
                "c": ["README.md"],
                "d": ["x/results.json", "plot.PNG"],
            }.items():
                for f in files:
                    p = r / name / f
                    p.parent.mkdir(parents=True, exist_ok=True)
                    p.write_text("x")
            self.assertEqual(fp.figureless(r), ["a"])


if __name__ == "__main__":
    unittest.main()
