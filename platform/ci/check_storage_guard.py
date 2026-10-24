#!/usr/bin/env python3
"""Fail if a venture's usage.mjs reads the `localStorage` global unguarded.

Merely *reading* the `localStorage` global throws `SecurityError` when the
visitor blocks site data (Chrome's "block all cookies", Safari with cookies
blocked, some embedded webviews). That includes `typeof localStorage`. In
`usage.mjs` the read sits at the top of `record()`, so the click handler of a
calculator threw after rendering its result; in `setUsageOptOut()` it threw
before the opt-out was saved. Reads must be inside `try`, or go through the
`noStorage()` helper, which is the one place that guards the bare read.

Files that take storage as a parameter (`storage = globalThis.localStorage`)
are a different shape: the page passes `localStorage` in, so the bare read is
in `index.html`. 18 ventures use it and are out of scope here.

    python3 platform/ci/check_storage_guard.py [ventures-dir]
"""
import re
import sys
from pathlib import Path

READ = re.compile(r"\blocalStorage\b")
_IDENT = re.compile(r"[\w$]")


def _strip(src):
    """Blank out comments and string literals, keeping offsets and newlines."""
    out = re.sub(r"//[^\n]*", lambda m: " " * len(m.group()), src)
    out = re.sub(r"/\*.*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group()), out, flags=re.S)
    return re.sub(r'"(?:\\.|[^"\\\n])*"|\'(?:\\.|[^\'\\\n])*\'',
                  lambda m: " " * len(m.group()), out)


def unguarded_reads(src):
    """Return 1-based line numbers of `localStorage` reads outside any try block."""
    code = _strip(src)
    stack = []  # one entry per open brace: True when it is a try block
    pending_try = False
    bad = []
    i = 0
    while i < len(code):
        ch = code[i]
        if ch == "{":
            stack.append(pending_try)
            pending_try = False
        elif ch == "}":
            if stack:
                stack.pop()
        elif code.startswith("try", i) and not (_IDENT.match(code[i - 1:i]) or _IDENT.match(code[i + 3:i + 4])):
            pending_try = True
        elif code.startswith("localStorage", i) and READ.match(code, i):
            if not any(stack):
                bad.append(code.count("\n", 0, i) + 1)
        i += 1
    return bad


def check_tree(root):
    problems = []
    for path in sorted(Path(root).glob("*/usage.mjs")):
        src = path.read_text()
        if "storage = globalThis.localStorage" in src:
            continue
        for line in unguarded_reads(src):
            problems.append(f"{path}:{line}: bare `localStorage` read outside try (use noStorage())")
    return problems


def main(argv):
    root = argv[1] if len(argv) > 1 else Path(__file__).resolve().parents[2] / "ventures"
    problems = check_tree(root)
    for p in problems[:50]:
        print(p)
    if problems:
        print(f"{len(problems)} unguarded read(s)")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
