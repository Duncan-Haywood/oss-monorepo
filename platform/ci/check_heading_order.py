#!/usr/bin/env python3
"""Flag HTML pages whose headings skip a level (h1 straight to h3, h2 to h4).

Screen-reader users navigate by heading level, and search engines read the
outline; a skipped level makes a section look like it is missing a parent.
Scripts, styles, templates, textareas and comments are ignored, so heading
markup inside a JavaScript string does not count.

Usage:
    python3 platform/ci/check_heading_order.py [--fix] [path ...]

With no path it scans every .html file under ventures/. `--fix` pulls each
run of too-deep headings up so the jump is one level (h3 under h1 becomes h2),
keeping the run's own shape. Exit 1 when any page still skips a level.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKIP = re.compile(r"<(script|style|template|textarea)\b.*?</\1>|<!--.*?-->", re.S | re.I)
HEADING = re.compile(r"<(/?)h([1-6])\b", re.I)


def skips(html):
    """Return (from_level, to_level) for every skipped step, in document order."""
    text = SKIP.sub("", html)
    levels = [int(m.group(2)) for m in HEADING.finditer(text) if not m.group(1)]
    return [(a, b) for a, b in zip(levels, levels[1:]) if b - a > 1]


def fix(html):
    """Pull deep heading runs up to one level below their parent."""
    spans = [(m.start(), m.end()) for m in SKIP.finditer(html)]
    tags = [m for m in HEADING.finditer(html)
            if not any(a <= m.start() < b for a, b in spans)]
    levels = [int(m.group(2)) for m in tags if not m.group(1)]
    new = list(levels)
    for i in range(1, len(levels)):
        gap = new[i] - new[i - 1]
        if gap > 1:
            j = i
            while j < len(levels) and levels[j] >= levels[i]:
                new[j] = levels[j] - (gap - 1)
                j += 1
    it, stack, out, last = iter(new), [], [], 0
    for m in tags:
        if m.group(1):
            level = stack.pop() if stack else int(m.group(2))
        else:
            level = next(it)
            stack.append(level)
        out.append(html[last:m.start()])
        out.append(f"<{m.group(1)}h{level}")
        last = m.end()
    out.append(html[last:])
    return "".join(out)


def main(argv):
    do_fix = "--fix" in argv
    args = [a for a in argv if a != "--fix"]
    files = [Path(a) for a in args] or sorted((ROOT / "ventures").rglob("*.html"))
    bad = 0
    for f in files:
        if "node_modules" in f.parts:
            continue
        html = f.read_text(errors="ignore")
        if "<html" not in html.lower():
            continue
        found = skips(html)
        if not found:
            continue
        if do_fix:
            f.write_text(fix(html))
            found = skips(f.read_text())
        if found:
            bad += 1
            rel = f.relative_to(ROOT) if f.is_absolute() and ROOT in f.parents else f
            print(f"{rel}: heading level skips {found}")
    print(f"check_heading_order: {bad} page(s) with skipped heading levels")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
