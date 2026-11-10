#!/usr/bin/env python3
"""Report venture HTML pages with unbalanced tags (stray or unclosed).

Uses html.parser, ignores void elements and optional-end-tag elements.
Usage: check_tag_balance.py [root=ventures] [--max N]
Exit 1 if any page has a stray closing tag or an unclosed non-optional tag.
"""
import sys
from html.parser import HTMLParser
from pathlib import Path

VOID = {"area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"}
OPTIONAL = {"p","li","dt","dd","tr","td","th","thead","tbody","tfoot","option","optgroup","colgroup","html","head","body"}
RAW = {"script","style"}


class P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.problems = [], []

    def handle_starttag(self, tag, attrs):
        if tag not in VOID:
            self.stack.append((tag, self.getpos()[0]))

    def handle_startendtag(self, tag, attrs):
        pass

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                for t, ln in self.stack[i + 1:]:
                    if t not in OPTIONAL:
                        self.problems.append(f"line {ln}: <{t}> unclosed before </{tag}>")
                del self.stack[i:]
                return
        self.problems.append(f"line {self.getpos()[0]}: stray </{tag}>")


def check(path):
    p = P()
    p.feed(path.read_text(errors="replace"))
    p.close()
    for t, ln in p.stack:
        if t not in OPTIONAL:
            p.problems.append(f"line {ln}: <{t}> never closed")
    return p.problems


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    root = Path(args[0] if args else "ventures")
    bad = 0
    files = sorted(root.rglob("*.html"))
    for f in files:
        if "node_modules" in f.parts:
            continue
        pr = check(f)
        if pr:
            bad += 1
            print(f"{f}: {len(pr)} problem(s); first: {pr[0]}")
    print(f"{len(files)} pages, {bad} with unbalanced tags")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
