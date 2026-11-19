import io
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_cli_missing_path as c  # noqa: E402

GOOD = '''import argparse, sys
from pathlib import Path
p = argparse.ArgumentParser()
p.add_argument("path", nargs="?", default=".")
p.add_argument("--fail-on-risk", action="store_true")
a = p.parse_args()
if not Path(a.path).exists():
    sys.exit("path not found")
'''
BAD = '''import argparse
p = argparse.ArgumentParser()
p.add_argument("path", nargs="?", default=".")
p.add_argument("--fail-on-risk", action="store_true")
p.parse_args()
print("No Dockerfile found")
'''


def tree(files):
    d = tempfile.TemporaryDirectory()
    for rel, text in files.items():
        f = Path(d.name) / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(text, encoding="utf-8")
    return d


class MissingPath(unittest.TestCase):
    def run_main(self, root):
        with redirect_stdout(io.StringIO()) as buf:
            code = c.main(["--root", root])
        return code, buf.getvalue()

    def test_a_cli_that_passes_a_missing_path_fails_the_check(self):
        with tree({"ventures/a/check.py": GOOD, "ventures/b/check.py": BAD}) as d:
            code, out = self.run_main(d)
            self.assertEqual(code, 1)
            self.assertIn("ventures/b/check.py", out)
            self.assertNotIn("ventures/a/check.py:", out)

    def test_all_good_passes(self):
        with tree({"ventures/a/check.py": GOOD}) as d:
            self.assertEqual(self.run_main(d)[0], 0)

    def test_tests_and_flagless_scripts_are_not_gates(self):
        no_flag = BAD.replace('p.add_argument("--fail-on-risk", action="store_true")\n', "")
        with tree({"ventures/a/test_check.py": BAD, "ventures/a/tests/x.py": BAD,
                   "ventures/a/tool.py": no_flag}) as d:
            self.assertEqual(c.gate_clis(Path(d)), [])

    def test_the_real_tree_has_gates_and_none_passes_a_missing_path(self):
        clis = c.gate_clis()
        self.assertGreater(len(clis), 20)
        self.assertEqual(self.run_main(str(c.ROOT))[0], 0)


if __name__ == "__main__":
    unittest.main()
