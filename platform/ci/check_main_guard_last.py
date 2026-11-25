#!/usr/bin/env python3
"""Fail when a Python test file defines tests after its `if __name__ == "__main__":` block.

`python3 test_x.py` runs `unittest.main()` at the point the guard sits, so any
TestCase class or test function defined below it never runs, and the file still
prints OK. `python -m unittest` and pytest import the whole module first, so CI
never noticed: on 2026-11-22 a red-team run found 45 tracked test files like
this (platform/ci/test_main_health.py ran 7 of its 14 tests as a script) and
moved each guard to the end.

    python3 platform/ci/check_main_guard_last.py            # every tracked (and, locally, untracked) test file
    python3 platform/ci/check_main_guard_last.py a.py b.py  # just these
"""
import ast
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from repo_files import ls_files  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
# Control plane (.github/CODEOWNERS): fixed in its own PR, owner approval. Listed
# so this check starts green; the test fails once the file is clean, so the entry
# cannot go stale.
KNOWN: set[str] = set()


def is_main_guard(node):
    return (isinstance(node, ast.If) and isinstance(node.test, ast.Compare)
            and isinstance(node.test.left, ast.Name) and node.test.left.id == "__name__")


def is_test_def(node):
    if isinstance(node, ast.ClassDef):
        return True
    return isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith("test")


def late_tests(source):
    """[(guard line, name, line)] for each class or test function after the first guard."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return []
    guard, out = None, []
    for node in tree.body:
        if is_main_guard(node):
            guard = guard or node.lineno
        elif guard and is_test_def(node):
            out.append((guard, node.name, node.lineno))
    return out


def tracked_tests(root=ROOT):
    return ls_files(root, "*test_*.py", "*_test.py")


def problems(paths, root=ROOT):
    found = {}
    for rel in paths:
        path = Path(root) / rel
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        if late := late_tests(text):
            found[str(rel)] = late
    return found


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    found = problems(argv or tracked_tests())
    bad = {p: v for p, v in found.items() if p not in KNOWN}
    for path, late in sorted(bad.items()):
        guard = late[0][0]
        names = ", ".join(f"{n} (line {ln})" for _, n, ln in late)
        print(f"{path}:{guard}: `if __name__ == \"__main__\"` comes before {names}; "
              "move the guard to the end of the file")
    print(f"{len(bad)} test file(s) define tests after their __main__ guard")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
