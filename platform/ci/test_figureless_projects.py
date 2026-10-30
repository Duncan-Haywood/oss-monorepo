import contextlib
import io
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

    def _project(self, r):
        (r / "a").mkdir()
        (r / "a" / "results.txt").write_text("x")
        (r / "b").mkdir()
        (r / "b" / "results.txt").write_text("x")
        (r / "b" / "fig.png").write_text("x")

    def test_main_lists_names_and_exits_0(self):
        with tempfile.TemporaryDirectory() as d:
            self._project(Path(d))
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(fp.main(["--research", d]), 0)
            self.assertEqual(out.getvalue(), "a\n")

    def test_main_count_prints_just_the_number(self):
        with tempfile.TemporaryDirectory() as d:
            self._project(Path(d))
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                fp.main(["--count", "--research", d])
            self.assertEqual(out.getvalue(), "1\n")

    def test_default_research_dir_is_the_repos_research_tree(self):
        self.assertEqual(fp.REPO, Path(__file__).resolve().parents[2])
        self.assertTrue((fp.REPO / "research").is_dir())
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(fp.main(["--count"]), 0)
        self.assertTrue(out.getvalue().strip().isdigit())

    def test_help_describes_the_tool(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), self.assertRaises(SystemExit):
            fp.main(["--help"])
        self.assertIn(fp.__doc__.splitlines()[0], out.getvalue())


if __name__ == "__main__":
    unittest.main()
