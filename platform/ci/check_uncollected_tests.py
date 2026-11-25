#!/usr/bin/env python3
"""Fail on venture test functions that CI never runs.

A module-level `def test_...()` is a pytest test. `python -m unittest
discover` collects only `unittest.TestCase` methods, so in a folder CI runs
that way the function is never called and the suite still prints OK. On
2026-11-20 eleven such functions sat in six files of three ventures
(open-tennis-robots, einvoice-preflight, shed-designer), some for days, while
their runs recorded them as tests; one run noticed by reading the workflow
(run-record doc friction, 2026-11-20, test_take_straddle_count.py).

A venture's Python tests run under unittest when no workflow runs them
(run_venture_tests.py's own `unittest discover`), or when every workflow step
that runs them is a unittest step. A venture with a pytest step is left alone.
research/ is not checked: research-ci.yml runs no project's own tests yet
(process backlog P069).

    python3 platform/ci/check_uncollected_tests.py         # exit 1 if any
    python3 platform/ci/check_uncollected_tests.py --list  # every venture's runner

Fix a hit by putting the functions in a `unittest.TestCase` class (a bare
`assert` works there too), or by running the venture's tests with pytest.

It also fails on a test defined inside `if __name__ == "__main__":` in any
tracked test file of the repository:
no runner collects it. platform/ci/test_slug_dupe.py's refresh test sat
there, under `unittest.main()`, from PR #19047 until it was moved.
"""
import ast
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import repo_files  # noqa: E402
import run_venture_tests as rvt  # noqa: E402


def bare_tests(path):
    """Names of the module-level test functions in a test file."""
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except (SyntaxError, UnicodeDecodeError):
        return []
    return [n.name for n in tree.body
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
            and n.name.startswith("test")]


def guarded_tests(path):
    """Names of test functions nested in the module's `if __name__ == "__main__":` block:
    neither pytest nor unittest ever collects them. (A test under another module-level
    `if`, such as `if HAVE_NUMPY:`, runs on import and is collected.)"""
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except (SyntaxError, UnicodeDecodeError, OSError):
        return []
    return [x.name for n in tree.body if isinstance(n, ast.If) and "__name__" in ast.unparse(n.test)
            for x in ast.walk(n)
            if isinstance(x, (ast.FunctionDef, ast.AsyncFunctionDef)) and x.name.startswith("test")]


def guarded_hits(root=rvt.ROOT):
    try:
        files = repo_files.ls_files(root, "*test_*.py", "*_test.py")
    except (subprocess.CalledProcessError, OSError):
        return []
    return [(root / f, names) for f in files if (names := guarded_tests(root / f))]


def test_files(slug):
    return sorted({*rvt._files(slug, "test_*.py"), *rvt._files(slug, "*_test.py")})


def runner(slug):
    """'pytest' or 'unittest': what CI runs this venture's Python tests with."""
    cmds = [cmd for _, cmd in rvt.python_run_elsewhere(slug)]
    return "pytest" if any("pytest" in c for c in cmds) else "unittest"


def hits(root=rvt.VENTURES):
    out = []
    for venture in sorted(p for p in root.iterdir() if p.is_dir()):
        found = [(f, names) for f in test_files(venture.name) if (names := bare_tests(f))]
        if found and runner(venture.name) == "unittest":
            out += found
    return out


def main(argv):
    if "--list" in argv:
        for venture in sorted(p for p in rvt.VENTURES.iterdir() if p.is_dir()):
            if test_files(venture.name):
                print(f"{runner(venture.name):8} {venture.name}")
        return 0
    found = hits()
    for path, names in found:
        print(f"{path.relative_to(rvt.ROOT)}: {', '.join(names)} never run "
              "(CI runs this venture with `unittest discover`; put them in a "
              "unittest.TestCase class)")
    guarded = guarded_hits()
    for path, names in guarded:
        print(f"{path.relative_to(rvt.ROOT)}: {', '.join(names)} never run "
              "(defined inside `if __name__ == \"__main__\":`; move them "
              "into the TestCase class)")
    found += guarded
    total = sum(len(n) for _, n in found)
    print(f"{total} uncollected test function(s) in {len(found)} file(s)")
    return 1 if found else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
