#!/usr/bin/env python3
"""Report clipboard copies whose failure the page never handles.

`navigator.clipboard.writeText()` returns a promise that rejects more often
than it looks: in an iframe without `clipboard-write` permission, when the
document has lost focus, in Safari when the copy no longer runs inside the
click's user gesture, and (as a TypeError, because `navigator.clipboard` is
undefined) on plain http and in some in-app webviews. A copy button then has
to say so and leave the text where the visitor can select it by hand.

Two shapes get that wrong:

* **unhandled**: the call is not inside a `try` and has no `.catch(...)` (or
  two-argument `.then`). The rejection escapes, the "Copied" line after an
  `await` never runs, and the button looks dead with no fallback offered.
* **unawaited in try**: `try { navigator.clipboard.writeText(t); msg("Copied") }
  catch {}` neither awaits nor chains the promise, so the catch can only see
  the synchronous TypeError. When the copy is refused the page still says
  "Copied", which is a false statement to the visitor.

A call that is `return`ed hands the promise to its caller, which this text
check cannot follow, so it is counted but not reported. Added 2026-11-17
(explore run); `docs/posts/2026-11-17-a-copy-button-that-said-copied-anyway.md`
has the first sweep's numbers.

    python3 platform/ci/check_clipboard_guard.py [ventures-dir] [--all]

Exit 1 when any call is reported; `--all` also lists the returned calls.
"""
import re
import sys
from pathlib import Path

_SKIP_DIRS = {"node_modules", "dist", ".git", "build", "coverage"}
_CALL = re.compile(r"\bclipboard\s*\.\s*write(?:Text)?\s*\(")


def strip(src):
    """Blank comments and string/template literal bodies, keeping offsets.

    A small scanner rather than regexes, so a `//` inside a string or a quote
    inside a template does not swallow the rest of the file. Template `${...}`
    expressions are kept as code (one level of nesting is enough here).
    """
    out = list(src)
    i, n = 0, len(src)
    tmpl_depth = []  # brace depth at which each open `${` returns to a template

    def blank(a, b):
        for k in range(a, b):
            if out[k] != "\n":
                out[k] = " "

    depth = 0
    while i < n:
        c = src[i]
        if c == "/" and i + 1 < n and src[i + 1] == "/":
            j = src.find("\n", i)
            j = n if j < 0 else j
            blank(i, j)
            i = j
        elif c == "/" and i + 1 < n and src[i + 1] == "*":
            j = src.find("*/", i + 2)
            j = n if j < 0 else j + 2
            blank(i, j)
            i = j
        elif c in "\"'":
            j = i + 1
            while j < n and src[j] != c and src[j] != "\n":
                j += 2 if src[j] == "\\" else 1
            blank(i + 1, min(j, n))
            i = j + 1
        elif c == "`" or (c == "}" and tmpl_depth and tmpl_depth[-1] == depth):
            if c == "}":
                tmpl_depth.pop()
            j = i + 1
            while j < n and src[j] != "`":
                if src[j] == "\\":
                    j += 2
                    continue
                if src[j] == "$" and j + 1 < n and src[j + 1] == "{":
                    break
                j += 1
            blank(i + 1, min(j, n))
            if j < n and src[j] == "$":
                tmpl_depth.append(depth)
                i = j + 2
            else:
                i = j + 1
        else:
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
            i += 1
    return "".join(out)


def _close_paren(code, i):
    """Index just past the `)` matching the `(` at code[i-1]."""
    d = 1
    while i < len(code) and d:
        if code[i] in "([{":
            d += 1
        elif code[i] in ")]}":
            d -= 1
        i += 1
    return i


def _chained_handler(code, end):
    """True when `.catch(` or a two-argument `.then(` follows the call."""
    i = end
    while True:
        m = re.match(r"\s*\.\s*(then|catch|finally)\s*\(", code[i:])
        if not m:
            return False
        if m.group(1) == "catch":
            return True
        start = i + m.end()
        stop = _close_paren(code, start)
        if m.group(1) == "then" and _top_level_comma(code[start:stop - 1]):
            return True
        i = stop


def _group_handler(code, end):
    """True when the call sits in a parenthesised group that is then handled.

    `(navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject())
    .then(ok, fail)` handles both branches; walk to the group's `)` (stopping
    at a statement end) and test what follows it.
    """
    d, i = 0, end
    while i < len(code):
        ch = code[i]
        if ch in "([{":
            d += 1
        elif ch in "]}":
            if d == 0:
                return False
            d -= 1
        elif ch == ")":
            if d == 0:
                return _chained_handler(code, i + 1) or _group_handler(code, i + 1)
            d -= 1
        elif ch == ";" and d == 0:
            return False
        i += 1
    return False


