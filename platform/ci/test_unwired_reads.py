"""unwired_reads.py: a data-only change runs only the unwired items that read it,
and every doubt runs more, never less."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import unwired_checks
import unwired_reads as ur


def entry(root, rel, reads, text="x = 1\n"):
    p = Path(root) / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)
    return {"path": rel, "sha256": hashlib.sha256(text.encode()).hexdigest(), "reads": reads}


class Areas(unittest.TestCase):
    def test_area_cuts_to_two_levels_and_marks_listings(self):
        root = "/r"
        self.assertEqual(ur.area("/r/docs/reports/a.md", root=root), "docs/reports")
        self.assertEqual(ur.area("/r/ventures/x/sub/deep.mjs", root=root), "ventures/x")
        self.assertEqual(ur.area("/r/pyproject.toml", root=root), "pyproject.toml")
        self.assertEqual(ur.area("/r/ventures", listing=True, root=root), "ventures/*")
        self.assertEqual(ur.area("/r", listing=True, root=root), "*")
        self.assertEqual(ur.area("/r/.git/HEAD", root=root), "*")
        self.assertIsNone(ur.area("/usr/lib/x.so", root=root))
        self.assertIsNone(ur.area("/r", root=root))  # a stat of the root reads nothing

    def test_touches(self):
        self.assertTrue(ur.touches({"docs/reports"}, "docs/reports/new.md"))
        self.assertTrue(ur.touches({"ventures/*"}, "ventures/brand-new/index.html"))
        self.assertTrue(ur.touches({"*"}, "anything/at/all"))
        self.assertFalse(ur.touches({"docs/posts", "ventures/a"}, "docs/reports/new.md"))
        self.assertFalse(ur.touches({"ventures/a"}, "ventures/b/index.html"))

    def test_trace_lines(self):
        lines = [
            '1 openat(AT_FDCWD, "/r/docs/reports/a.md", O_RDONLY|O_CLOEXEC) = 3',
            '1 newfstatat(AT_FDCWD, "portfolio/ledger/x.yaml", {st_mode=S_IFREG}, 0) = 0',
            '1 openat(AT_FDCWD, "/r/ventures", O_RDONLY|O_NONBLOCK|O_CLOEXEC|O_DIRECTORY) = 4',
            '1 access("/r/missing/file", R_OK) = -1 ENOENT (No such file or directory)',
            '1 openat(AT_FDCWD, "/etc/ld.so.cache", O_RDONLY|O_CLOEXEC) = 3',
        ]
        self.assertEqual(ur.reads_from_trace(lines, {"/r"}, root="/r"),
                         {"docs/reports", "portfolio/ledger", "ventures/*", "missing/file"})
        git = ['2 execve("/usr/bin/git", ["git", "ls-files"], 0x7ff /* 9 vars */) = 0']
        self.assertEqual(ur.reads_from_trace(git, {"/r"}, root="/r"), {"*"})

    def test_relative_paths_resolve_against_every_base(self):
        lines = ['1 openat(AT_FDCWD, "docs/reports/a.md", O_RDONLY) = 3']
        got = ur.reads_from_trace(lines, {"/r", "/r/platform/ci"}, root="/r")
        self.assertIn("docs/reports", got)


class Selector(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        self.data = {"items": {
            "check_posts.py": entry(self.root, "platform/ci/check_posts.py", ["docs/posts"]),
            "check_reports.py": entry(self.root, "platform/ci/check_reports.py", ["docs/reports"]),
            "check_git.py": entry(self.root, "platform/ci/check_git.py", ["*"]),
        }}

    def tearDown(self):
        self.tmp.cleanup()

    def sel(self, changed):
        return ur.selector(changed, data=self.data, root=self.root)

    def test_a_reports_change_runs_only_its_readers(self):
        needed = self.sel(["docs/reports/2026-11-26-x.md", "prompts/runs/r.yaml"])
        self.assertTrue(needed("check_reports.py"))
        self.assertTrue(needed("check_git.py"))
        self.assertFalse(needed("check_posts.py"))

    def test_an_unmapped_item_runs(self):
        self.assertTrue(self.sel(["docs/reports/a.md"])("check_added_later.py"))

    def test_an_item_edited_since_the_trace_runs(self):
        (Path(self.root) / "platform/ci/check_posts.py").write_text("x = 2  # now reads reports\n")
        self.assertTrue(self.sel(["docs/reports/a.md"])("check_posts.py"))

    def test_code_or_an_empty_change_runs_everything(self):
        for changed in (["platform/ci/check_posts.py"], ["docs/reports/a.md", ".github/workflows/x.yml"],
                        ["pyproject.toml"], ["portfolio/ledger/thing.py"],
                        ["portfolio/router/requirements.txt"], ["platform/ci/unwired_reads.json"],
                        [], None):
            self.assertIsNone(self.sel(changed), changed)

    def test_portfolio_data_is_not_code(self):
        self.assertFalse(ur.is_code("portfolio/ledger/asks.yaml"))
        self.assertFalse(ur.is_code("ventures/x/calc.mjs"))  # read by items, so in the map
        self.assertTrue(ur.is_code("portfolio/work/workctl.py"))

    def test_no_map_runs_everything(self):
        self.assertIsNone(ur.selector(["docs/reports/a.md"], data={}, root=self.root))


class RunEverything(unittest.TestCase):
    def test_dropped_items_are_named_and_not_run(self):
        ran = []

        def fake(path, *a):
            ran.append(Path(path).name)
            return Path(path).name, 0, "ok"
        needed = lambda name: name != "check_b.py"  # noqa: E731
        with mock.patch.object(unwired_checks, "unwired", return_value=[Path("/x/check_a.py"), Path("/x/check_b.py")]), \
                mock.patch.object(unwired_checks.main_health, "run", side_effect=fake), \
                mock.patch.object(unwired_checks.main_health, "label", side_effect=lambda p: Path(p).name), \
                mock.patch.object(ur, "selector", return_value=needed):
            not_run = []
            results = unwired_checks.run_everything(checks_only=True, changed=["docs/reports/a.md"],
                                                    not_run=not_run)
        self.assertEqual([r[0] for r in results], ["check_a.py"])
        self.assertEqual(ran, ["check_a.py"])
        self.assertEqual(not_run, ["check_b.py"])


class TheMap(unittest.TestCase):
    def test_the_committed_map_is_well_formed(self):
        data = ur.load()
        self.assertIsNotNone(data, "platform/ci/unwired_reads.json is missing or not JSON")
        self.assertTrue(data["items"])
        for name, e in data["items"].items():
            self.assertTrue(e["reads"], name)
            self.assertEqual(len(e["sha256"] or ""), 64, name)
        json.dumps(data)


if __name__ == "__main__":
    unittest.main()
