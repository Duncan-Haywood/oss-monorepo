import json
import tempfile
import unittest
from pathlib import Path

import programme_check as pc

GOOD = "\n".join(f"## {s}\n\ntext\n" for s in pc.SECTIONS).replace(
    "## Related work\n\ntext", "## Related work\n\n" + "\n".join(f"- https://arxiv.org/abs/{i}" for i in range(10)))


class ProgrammeCheckTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "_shared").mkdir()
        (self.root / "_shared" / "legacy_projects.txt").write_text("old-one\n")
        (self.root / "old-one").mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def make(self, name, proposal=None, card=None):
        d = self.root / name
        d.mkdir()
        if proposal is not None:
            (d / "PROPOSAL.md").write_text(proposal)
        if card is not None:
            (d / "project.json").write_text(json.dumps(card))
        return d

    def check(self, d):
        return pc.problems(d, {"old-one"}, self.root)

    def test_legacy_exempt(self):
        self.assertEqual(self.check(self.root / "old-one"), [])
        self.assertEqual(pc.main(self.root), 0)

    def test_new_standalone_fails(self):
        d = self.make("new-thing", card={"title": "x"})
        self.assertTrue(self.check(d))
        self.assertEqual(pc.main(self.root), 1)

    def test_complete_proposal_passes(self):
        self.assertEqual(self.check(self.make("prog", proposal=GOOD)), [])

    def test_missing_section_and_thin_related_work(self):
        thin = GOOD.replace("## Gap", "## Gapp")
        thin = "\n".join(l for l in thin.splitlines() if "arxiv.org/abs/9" not in l)
        found = self.check(self.make("prog", proposal=thin))
        self.assertTrue(any("'## Gap'" in p for p in found))
        self.assertTrue(any("fewer than 10" in p for p in found))

    def test_member_of_programme(self):
        self.make("prog", proposal=GOOD)
        self.assertEqual(self.check(self.make("prog-step", card={"programme": "prog"})), [])
        self.assertTrue(self.check(self.make("orphan", card={"programme": "nosuch"})))

    def test_member_of_incomplete_programme_fails(self):
        self.make("half", proposal="## Question\n")
        self.assertTrue(self.check(self.make("step", card={"programme": "half"})))

    def test_standalone_needs_reason(self):
        self.assertTrue(self.check(self.make("a", card={"programme": "none"})))
        self.assertEqual(self.check(self.make("b", card={"programme": "none", "why_standalone": "a dataset"})), [])


