"""A check pointed at nothing must not pass.

Every platform/ci/check_*.py that takes --root is run against an empty
directory. Exit 0 there means a wrong --root, or a ROOT constant left behind
when the tree moves, turns the check green forever while it scans nothing
(red team 2026-11-17: check_local_assets.py with ROOT = parents[3] printed
"0 pages, 0 missing" and passed, and its own test accepted that).

empty_root_baseline.txt lists the checks that did this when the guard landed.
It is a ratchet: a new check must refuse an empty root (exit nonzero, as
check_local_assets.py now does with exit 2), and a listed check that is fixed
must leave the list.
"""
import subprocess
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASELINE = HERE / "empty_root_baseline.txt"


def checks_with_root():
    return sorted(p.name for p in HERE.glob("check_*.py") if '"--root"' in p.read_text(encoding="utf8"))


def baseline():
    return {l.strip() for l in BASELINE.read_text(encoding="utf8").splitlines() if l.strip() and not l.startswith("#")}


def exit_on_empty(name, root):
    try:
        return subprocess.run([sys.executable, str(HERE / name), "--root", root], cwd=HERE,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60).returncode
    except subprocess.TimeoutExpired:
        return "timeout"


class EmptyRoot(unittest.TestCase):
    def test_checks_refuse_an_empty_root(self):
        names = checks_with_root()
        self.assertGreater(len(names), 20, "the glob found too few checks: did platform/ci move?")
        with tempfile.TemporaryDirectory() as d, ThreadPoolExecutor(8) as pool:
            codes = dict(zip(names, pool.map(lambda n: exit_on_empty(n, d), names)))
            leftover = list(Path(d).iterdir())
        self.assertEqual(leftover, [], "a check wrote into the --root it was given")
        listed = baseline()
        new = [n for n, c in codes.items() if c == 0 and n not in listed]
        fixed = [n for n, c in codes.items() if c != 0 and n in listed]
        gone = sorted(listed - set(names))
        self.assertEqual(new, [], "these checks pass on an empty --root: when they find no files, "
                         "print why and exit nonzero (see check_local_assets.py)")
        self.assertEqual(fixed, [], "these now refuse an empty root: delete them from empty_root_baseline.txt")
        self.assertEqual(gone, [], "listed in empty_root_baseline.txt but no longer a check with --root")


if __name__ == "__main__":
    unittest.main()
