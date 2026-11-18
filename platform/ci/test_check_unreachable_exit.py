import tempfile
import unittest
from pathlib import Path

import check_unreachable_exit as cue

PASSING = """// Usage: node check.mjs <site-url>
console.error('Usage: node check.mjs <site-url> [--json]');
process.exit(0);
"""
FAILING = PASSING.replace("process.exit(0)", "process.exit(1)")
HOSTNAME = """console.error('Usage: node check.mjs <hostname>'); process.exit(0);"""


def tree(files):
    tmp = Path(tempfile.mkdtemp())
    for rel, text in files.items():
        path = tmp / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    return tmp


class UnreachableExit(unittest.TestCase):
    def test_flags_a_cli_that_exits_0_on_an_unreachable_target(self):
        root = tree({"ventures/a/check.mjs": PASSING, "ventures/b/cli/check.mjs": FAILING})
        clis, bad = cue.failures(root)
        self.assertEqual([v for v, _ in clis], ["a", "b"])
        self.assertEqual(len(bad), 1)
        self.assertIn("ventures/a/check.mjs: exit 0", bad[0])
        self.assertEqual(cue.main(["--root", str(root)]), 1)

    def test_passes_when_every_cli_exits_nonzero(self):
        root = tree({"ventures/b/cli/check.mjs": FAILING,
                     "ventures/c/check.mjs": FAILING.replace("exit(1)", "exit(2)")})
        self.assertEqual(cue.main(["--root", str(root)]), 0)

    def test_skips_hostname_clis_and_non_check_files(self):
        root = tree({"ventures/d/check.mjs": HOSTNAME, "ventures/e/other.mjs": PASSING})
        self.assertEqual(cue.url_clis(root), [])

    def test_a_hung_cli_fails(self):
        root = tree({"ventures/f/check.mjs": "// Usage: node check.mjs <url>\nsetInterval(() => {}, 1000);\n"})
        cli = root / "ventures/f/check.mjs"
        self.assertIsNone(cue.exit_code(cli, timeout=1))


if __name__ == "__main__":
    unittest.main()