class LongParagraphTest(unittest.TestCase):
    def test_flags_only_lines_over_the_limit(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            (d / "README.md").write_text("# T\n\n" + "x" * 50 + "\n\n" + "y" * 101 + "\n")
            self.assertEqual(pc.long_paragraphs(d, limit=100), [(5, 101)])
            self.assertEqual(pc.long_paragraphs(d, limit=101), [])

    def test_no_readme(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(pc.long_paragraphs(Path(tmp)), [])


class SrcLayoutTest(unittest.TestCase):
    """research/_shared/src_layout.py: tests that import a src/ package need src/ on pytest's path."""

    def setUp(self):
        import src_layout
        self.sl = src_layout
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def project(self, name, test="from pkg import f\n", **files):
        d = self.root / name
        (d / "src" / "pkg").mkdir(parents=True)
        (d / "src" / "pkg" / "__init__.py").write_text("def f(): return 1\n")
        (d / "tests").mkdir()
        (d / "tests" / "test_pkg.py").write_text(test)
        for fname, text in files.items():
            (d / fname.replace("_", ".", 1) if fname in ("pytest_ini", "setup_cfg", "tox_ini") else d / fname).write_text(text)
        return d

    def test_bare_project_flagged_then_fixed_with_pytest_ini(self):
        d = self.project("bare")
        self.assertTrue(self.sl.needs_fix(d))
        self.assertEqual(self.sl.main([], self.root), 1)
        self.assertEqual(self.sl.main(["--fix"], self.root), 0)
        self.assertEqual((d / "pytest.ini").read_text(), "[pytest]\npythonpath = src\n")
        self.assertEqual(self.sl.main([], self.root), 0)

    def test_pyproject_without_table_gets_table_appended(self):
        d = self.project("py", **{"pyproject.toml": '[project]\nname = "x"'})
        self.sl.fix(d)
        self.assertEqual((d / "pyproject.toml").read_text(),
                         '[project]\nname = "x"\n\n[tool.pytest.ini_options]\npythonpath = ["src"]\n')

    def test_existing_table_gets_one_line(self):
        d = self.project("tbl", **{"pyproject.toml": '[tool.pytest.ini_options]\ntestpaths = ["tests"]\n'})
        self.sl.fix(d)
        self.assertEqual((d / "pyproject.toml").read_text(),
                         '[tool.pytest.ini_options]\npythonpath = ["src"]\ntestpaths = ["tests"]\n')

    def test_pytest_ini_wins_over_pyproject(self):
        d = self.project("both", **{"pyproject.toml": "[project]\n", "pytest_ini": "[pytest]\naddopts = -q\n"})
        self.assertEqual(self.sl.fix(d).name, "pytest.ini")
        self.assertEqual((d / "pyproject.toml").read_text(), "[project]\n")

    def test_handled_projects_pass(self):
        self.assertFalse(self.sl.needs_fix(self.project("hack", test="import sys\nsys.path.insert(0, 'src')\nfrom pkg import f\n")))
        self.assertFalse(self.sl.needs_fix(self.project("cfg", **{"pyproject.toml": '[tool.pytest.ini_options]\npythonpath = ["src"]\n'})))
        self.assertFalse(self.sl.needs_fix(self.project("other", test="import json\n")))
        d = self.project("conf")
        (d / "tests" / "conftest.py").write_text("")
        self.assertFalse(self.sl.needs_fix(d))


import reproduce_names as rn


class ReproduceNamesTest(unittest.TestCase):
    """A new experiment script must be named in a doc of its programme (reproduce_names.py)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "_shared").mkdir()
        (self.root / "_shared" / "legacy_projects.txt").write_text("prog\n")
        self.d = self.root / "prog"
        (self.d / "experiments" / "m2_sweep").mkdir(parents=True)
        (self.d / "README.md").write_text("## Reproduce\n\npython3 experiments/run.py\n")
        (self.d / "experiments" / "run.py").write_text("import common\n")
        (self.d / "experiments" / "common.py").write_text("X = 1\n")
        (self.d / "experiments" / "_util.py").write_text("")
        (self.d / "experiments" / "test_run.py").write_text("")

    def tearDown(self):
        self.tmp.cleanup()

    def add(self, rel, body=""):
        f = self.d / "experiments" / rel
        f.write_text(body)
        return f

    def test_named_and_helpers_pass(self):
        self.assertEqual(rn.unnamed(self.d), [])
        self.assertEqual(pc.main(self.root), 0)

    def test_new_unnamed_script_fails_until_named(self):
        self.add("figure.py")
        self.assertEqual(rn.unnamed(self.d), ["research/prog/experiments/figure.py"])
        self.assertEqual(pc.main(self.root), 1)
        (self.d / "LOG.md").write_text("Ran `experiments/figure.py`.\n")
        self.assertEqual(pc.main(self.root), 0)

    def test_stem_must_match_whole_word(self):
        self.add("run_long.py")  # 'run' is named, 'run_long' is not
        self.assertEqual(rn.unnamed(self.d), ["research/prog/experiments/run_long.py"])

    def test_subdirectory_name_counts(self):
        self.add("m2_sweep/go.py")
        self.assertEqual(len(rn.unnamed(self.d)), 1)
        (self.d / "README.md").write_text("python3 experiments/run.py\nexperiments/m2_sweep/ reruns milestone 2\n")
        self.assertEqual(rn.unnamed(self.d), [])

    def test_baseline_grandfathers_and_prune_shrinks(self):
        self.add("old.py")
        path = self.root / "_shared" / "reproduce_baseline.txt"
        rn.write_baseline({"research/prog/experiments/old.py", "research/prog/experiments/gone.py"}, path)
        self.assertEqual(pc.main(self.root), 0)
        self.assertEqual(rn.main(["--check"], self.root, path), 0)
        self.add("new.py")
        self.assertEqual(rn.main(["--check"], self.root, path), 1)
        rn.main(["--prune"], self.root, path)
        self.assertEqual(rn.baseline(path), {"research/prog/experiments/old.py"})

    def test_brief_line(self):
        self.assertIsNone(rn.brief_line("prog", self.root))
        self.add("extra.mjs", "")
        self.assertIn("1 script(s)", rn.brief_line("prog", self.root))


if __name__ == "__main__":
    unittest.main()
