#!/usr/bin/env python3
"""Find (and fix) src-layout research projects whose tests fail a plain `pytest`.

    python3 research/_shared/src_layout.py          # list them; exit 1 if any
    python3 research/_shared/src_layout.py --fix    # add `pythonpath = src` to each

A project with its package under `src/` and tests that `import` it only collects
under pytest when something puts `src/` on the path. Without that, `pytest` in the
project directory stops with ModuleNotFoundError, and each run has to work out
`PYTHONPATH=src` for itself (two research runs on 2026-11-11 reported it; a scan that
day found 391 of 959 src-layout projects in that state, and 20 of 20 sampled failed
collection). A project passes if any of these hold:

- its pytest config sets `pythonpath` (pyproject.toml `[tool.pytest.ini_options]`,
  pytest.ini, setup.cfg `[tool:pytest]` or tox.ini `[pytest]`);
- it has a conftest.py at its root or in tests/;
- every test file that imports a `src/` package edits sys.path itself.

`--fix` adds one `pythonpath` line to the config file pytest already reads (in its
own precedence order), else appends the table to pyproject.toml, else writes a
two-line pytest.ini. programme_check.py (research CI) runs the
check, so a new project is caught in its own PR.
"""
import re
import sys
from pathlib import Path

RESEARCH = Path(__file__).resolve().parents[1]
PYPROJECT_TABLE = "[tool.pytest.ini_options]"


def src_packages(d):
    src = d / "src"
    if not src.is_dir():
        return set()
    return ({p.name for p in src.iterdir() if p.is_dir() and (p / "__init__.py").is_file()}
            | {p.stem for p in src.glob("*.py")})


def test_files(d):
    return [t for t in d.rglob("test*.py")
            if not any(part in ("node_modules", ".venv", "venv", "src") for part in t.relative_to(d).parts)]


def configured(d):
    if any((d / c).is_file() for c in ("conftest.py", "tests/conftest.py", "test/conftest.py")):
        return True
    for name in ("pyproject.toml", "pytest.ini", "tox.ini", "setup.cfg"):
        f = d / name
        if f.is_file() and re.search(r"^\s*pythonpath\s*=", f.read_text(errors="ignore"), re.M):
            return True
    return False


def needs_fix(d):
    """True when tests import a src/ package and nothing puts src/ on the path."""
    pkgs = src_packages(d)
    if not pkgs or configured(d):
        return False
    imp = re.compile(r"^\s*(?:from|import)\s+(%s)\b" % "|".join(map(re.escape, sorted(pkgs))), re.M)
    unhandled = False
    for t in test_files(d):
        s = t.read_text(errors="ignore")
        if imp.search(s) and "sys.path" not in s and "PYTHONPATH" not in s:
            unhandled = True
    return unhandled


def _insert_after_header(text, header, line):
    lines = text.splitlines(keepends=True)
    for i, l in enumerate(lines):
        if l.strip() == header:
            lines.insert(i + 1, line + "\n")
            return "".join(lines)
    return None


def fix(d):
    """Add the config to the file pytest will read; return that file.

    pytest takes the first of pytest.ini, pyproject.toml (with the table), tox.ini
    ([pytest]) and setup.cfg ([tool:pytest]), so the line goes there; with none,
    the table is appended to pyproject.toml or a new pytest.ini is written.
    """
    candidates = [("pytest.ini", "[pytest]", "pythonpath = src"),
                  ("pyproject.toml", PYPROJECT_TABLE, 'pythonpath = ["src"]'),
                  ("tox.ini", "[pytest]", "pythonpath = src"),
                  ("setup.cfg", "[tool:pytest]", "pythonpath = src")]
    for name, header, line in candidates:
        f = d / name
        if f.is_file():
            new = _insert_after_header(f.read_text(), header, line)
            if new is not None:
                f.write_text(new)
                return f
    py = d / "pyproject.toml"
    if py.is_file():
        text = py.read_text()
        py.write_text(text + ("" if text.endswith("\n") else "\n") + f'\n{PYPROJECT_TABLE}\npythonpath = ["src"]\n')
        return py
    f = d / "pytest.ini"
    f.write_text("[pytest]\npythonpath = src\n")
    return f


def projects(root=RESEARCH):
    return sorted(p for p in root.iterdir() if p.is_dir() and p.name[0] not in "_.")


def problems(root=RESEARCH):
    return [d for d in projects(root) if needs_fix(d)]


def main(argv=None, root=RESEARCH):
    argv = sys.argv[1:] if argv is None else argv
    bad = problems(root)
    if "--fix" in argv:
        for d in bad:
            print(f"fixed research/{d.name}: {fix(d).relative_to(root).as_posix()}")
        return 0
    for d in bad:
        print(f"research/{d.name}: tests import a src/ package but pytest is not told about src/;"
              " run python3 research/_shared/src_layout.py --fix")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
