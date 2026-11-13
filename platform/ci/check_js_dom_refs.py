#!/usr/bin/env python3
"""Fail if a page's own script looks up an element id the page never defines.

`document.getElementById("result")` against a page with no `id="result"` returns
null; the next line throws and the calculator is dead, with no unit test the
wiser because tests import the engine, not the page. Literal ids only, from
`getElementById('x')` and `querySelector('#x')`, in a page's inline scripts and
in `<script src>` files that sit beside it. An id counts as defined if
`id="x"`, `id='x'`, `id=x` or `.id = 'x'` / `setAttribute('id','x')` appears anywhere in
the page or those scripts (so ids built by script do not false-flag). Pages that
build ids from templates or loop-generated strings are only checked for the
literal lookups.

    python3 platform/ci/check_js_dom_refs.py [--root DIR]   # exit 1 if any
"""
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from page_pool import map_pages  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = re.compile(r"<script\b([^>]*)>(.*?)</script>", re.S | re.I)
SRC = re.compile(r'\bsrc\s*=\s*["\']([^"\']+)["\']', re.I)
COMMENT = re.compile(r"<!--.*?-->", re.S)
LOOKUP = re.compile(r"""getElementById\(\s*(['"])([A-Za-z][\w:.-]*)\1\s*\)|querySelector\(\s*(['"])#([A-Za-z][\w-]*)\3\s*\)""")
DEFINED = re.compile(
    r"""\bid\s*=\s*\\?["']?([A-Za-z][\w:.-]*)"""
    r"""|\.id\s*=\s*(['"`])([^'"`]+)\2"""
    r"""|setAttribute\(\s*['"]id['"]\s*,\s*['"`]([^'"`]+)['"`]"""
    r"""|\bid:\s*(['"`])([^'"`]+)\5""")
JSCOMMENT = re.compile(r"/\*.*?\*/|(?<![:\"'\\])//[^\n]*", re.S)


def page_problems(path: Path):
    html = COMMENT.sub("", path.read_text(errors="replace"))
    js = []
    for attrs, body in SCRIPT.findall(html):
        m = SRC.search(attrs)
        if m and not m.group(1).startswith(("http", "//", "/")):
            f = (path.parent / m.group(1).split("?")[0]).resolve()
            if f.is_file():
                js.append(f.read_text(errors="replace"))
        elif not m:
            js.append(body)
    js_all = "\n".join(js)
    if "document.write" in js_all or "<iframe" in html.lower():
        return []
    # Lookups first: a page with no literal lookup has nothing to report, so
    # the id scan over page + scripts (most of the time) is skipped for it.
    # The answer is the same set either way.
    stripped = JSCOMMENT.sub("", js_all)
    wanted = {m.group(2) or m.group(4) for m in LOOKUP.finditer(stripped)}
    wanted = {i for i in wanted if "${" not in i}
    if not wanted:
        return []
    defined = set()
    for m in DEFINED.finditer(html + "\n" + js_all):
        defined |= {g for g in m.groups() if g and not g.startswith(("'", '"', "`"))}
    defined = {d for d in defined if d}
    return sorted(wanted - defined)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=str(ROOT / "ventures"))
    a = ap.parse_args(argv)
    root = Path(a.root)
    pages = [p for p in sorted(root.rglob("*.html"))
             if not any(s in p.parts for s in ("node_modules", ".git", "dist", "build"))]
    n = bad = 0
    # Each page's answer depends only on that page and its own scripts, so a
    # process pool returns the same results in the same order.
    for p, ids in zip(pages, map_pages(page_problems, pages)):
        n += 1
        if ids:
            bad += 1
            print(f"{p.relative_to(root)}: no element with id {', '.join(ids)}")
    print(f"{n} pages checked, {bad} with a script lookup of a missing id")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
