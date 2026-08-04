#!/usr/bin/env python3
"""
Duplicate top-level definition detector.

On 2026-08-04, reconciling two integration branches found that
`portfolio/router/router.py` carried a **124-line duplicate tail** — a second
`main`, `find_repo_root`, `load_ventures`, `load_ledger`, `calculate_score` and
`route_portfolio`, all sitting after `if __name__ == "__main__": main()`.

It passed everything. The file parses, it imports, and 1139 pytest tests were
green, because Python binds the later definition and the later copy happened to
be the good one — so the *first* `main` and the first `find_repo_root` were dead
code that read exactly like the live ones. The two copies were not identical:
the queue row's `funded` field was present in one and missing from the other.

The `__main__` guard sitting between the copies is what makes this a live
divergence rather than merely dead code. Python executes top to bottom, so at
the guard only the *first* copy exists: running the file as a script calls the
first `main`, while importing it — pytest, `scripts/test-ci.sh` — rebinds every
name to the second. The tests exercised one implementation and the script ran
another. Nothing would have surfaced it until someone edited the first copy and
watched the tests ignore the change.

Where this class comes from: `git merge-base --all` returns eleven bases between
this repository's integration branches, so git builds a virtual base by
recursive merge. A file git cannot line up against that virtual base gets both
sides concatenated inside one conflict region, and `git checkout --theirs` then
hands over whatever that branch committed — which may already carry the doubling
from its own earlier criss-cross merge. Nothing about the resolution looks
wrong, and no existing control asks this question:

  * `gate-substance.test.mjs` asks whether a gate can fail.
  * `gate-wiring.test.mjs` asks whether a command is registered twice.
  * `branch_collisions.py` asks whether two branches built the same *file*.
  * Every test suite in the repository asks whether the code works — and for
    this defect the answer is yes, by construction, because the surviving
    binding is usually the good one.

What is checked, and why only this much:

  * **Python** — `def`, `async def` and `class` names repeated in one module
    body or one class body, parsed with `ast` so the answer is exact.
    Definitions nested inside `if`/`try` are not top-level body items and are
    therefore never reported, which is what makes the ordinary
    `try: import x / except ImportError: def x()` pattern safe. `@overload` and
    property accessors (`@name.setter`, `@name.getter`, `@name.deleter`) name
    one callable deliberately more than once and are excluded.
  * **JavaScript and TypeScript** — column-0 `function` implementations and
    `var` declarations only. Those two are the redeclarations JavaScript accepts
    *silently*, binding the last one. A repeated top-level `const`, `let` or
    `class` is a hard SyntaxError that any build or import already refuses, so
    reporting it here would add false-positive surface for no detection. TS
    overload *signatures* — a `function` line with no body — are the legitimate
    form of the same name twice and are skipped.

`.ts` and `.tsx` are **not** exempted on the grounds that `tsc` reports TS2393.
It does; that was verified. But not every venture in this repository runs a
typecheck gate, and a rule that exempts a whole file extension is a region where
the property is merely assumed to hold. One rule, applied everywhere, costs
nothing here because the tree has no overload signatures at all.

There is no exception register and no budget. A module defining the same name
twice is not a trade-off with a legitimate other side; the remedy is to delete
one copy or rename it, never to record permission for it. A control with a
budget is a control that gets tuned instead of obeyed.

Fails closed. An unparseable Python file, an unreadable source file, or a file
list that comes back empty are all reported as failures rather than as zero
duplicates — the shape of this defect is precisely that everything looks fine.

Usage:
    python3 scripts/ci/duplicate_definitions.py            # audit, exit 1 on any finding
    python3 scripts/ci/duplicate_definitions.py --report   # always exit 0
    python3 scripts/ci/duplicate_definitions.py --json
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import re
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Sequence

PYTHON_SUFFIXES = (".py",)
SCRIPT_SUFFIXES = (".js", ".mjs", ".cjs", ".ts", ".tsx")

# Decorators under which one name is deliberately defined more than once.
# Bare names are matched exactly; the accessor forms are matched by suffix, so
# `@thing.setter` counts and `@thing.setter_factory()` does not.
OVERLOAD_DECORATORS = frozenset({"overload", "typing.overload", "t.overload"})
ACCESSOR_SUFFIXES = (".setter", ".getter", ".deleter")

# A column-0 `function` implementation or `var`. Anchored at column 0 on
# purpose: an indented declaration is inside some other scope, where shadowing
# is ordinary and usually intentional.
JS_DECL = re.compile(
    # `declare function` is deliberately absent. An ambient declaration has no
    # body, and repeating one is how TypeScript writes overloads — so ambient
    # files need no exclusion of their own, which is why there is none.
    r"^(?:export\s+(?:default\s+)?)?(?:async\s+)?"
    r"(?:function(?P<generator>\s*\*)?\s+(?P<fn>[A-Za-z_$][\w$]*)"
    r"|var\s+(?P<var>[A-Za-z_$][\w$]*))"
)


class DuplicateDefinitionError(Exception):
    """A failure that must not be reported as a pass."""


@dataclass
class Duplicate:
    path: str
    scope: str
    name: str
    lines: List[int] = field(default_factory=list)

    @property
    def copies(self) -> int:
        return len(self.lines)

    def describe(self) -> str:
        where = ", ".join(f"line {n}" for n in self.lines)
        return f"{self.path}: {self.scope} defines {self.name!r} {self.copies}x ({where})"


def _git(args: Sequence[str], repo_root: Path) -> str:
    env = dict(os.environ)
    env["GIT_CONFIG_GLOBAL"] = "/dev/null"
    env["GIT_CONFIG_SYSTEM"] = "/dev/null"
    result = subprocess.run(
        ["git", *args], cwd=str(repo_root), capture_output=True, text=True, env=env
    )
    if result.returncode != 0:
        raise DuplicateDefinitionError(
            f"git {' '.join(args)} failed ({result.returncode}): {result.stderr.strip()}"
        )
    return result.stdout


def source_files(repo_root: Path) -> List[Path]:
    """Tracked Python and JavaScript/TypeScript sources, as absolute paths.

    Uses `git ls-files` rather than a directory walk so that ignored trees —
    `node_modules`, `.next`, build output — are excluded by the repository's own
    definition of what it contains, not by a list of directory names kept in
    step by hand.
    """
    listed = _git(["ls-files", "-z", "--", *(f"*{s}" for s in PYTHON_SUFFIXES + SCRIPT_SUFFIXES)], repo_root)
    files = []
    for rel in listed.split("\0"):
        if not rel:
            continue
        if "node_modules/" in rel:
            continue
        path = repo_root / rel
        if not path.is_file():
            # Tracked but absent: a partial checkout or a dirty tree mid-rebase.
            continue
        files.append(path)
    if not files:
        raise DuplicateDefinitionError(
            f"no tracked source files found under {repo_root}. Refusing to report zero duplicates."
        )
    return sorted(files)


def _is_deliberate_repeat(node: ast.AST) -> bool:
    for decorator in getattr(node, "decorator_list", []):
        text = ast.unparse(decorator)
        if text in OVERLOAD_DECORATORS or text.endswith(ACCESSOR_SUFFIXES):
            return True
    return False


def _python_scopes(tree: ast.Module):
    """Yield (scope label, body) for the module body and every class body."""
    yield "module", tree.body
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            yield f"class {node.name}", node.body


def scan_python(rel_path: str, text: str) -> List[Duplicate]:
    try:
        tree = ast.parse(text)
    except SyntaxError as exc:
        raise DuplicateDefinitionError(
            f"{rel_path} does not parse ({exc}). Refusing to report zero duplicates for it."
        ) from exc

    found: List[Duplicate] = []
    for scope, body in _python_scopes(tree):
        seen: Dict[str, List[int]] = {}
        for node in body:
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                continue
            if _is_deliberate_repeat(node):
                continue
            seen.setdefault(node.name, []).append(node.lineno)
        for name, lines in sorted(seen.items()):
            if len(lines) > 1:
                found.append(Duplicate(rel_path, scope, name, lines))
    return found


def strip_js_noise(text: str) -> str:
    """Blank out comments, string and template literals, and regex literals.

    Line structure is preserved — every removed character becomes a space and
    every newline survives — so line numbers in the result still address the
    original file. Without this, a `function` at column 0 inside a block comment
    or a template literal reads as a declaration.
    """
    out = list(text)
    i = 0
    n = len(text)
    # Tracks whether the next `/` can begin a regex literal. After a value
    # (identifier, literal, `)` or `]`) a slash is division; after an operator,
    # a keyword or the start of input it is a regex.
    prev_significant = ""
    template_stack: List[int] = []  # brace depth at each open `${`
    brace_depth = 0

    def blank(start: int, end: int) -> None:
        for k in range(start, min(end, n)):
            if out[k] != "\n":
                out[k] = " "

    while i < n:
        ch = text[i]
        nxt = text[i + 1] if i + 1 < n else ""

        if ch == "/" and nxt == "/":
            j = text.find("\n", i)
            j = n if j == -1 else j
            blank(i, j)
            i = j
            continue
        if ch == "/" and nxt == "*":
            j = text.find("*/", i + 2)
            j = n if j == -1 else j + 2
            blank(i, j)
            i = j
            continue
        if ch in "\"'":
            j = i + 1
            while j < n and text[j] != ch:
                if text[j] == "\\":
                    j += 1
                elif text[j] == "\n":
                    break  # unterminated; do not swallow the rest of the file
                j += 1
            j = min(j + 1, n)
            blank(i + 1, j - 1)
            i = j
            prev_significant = "x"
            continue
        if ch == "`":
            template_stack.append(brace_depth)
            j = i + 1
            while j < n:
                if text[j] == "\\":
                    j += 2
                    continue
                if text[j] == "`":
                    break
                if text[j] == "$" and j + 1 < n and text[j + 1] == "{":
                    break
                j += 1
            blank(i + 1, j)
            if j < n and text[j] == "$":
                i = j + 2
                brace_depth += 1
            else:
                template_stack.pop()
                i = min(j + 1, n)
                prev_significant = "x"
            continue
        if ch == "}" and template_stack and brace_depth == template_stack[-1] + 1:
            # Closing a `${ ... }` hole: resume scanning the template body.
            brace_depth -= 1
            j = i + 1
            while j < n:
                if text[j] == "\\":
                    j += 2
                    continue
                if text[j] == "`":
                    break
                if text[j] == "$" and j + 1 < n and text[j + 1] == "{":
                    break
                j += 1
            blank(i + 1, j)
            if j < n and text[j] == "$":
                i = j + 2
                brace_depth += 1
            else:
                template_stack.pop()
                i = min(j + 1, n)
                prev_significant = "x"
            continue
        if ch == "/" and prev_significant not in ("x", ")", "]"):
            j = i + 1
            in_class = False
            closed = False
            while j < n:
                c = text[j]
                if c == "\\":
                    j += 2
                    continue
                if c == "\n":
                    break  # not a regex after all
                if c == "[":
                    in_class = True
                elif c == "]":
                    in_class = False
                elif c == "/" and not in_class:
                    closed = True
                    break
                j += 1
            if closed:
                blank(i + 1, j)
                i = j + 1
                prev_significant = "x"
                continue

        if ch == "{":
            brace_depth += 1
        elif ch == "}":
            brace_depth = max(0, brace_depth - 1)

        if not ch.isspace():
            prev_significant = "x" if (ch.isalnum() or ch in "_$") else ch
        i += 1

    return "".join(out)


def scan_script(rel_path: str, text: str) -> List[Duplicate]:
    cleaned = strip_js_noise(text)
    seen: Dict[str, List[int]] = {}
    for lineno, line in enumerate(cleaned.splitlines(), 1):
        match = JS_DECL.match(line)
        if not match:
            continue
        name = match.group("fn") or match.group("var")
        if match.group("fn") and line.rstrip().endswith(";"):
            # A TypeScript overload signature — a declaration with no body.
            # Repeating it is how overloads are written.
            continue
        seen.setdefault(name, []).append(lineno)
    return [
        Duplicate(rel_path, "module", name, lines)
        for name, lines in sorted(seen.items())
        if len(lines) > 1
    ]


def find_duplicates(repo_root: Path) -> List[Duplicate]:
    """Every module in the repository that defines one name more than once."""
    found: List[Duplicate] = []
    for path in source_files(repo_root):
        rel = path.relative_to(repo_root).as_posix()
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            raise DuplicateDefinitionError(
                f"{rel} could not be read ({exc}). Refusing to report zero duplicates for it."
            ) from exc
        if path.suffix in PYTHON_SUFFIXES:
            found.extend(scan_python(rel, text))
        else:
            found.extend(scan_script(rel, text))
    return sorted(found, key=lambda d: (-d.copies, d.path, d.scope, d.name))


def format_report(duplicates: Sequence[Duplicate], scanned: int) -> str:
    lines = [
        "=== Duplicate top-level definitions ===",
        f"Files scanned:       {scanned}",
        f"Duplicated names:    {len(duplicates)} (budget 0)",
    ]
    if not duplicates:
        lines += [
            "",
            "PASS: no module or class body defines the same name twice.",
        ]
        return "\n".join(lines)

    lines.append("")
    for duplicate in duplicates:
        lines.append(f"  {duplicate.describe()}")
    lines += [
        "",
        "Each of these binds the last definition and silently discards the earlier ones.",
        "The file parses, imports, and its tests pass — that is the shape of this defect,",
        "not evidence against it. Usually a criss-cross merge concatenated two versions of",
        "the same module: compare the copies before deleting either, because they diverge",
        "(the case this control was written for differed by one field in a returned dict).",
        "",
        f"FAIL: {len(duplicates)} duplicated definitions. There is no budget and no exception",
        "register for this; remove or rename one copy.",
    ]
    return "\n".join(lines)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Fail when a module or class body defines the same name twice."
    )
    parser.add_argument("--report", action="store_true", help="always exit 0")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    parser.add_argument("--repo-root", default=None)
    args = parser.parse_args(argv)

    repo_root = Path(args.repo_root) if args.repo_root else Path(__file__).resolve().parents[2]

    try:
        scanned = len(source_files(repo_root))
        duplicates = find_duplicates(repo_root)
    except DuplicateDefinitionError as exc:
        if args.json:
            print(json.dumps({"ok": False, "status": "not-measurable", "error": str(exc)}, indent=2))
        else:
            print(f"FAIL: {exc}", file=sys.stderr)
        return 0 if args.report else 1

    if args.json:
        print(
            json.dumps(
                {
                    "ok": not duplicates,
                    "status": "fail" if duplicates else "pass",
                    "scanned": scanned,
                    "duplicates": [asdict(d) | {"copies": d.copies} for d in duplicates],
                },
                indent=2,
            )
        )
    else:
        print(format_report(duplicates, scanned))

    if args.report:
        return 0
    return 1 if duplicates else 0


if __name__ == "__main__":
    sys.exit(main())
