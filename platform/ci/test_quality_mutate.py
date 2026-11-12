"""Tests for platform/ci/quality_mutate.py: seeded bugs run in a shadow copy, never the tree."""
import contextlib
import importlib.util
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("quality_mutate", Path(__file__).with_name("quality_mutate.py"))
qm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qm)

CALC = "def fee(x):\n    if x > 100:\n        return 5\n    return 0\n"
TEST = ("import sys, unittest\nsys.path.insert(0, '../b')\nfrom calc import fee\nfrom helper import k\n"
        "class T(unittest.TestCase):\n"
        "    def test_fee(self):\n        self.assertEqual(fee(101), 5)\n        self.assertEqual(fee(100), 0)\n"
        "    def test_k(self):\n        self.assertEqual(k(), 7)\n")


class Fixture(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self._tmp.name) / "repo"
        a, b = self.repo / "ventures" / "a", self.repo / "ventures" / "b"
        a.mkdir(parents=True)
        b.mkdir(parents=True)
        (a / "calc.py").write_text(CALC)
        (a / "test_calc.py").write_text(TEST)
        (a / "node_modules" / "pkg").mkdir(parents=True)
        (a / "__pycache__").mkdir()
        (b / "helper.py").write_text("def k():\n    return 7\n")
        (self.repo / "README.md").write_text("top\n")
        self._old_repo = qm.REPO
        qm.REPO = self.repo

    def tearDown(self):
        qm.REPO = self._old_repo
        self._tmp.cleanup()

    def mutate(self, *args):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
            code = qm.main([str(self.repo / "ventures/a/calc.py"), *args, "--json", "--",
                            sys.executable, "-m", "unittest", "-q"])
        return code, out.getvalue()


class ShadowTest(Fixture):
    def test_root_is_copied_and_the_rest_linked(self):
        dest = Path(self._tmp.name) / "shadow"
        qm.build_shadow(self.repo, Path("ventures/a"), dest)
        assert (dest / "README.md").is_symlink()
        assert (dest / "ventures" / "b").is_symlink()
        assert not (dest / "ventures").is_symlink()
        calc = dest / "ventures" / "a" / "calc.py"
        assert calc.is_file() and not calc.is_symlink()
        assert (dest / "ventures" / "a" / "node_modules").is_symlink()
        assert not (dest / "ventures" / "a" / "__pycache__").exists()

    def test_default_root(self):
        assert qm.default_root(Path("ventures/x/src/a.mjs")) == Path("ventures/x")
        assert qm.default_root(Path("platform/ci/x.py")) == Path("platform/ci")


class MutateTextTest(unittest.TestCase):
    def test_once_and_line(self):
        text, line = qm.mutate_text(CALC, "x > 100", "x >= 100", None)
        assert "x >= 100" in text and line == 2

    def test_ambiguous_needs_occurrence(self):
        with self.assertRaises(ValueError):
            qm.mutate_text("a\na\n", "a", "b", None)
        assert qm.mutate_text("a\na\n", "a", "b", 2) == ("a\nb\n", 2)

    def test_missing(self):
        with self.assertRaises(ValueError):
            qm.mutate_text(CALC, "nope", "x", None)


class MainTest(Fixture):
    def test_caught_and_tree_untouched(self):
        code, out = self.mutate("--old", "x > 100", "--new", "x >= 100")
        assert code == 0, out
        row = json.loads(out.strip().splitlines()[-1])
        assert row["caught"] is True and row["where"] == "calc.py:2"
        assert (self.repo / "ventures/a/calc.py").read_text() == CALC

    def test_survivor(self):
        # 5 -> 5.0 compares equal, so no test can fail: the mutant survives
        code, out = self.mutate("--old", "return 5\n", "--new", "return 5.0\n")
        assert code == 1, out
        assert json.loads(out.strip().splitlines()[-1])["caught"] is False

    def test_red_baseline_is_not_a_catch(self):
        (self.repo / "ventures/b/helper.py").write_text("def k():\n    return 8\n")
        code, _ = self.mutate("--old", "x > 100", "--new", "x >= 100")
        assert code == 2


if __name__ == "__main__":
    unittest.main()
