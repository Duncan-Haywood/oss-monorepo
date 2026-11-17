#!/usr/bin/env python3
"""Fail when a function whose second parameter is not an index is passed bare to map/forEach/filter.

`list.map(fn)` calls `fn(item, index, array)`. A function written as
`fn(item, issues)` or `fn(value, options = {})` then receives the array index
as its second argument, and the default never applies. A red-team run on
2026-11-16 found it in home-inspection-report-builder: `findings.map(normalise)`
handed `normalise(f, issues)` the index, so a bad repair cost on the second or
later finding threw "issues.push is not a function" from the report and the
"Download text" button, and the first finding's repair note was dropped
silently (index 0 is falsy).

The check reads each non-test .mjs/.js/.html file under ventures/, collects its
top-level function definitions (and those it imports by name from a relative
module), and flags `.map(name)`, `.forEach(name)`, `.filter(name)` and the
other per-item callbacks when `name`'s second parameter is not index-shaped
(i, j, k, n, idx, index, pos, or a name starting with `_`). Wrap the call
instead, `list.map((x) => fn(x))`, or, when the index really is wanted under
another name, put `map-args: ok` in a comment on the same line.

    python3 platform/ci/check_map_callback_args.py [ventures-dir]   exit 1 on a hit
"""
import os
import re
import sys
from pathlib import Path

EXTS = (".mjs", ".js", ".html", ".cjs")
SKIP_DIRS = {"node_modules", "dist", "build", ".git", "vendor", "_site"}
OPT_OUT = "map-args: ok"
METHODS = "map|forEach|filter|some|every|find|findIndex|findLast|findLastIndex|flatMap"
CALL = re.compile(r"\.(" + METHODS + r")\(\s*([A-Za-z_$][\w$]*)\s*\)")
# Top-level only (column 0), so a same-named helper nested in another function is not confused with it.
DEF = re.compile(
    r"^(?:export\s+)?(?:(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\("
    r"|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\s*\*?\s*[\w$]*\s*)?\()",
    re.M,
)
IMPORT = re.compile(r"import\s*\{([^}]*)\}\s*from\s*[\"'](\.{1,2}/[^\"']+)[\"']")
INDEX_LIKE = re.compile(r"^(?:_[\w$]*|i|j|k|n|ii|ix|idx|index|pos|position|at)$")


def is_test(name):
    return ".test." in name or ".spec." in name or name.endswith(".check.mjs") or name.startswith("test_")


def split_params(text, start):
    """Top-level comma-separated parameters of the list opening just before `start`."""
    depth, cur, out, i = 1, "", [], start
    while i < len(text) and depth:
        ch = text[i]
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        if depth == 1 and ch == ",":
            out.append(cur.strip())
            cur = ""
        elif depth:
            cur += ch
        i += 1
    if cur.strip():
        out.append(cur.strip())
    return out


def definitions(text):
    """Map each top-level function name to its parameter list."""
    defs = {}
    for m in DEF.finditer(text):
        defs[m.group(1) or m.group(2)] = split_params(text, m.end())
    return defs


def second_param_problem(params):
    """The second parameter's text when it is not index-shaped, else None."""
    if len(params) < 2 or params[0].startswith("..."):
        return None
    name = params[1].split("=", 1)[0].strip()
    if INDEX_LIKE.match(name):
        return None
    return params[1]


def in_comment(line, col):
    before = line[:col]
    stripped = before.lstrip()
    if stripped.startswith(("//", "*", "/*")):
        return True
    return re.search(r"(?:^|\s)//", before) is not None


def scan_text(text, imported=None):
    """Return (line, method, name, params) for each bare callback whose second parameter is not an index."""
    defs = dict(imported or {})
    defs.update(definitions(text))
    lines = text.splitlines()
    hits = []
    for m in CALL.finditer(text):
        name = m.group(2)
        params = defs.get(name)
        if not params or second_param_problem(params) is None:
            continue
        n = text.count("\n", 0, m.start())
        line = lines[n] if n < len(lines) else ""
        col = m.start() - (text.rfind("\n", 0, m.start()) + 1)
        if OPT_OUT in line or in_comment(line, col):
            continue
        hits.append((n + 1, m.group(1), name, params))
    return hits


def imported_defs(path, text, cache):
    out = {}
    for m in IMPORT.finditer(text):
        target = (path.parent / m.group(2)).resolve()
        if target not in cache:
            try:
                cache[target] = definitions(target.read_text(encoding="utf-8"))
            except (OSError, UnicodeDecodeError):
                cache[target] = {}
        for spec in m.group(1).split(","):
            parts = spec.strip().split()
            if not parts:
                continue
            src, local = parts[0], parts[-1]
            if src in cache[target]:
                out[local] = cache[target][src]
    return out


def check_tree(root):
    problems, cache = [], {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in sorted(filenames):
            if not name.endswith(EXTS) or is_test(name) or ".min." in name:
                continue
            path = Path(dirpath) / name
            try:
                text = path.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            if not CALL.search(text):
                continue
            for line, method, fn, params in scan_text(text, imported_defs(path, text, cache)):
                problems.append(
                    f"{path}:{line}: .{method}({fn}) passes the array index as {fn}'s second parameter "
                    f"`{params[1]}`; write .{method}((x) => {fn}(x))"
                )
    return problems


def main(argv):
    root = argv[1] if len(argv) > 1 else Path(__file__).resolve().parents[2] / "ventures"
    problems = check_tree(root)
    for p in problems:
        print(p)
    if problems:
        print(f"{len(problems)} callback(s) handed an index they do not expect; see platform/ci/check_map_callback_args.py")
        return 1
    print("map/forEach/filter callbacks: none handed an index they do not expect")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
