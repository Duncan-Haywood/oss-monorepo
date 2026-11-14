#!/usr/bin/env python3
"""Fail if a venture's usage.mjs reads the `localStorage` global unguarded.

Merely *reading* the `localStorage` global throws `SecurityError` when the
visitor blocks site data (Chrome's "block all cookies", Safari with cookies
blocked, some embedded webviews). That includes `typeof localStorage`. In
`usage.mjs` the read sits at the top of `record()`, so the click handler of a
calculator threw after rendering its result; in `setUsageOptOut()` it threw
before the opt-out was saved. Reads must be inside `try`, or go through the
`noStorage()` helper, which is the one place that guards the bare read.

Files that take storage as a parameter used to be exempt: their default
(`storage = globalThis.localStorage`) and the page's `recordUsage(localStorage,
...)` both read the global before any try, so with site data blocked the
counter threw inside the calculator's change handler, before it re-rendered
(red team 2026-11-14: 247 modules, 292 pages). They now default to an exported
`usageStorage()` that guards the read, the pages pass `usageStorage()`, and
both shapes are checked here: no default parameter may read the global (it is
outside the try), and no page may pass a bare `localStorage` to a function it
imports from `./usage.mjs`.

The text check cannot see a wrong answer, so `main` also runs
`usage_contract.mjs`, which imports each counter and drives it against a fake
store (valid JSON of the wrong shape, Do Not Track, Global Privacy Control,
opt-out, blocked and full storage). Added 2026-11-11 after a red-team campaign
flipped both shape checks in one copy and its suite stayed green.

    python3 platform/ci/check_storage_guard.py [ventures-dir]
"""
import re
import shutil
import subprocess
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


_PARSE = re.compile(r"^\s*const (\w+) = JSON\.parse\(.+\);\s*$")


def unshaped_parses(src):
    """Return 1-based lines where a parsed counter is written to with no shape check.

    `const c = JSON.parse(stored || '{}'); c[event] = ...` trusts the store to
    hold an object. Valid JSON of another shape (an array, null, a number, left
    by an older version or another script on the origin) then stops counting
    for good: an array drops named keys on stringify, and a write to null or a
    number throws into the surrounding catch on every later visit. 263 copies
    did it on 2026-11-11. Use `let`, then reset to {} when it is not a plain
    object.
    """
    lines = src.split("\n")
    bad = []
    for i, line in enumerate(lines):
        m = _PARSE.match(line)
        if not m:
            continue
        var = m.group(1)
        nxt = "\n".join(lines[i + 1:i + 5])
        writes = re.search(rf"\b{var}(\[[^\]]+\]|\.\w+)\s*=(?!=)", nxt)
        guarded = re.search(rf"typeof {var}\b|Array\.isArray\({var}\)", nxt)
        if writes and not guarded:
            bad.append(i + 1)
    return bad


_USAGE_IMPORT = re.compile(r"""import\s*\{([^}]*)\}\s*from\s*(['"])\./usage\.mjs\2""")
_SKIP_DIRS = {"node_modules", "dist", ".git"}


def bare_storage_args(src):
    """Return 1-based lines where a page passes the bare global to its usage module.

    `recordUsage(localStorage, ...)` reads the global at the call site, before
    the module's own try can help, so a visitor who blocks site data gets a
    SecurityError in the handler that called it. Pass `usageStorage()`.
    """
    m = _USAGE_IMPORT.search(src)
    if not m:
        return []
    names = [n.split(" as ")[-1].strip() for n in m.group(1).split(",")]
    names = [n for n in names if n and n != "usageStorage"]
    if not names:
        return []
    code = _strip(src)
    call = re.compile(r"\b(?:" + "|".join(map(re.escape, names)) + r")\(\s*(?:(?:window|globalThis)\.)?localStorage\b")
    return [code.count("\n", 0, c.start()) + 1 for c in call.finditer(code)]


def _pages(root):
    for path in sorted(Path(root).rglob("*")):
        if path.suffix not in (".html", ".mjs", ".js") or path.name == "usage.mjs" or ".test." in path.name:
            continue
        if _SKIP_DIRS.intersection(path.relative_to(root).parts) or not path.is_file():
            continue
        yield path


def check_tree(root):
    problems = []
    for path in sorted(Path(root).glob("*/usage.mjs")):
        src = path.read_text()
        for line in unguarded_reads(src):
            problems.append(f"{path}:{line}: bare `localStorage` read outside try (use noStorage())")
    for path in sorted(Path(root).glob("*/usage.mjs")):
        for line in unshaped_parses(path.read_text()):
            problems.append(f"{path}:{line}: stored counter written to without checking it is a plain object")
    for path in _pages(root):
        try:
            src = path.read_text()
        except (UnicodeDecodeError, OSError):
            continue
        for line in bare_storage_args(src):
            problems.append(f"{path}:{line}: bare `localStorage` passed to the usage module (pass usageStorage())")
    return problems


CONTRACT = Path(__file__).resolve().parent / "usage_contract.mjs"


def run_contract(root):
    """Run the behavioural contract under node; return (exit code, output)."""
    node = shutil.which("node")
    if not node:
        return 1, "node not found: usage_contract.mjs cannot run (install Node 22)"
    proc = subprocess.run([node, str(CONTRACT), str(root)], capture_output=True, text=True)
    return proc.returncode, (proc.stdout + proc.stderr).strip()


def main(argv):
    root = argv[1] if len(argv) > 1 else Path(__file__).resolve().parents[2] / "ventures"
    problems = check_tree(root)
    for p in problems[:50]:
        print(p)
    status = 0
    if problems:
        print(f"{len(problems)} storage problem(s)")
        status = 1
    code, out = run_contract(root)
    print(out)
    return status or (1 if code else 0)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
