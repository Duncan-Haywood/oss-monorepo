#!/usr/bin/env python3
"""Fail when one Python file defines the same top-level name twice.

    python3 platform/ci/check_duplicate_symbols.py

Python rebinds silently. Two `def check_thing(...)` in one module, or two
`CONSTANT = ...`, are not an error at import time -- the later one wins and the
earlier one becomes dead code that still *reads* as live. Nothing complains:
not the interpreter, not a linter this repo runs, and not the test suite, since
tests written for the shadowed definition now exercise the surviving one and
pass.

## What this is here to catch

On 2026-08-26 two sessions independently wrote the same invariant into
`publish_surface.py` -- `check_single_pages_deployer` (#1735) and
`check_one_origin_per_gate` (#1776) -- and both defined a module-level
`PAGES_DEPLOY_ACTIONS`. The two PRs never touched the same lines, so git merged
them with no conflict to resolve and nothing to review. The later constant
rebound the earlier one, so #1776's function silently matched three actions
while its own docstring and its own tests said one.

Every check in the repo was green: both functions had tests, and each passed,
because each was tested against itself. `--check` compared the workflow surface
to its snapshot and saw nothing wrong. The only way to notice was to read the
merged file.

That is the shape this catches, and it is a *concurrency* defect rather than a
coding mistake: neither author wrote a duplicate. The merge did. It belongs with
`check_conflict_markers.py` -- both exist because a fast-moving `main` produces
failures that no test suite is positioned to see.

## Why Python only

JavaScript already refuses this. A second top-level `const X` in an ES module is
a parse-time `SyntaxError: Identifier 'X' has already been declared`, so
`platform/pages/build.mjs` -- the other file this fleet collides on -- cannot
reach `main` carrying one. Python is the language in this repo where the failure
is silent, so it is the only one worth a check.

## What counts as a duplicate

Deliberately narrow, so that a red result is always a real defect:

  - top-level `def` / `async def` / `class` of a name already defined
  - top-level assignment to an UPPER_CASE name already assigned

Nested definitions are not considered at all. A `def` inside `if
TYPE_CHECKING:`, or a fallback in `except ImportError:`, is a deliberate
alternative binding rather than an accident, and flagging it would make the
check something people learn to skip. Lower-case module-level variables are also
left alone: re-assigning one is ordinary Python.
"""

from __future__ import annotations

import ast
import subprocess
import sys
import warnings
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


def tracked_python_files(repo: Path = REPO) -> list[Path]:
    """Every tracked `.py` file, from git rather than a directory walk.

    A walk would descend into `.venv`, `node_modules` and build output, where a
    vendored module's duplicate symbols are not ours to fix.
    """
    result = subprocess.run(
        ["git", "ls-files", "-z", "*.py"],
        cwd=repo, capture_output=True, text=True, check=True,
    )
    return [repo / name for name in result.stdout.split("\0") if name]


def duplicate_symbols(source: str, filename: str = "<unknown>") -> dict[str, list[int]]:
    """`{name: [line, line, ...]}` for every top-level name bound more than once."""
    # Parsing someone else's module can emit SyntaxWarning/DeprecationWarning
    # (an invalid escape sequence, say). Those are real, but they are not this
    # check's finding to report -- surfacing them here would attribute another
    # file's lint to a duplicate-symbol failure and train people to skim past
    # both. Only the tree shape is wanted.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        tree = ast.parse(source, filename=filename)
    bindings: dict[str, list[int]] = defaultdict(list)

    for node in tree.body:  # module level only -- see the module docstring
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            bindings[node.name].append(node.lineno)
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and _is_constant_name(target.id):
                    bindings[target.id].append(node.lineno)
        elif isinstance(node, ast.AnnAssign):
            # `NAMES: tuple[str, ...] = (...)` binds only when it has a value.
            if node.value is not None and isinstance(node.target, ast.Name):
                if _is_constant_name(node.target.id):
                    bindings[node.target.id].append(node.lineno)

    return {name: lines for name, lines in bindings.items() if len(lines) > 1}


def _is_constant_name(name: str) -> bool:
    """UPPER_CASE, by the convention that marks a module constant.

    `_PRIVATE_CONSTANT` counts; a single underscore does not make it a variable.
    """
    stripped = name.lstrip("_")
    return bool(stripped) and stripped.upper() == stripped and any(c.isalpha() for c in stripped)


def survey(files: list[Path]) -> list[str]:
    """One human-readable line per duplicated name, sorted by file."""
    problems = []
    for path in sorted(files):
        try:
            source = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            problems.append(f"{_rel(path)}: could not be read, so its symbols are unknown -- {exc}")
            continue
        try:
            duplicates = duplicate_symbols(source, _rel(path))
        except SyntaxError as exc:
            # An unparseable file is its own problem, and `validate` will say so
            # more usefully than this check can. Do not double-report it.
            del exc
            continue
        for name, lines in sorted(duplicates.items()):
            first, *rest = lines
            problems.append(
                f"{_rel(path)}: `{name}` is defined at line {first} and again at "
                f"{', '.join(str(n) for n in rest)}. Python keeps the last one, so the "
                f"earlier definition is dead code that still reads as live."
            )
    return problems


def _rel(path: Path) -> str:
    try:
        return str(path.relative_to(REPO))
    except ValueError:
        return str(path)


def main() -> int:
    problems = survey(tracked_python_files())
    if not problems:
        print("No duplicate top-level symbols in any tracked Python file.")
        return 0

    print(f"{len(problems)} duplicate top-level symbol(s):\n", file=sys.stderr)
    for problem in problems:
        print(f"  - {problem}", file=sys.stderr)
    print(
        "\nUsually this is two branches adding the same thing and git merging "
        "them without a conflict, because they never touched the same lines. "
        "Keep one definition -- normally the more capable one -- and fold "
        "anything the other had (its docstring, its tests) into the survivor "
        "rather than deleting it outright.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
