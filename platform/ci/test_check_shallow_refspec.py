import subprocess
import tempfile
import unittest
from pathlib import Path

import check_shallow_refspec as c


class UnforcedTest(unittest.TestCase):
    def test_the_usage_data_line_before_the_fix_is_flagged(self):
        line = "git(['fetch', '-q', '--depth=1', 'origin', `${BRANCH}:refs/remotes/origin/${BRANCH}`]);"
        self.assertEqual(c.unforced(line), ["${BRANCH}:refs/remotes/origin/${BRANCH}"])

    def test_shell_and_python_spellings_are_flagged(self):
        self.assertEqual(c.unforced("git fetch --depth 1 origin main:refs/remotes/origin/main"),
                         ["main:refs/remotes/origin/main"])
        self.assertEqual(c.unforced('run(["git", "fetch", "--depth=40", "origin", "main:refs/ci/base"])'),
                         ["main:refs/ci/base"])

    def test_forced_unshallow_and_plain_fetches_pass(self):
        self.assertEqual(c.unforced("git(['fetch', '--depth=1', 'origin', `+${B}:refs/remotes/origin/${B}`])"), [])
        self.assertEqual(c.unforced('git fetch --depth=1 origin "+$src:refs/ci/base-main"'), [])
        self.assertEqual(c.unforced("git fetch origin main:refs/remotes/origin/main"), [])
        self.assertEqual(c.unforced("git fetch --depth=40 origin main"), [])
        self.assertEqual(c.unforced("git show origin/main:refs/x --depth"), [])

    def test_scan_skips_workflows_tests_and_other_suffixes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bad = "git fetch --depth=1 origin a:refs/remotes/origin/a\n"
            for rel in ["tool.sh", ".github/workflows/x.sh", "test_tool.py", "a.test.mjs", "notes.md"]:
                (root / rel).parent.mkdir(parents=True, exist_ok=True)
                (root / rel).write_text(bad)
            got = c.scan(root, ["tool.sh", ".github/workflows/x.sh", "test_tool.py", "a.test.mjs", "notes.md"])
            self.assertEqual(got, [("tool.sh", 1, "a:refs/remotes/origin/a")])

    def test_main_fails_on_a_bad_tree_and_the_real_tree_is_clean(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            (root / "pull.mjs").write_text("execFileSync('git', ['fetch', '--depth=1', 'origin', 'x:refs/x']);\n")
            subprocess.run(["git", "add", "pull.mjs"], cwd=root, check=True)
            self.assertEqual(c.main(root), 1)
        self.assertEqual(c.main(), 0)


if __name__ == "__main__":
    unittest.main()
