#!/usr/bin/env python3
"""Fail if a served page has a form control with no accessible name.

A `<textarea placeholder="Paste it here">` looks labelled to a sighted visitor,
but a placeholder is not a name: screen readers may skip it, it disappears on
input, and WCAG 4.1.2 / 3.3.2 want a real label. A control is named when it is

  * inside a `<label>`, or the target of a `<label for>`,
  * or has `aria-label`, `aria-labelledby` or `title`.

`hidden`, `submit`, `button`, `reset` and `image` inputs are skipped (they are
named by their value or are not user-facing).

    python3 platform/ci/check_control_labels.py [--root DIR]   # exit 1 if any
"""
import argparse
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKIP_TYPES = {"hidden", "submit", "button", "reset", "image"}


class _Scan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_label = 0
        self.fors = set()
        self.controls = []  # (attrs, inside_label, line)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "label":
            self.in_label += 1
            if a.get("for"):
                self.fors.add(a["for"])
        elif tag in ("input", "select", "textarea") and a.get("type") not in SKIP_TYPES:
            self.controls.append((a, self.in_label > 0, self.getpos()[0]))

    def handle_endtag(self, tag):
        if tag == "label" and self.in_label:
            self.in_label -= 1


def unlabeled(html):
    """Return [(line, id_or_name)] for controls in `html` with no accessible name."""
    s = _Scan()
    s.feed(html)
    out = []
    for a, wrapped, line in s.controls:
        if wrapped or a.get("aria-label") or a.get("aria-labelledby") or a.get("title") \
                or (a.get("id") and a["id"] in s.fors):
            continue
        out.append((line, a.get("id") or a.get("name") or "?"))
    return out


def scan(root=ROOT):
    bad = []
    for f in sorted((root / "ventures").glob("*/*.html")):
        for line, name in unlabeled(f.read_text(encoding="utf-8", errors="ignore")):
            bad.append((f.relative_to(root), line, name))
    return bad


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", type=Path, default=ROOT)
    bad = scan(ap.parse_args(argv).root)
    for path, line, name in bad:
        print(f"{path}:{line}: control '{name}' has no label, aria-label or title")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