def _caller_handles(code, name):
    """True when every call of `name` in this script is chained to a handler."""
    calls = [m for m in re.finditer(rf"(?<![\w$.]){re.escape(name)}\s*\(", code)
             if not re.search(r"function\s*$", code[max(0, m.start() - 20):m.start()])]
    return bool(calls) and all(_chained_handler(code, _close_paren(code, m.end())) for m in calls)


def _top_level_comma(s):
    d = 0
    for ch in s:
        if ch in "([{":
            d += 1
        elif ch in ")]}":
            d -= 1
        elif ch == "," and d == 0:
            return True
    return False


_ASYNC_FN = re.compile(
    r"async\s+function\s+([\w$]+)\s*\([^(){}]*\)\s*$"
    r"|(?:const|let|var)\s+([\w$]+)\s*=\s*async\s*(?:\([^(){}]*\)|[\w$]+)\s*=>\s*$")
_TOKEN = re.compile(r"[{}]|(?<![\w$])try(?![\w$])|" + _CALL.pattern)


def classify(src):
    """Yield (line, kind) for each clipboard write: ok, returned, unhandled, unawaited."""
    if "clipboard" not in src:
        return
    code = strip(src)
    stack, tries, pending_try = [], 0, False
    funcs = []  # (stack depth, name) of each open named async function body
    for m in _TOKEN.finditer(code):
        tok = m.group()
        if tok == "{":
            fn = _ASYNC_FN.search(code[max(0, m.start() - 200):m.start()])
            if fn:
                funcs.append((len(stack), fn.group(1) or fn.group(2)))
            stack.append(pending_try)
            tries += pending_try
            pending_try = False
            continue
        if tok == "}":
            if stack:
                tries -= stack.pop()
            if funcs and funcs[-1][0] == len(stack):
                funcs.pop()
            continue
        if tok == "try":
            pending_try = True
            continue
        line = code.count("\n", 0, m.start()) + 1
        end = _close_paren(code, m.end())
        before = code[max(0, m.start() - 80):m.start()]
        # what precedes `navigator.clipboard` / `window.navigator.clipboard`
        head = re.sub(r"(?:(?:window|globalThis|self)\s*\.\s*)?(?:navigator\s*\.\s*)?(?:\?\.\s*)?$", "", before)
        head = re.sub(r"\(\s*$", "", head)  # `(await navigator.clipboard...)`
        awaited = re.search(r"(?<![\w$])await\s*$", head) is not None
        returned = re.search(r"(?<![\w$])return\s*(?:await\s*)?$|=>\s*$", head) is not None
        if _chained_handler(code, end) or _group_handler(code, end):
            yield line, "ok"
        elif tries and awaited:
            yield line, "ok"
        elif awaited and funcs and _caller_handles(code, funcs[-1][1]):
            yield line, "ok"  # the function's callers chain .catch
        elif returned:
            yield line, "returned"
        elif tries:
            yield line, "unawaited"
        else:
            yield line, "unhandled"


_SCRIPT = re.compile(r"<script\b([^>]*)>(.*?)</script\b[^>]*>", re.S | re.I)


def scripts(path, src):
    if path.suffix != ".html":
        yield 1, src
        return
    for m in _SCRIPT.finditer(src):
        if re.search(r"""type\s*=\s*["']?(?:application/(?:ld\+)?json|text/template)""", m.group(1), re.I):
            continue
        yield src.count("\n", 0, m.start(2)) + 1, m.group(2)


def files(root):
    root = Path(root)
    for path in sorted(root.rglob("*")):
        if path.suffix not in (".html", ".mjs", ".js") or ".test." in path.name:
            continue
        rel = path.relative_to(root).parts
        if _SKIP_DIRS.intersection(rel) or "tests" in rel or not path.is_file():
            continue
        yield path


def check_tree(root):
    found = []
    for path in files(root):
        try:
            src = path.read_text()
        except (UnicodeDecodeError, OSError):
            continue
        if "clipboard" not in src:
            continue
        for start, code in scripts(path, src):
            for line, kind in classify(code):
                found.append((str(path), start + line - 1, kind))
    return found


MESSAGES = {
    "unhandled": "clipboard write has no try/catch or .catch: a refused copy fails silently",
    "unawaited": "clipboard write inside try is not awaited: a refused copy escapes the catch, and any \"Copied\" after it still shows",
    "returned": "clipboard promise returned to the caller (not followed)",
}


def main(argv):
    args = [a for a in argv[1:] if not a.startswith("--")]
    root = args[0] if args else Path(__file__).resolve().parents[2] / "ventures"
    found = check_tree(root)
    bad = [f for f in found if f[2] in ("unhandled", "unawaited")]
    shown = found if "--all" in argv else bad
    for path, line, kind in shown:
        if kind != "ok":
            print(f"{path}:{line}: {MESSAGES[kind]}")
    counts = {k: sum(1 for f in found if f[2] == k) for k in ("ok", "returned", "unhandled", "unawaited")}
    print(f"{len(found)} clipboard write(s): " + ", ".join(f"{v} {k}" for k, v in counts.items()))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
