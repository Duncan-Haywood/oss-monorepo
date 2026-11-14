#!/usr/bin/env python3
"""Flag page scripts that silently swap a blank field for the example value.

36 calculator pages read their form with

    const n = num($(k).value); o[k] = Number.isFinite(n) ? n : DEFAULTS[k];

so a field the visitor clears is computed with the example figure while the
field itself stays empty. On the film tax credit page (red-team run of
2026-11-14) a producer with no uplift who blanked the two uplift fields got a
20% x 10% uplift added to the credit, and blanking the programme minimum
brought back a $250,000 floor, with nothing on screen saying so.

A falling back to DEFAULTS is fine when the page shows it: the fix writes the
value back into the field (`$(k).value = DEFAULTS[k]`) on the same line, so
what was computed is what the form shows. A line in an .html file that falls
back to `DEFAULTS[...]` from an `isFinite` test and does not write `.value`
on that line is flagged. Library code (calc.mjs) is out of scope: it has no
field to write to, and its callers are the pages this reads.

Exit 1 lists each hit.  Usage: python3 platform/ci/check_blank_defaults.py [root ...]
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
FALLBACK = re.compile(r"isFinite\((\w+)\)\s*\?\s*\1\s*:\s*DEFAULTS\[\w+\]"
                      r"|if\s*\(\s*(?:Number\.)?isFinite\((\w+)\)\s*\)\s*\w+\[\w+\]\s*=\s*\2;\s*else\s*\w+\[\w+\]\s*=\s*DEFAULTS\[")
WRITES_BACK = re.compile(r"\.value\s*=\s*DEFAULTS\[")
SKIP_PARTS = {"node_modules", ".next", "dist", "build", "vendor"}


def scan_text(text):
    """Line numbers (1-based) that fall back to DEFAULTS without showing it."""
    return [i for i, line in enumerate(text.splitlines(), 1)
            if FALLBACK.search(line) and not WRITES_BACK.search(line)]


def scan(roots):
    hits = []
    for root in roots:
        root = pathlib.Path(root)
        files = [root] if root.is_file() else sorted(root.rglob("*.html"))
        for p in files:
            if SKIP_PARTS & set(p.parts):
                continue
            for n in scan_text(p.read_text(encoding="utf-8", errors="replace")):
                hits.append(f"{p}:{n}")
    return hits


def main(argv):
    roots = argv or [ROOT / "ventures"]
    hits = scan(roots)
    for h in hits:
        print(f"{h}: a blank field is computed with DEFAULTS[k] but the field stays empty; "
              "write the value back ($(k).value = DEFAULTS[k]) so the form shows what was used")
    if hits:
        print(f"{len(hits)} page(s) swap a blank field for the example value unseen")
        return 1
    print("blank-field defaults: every fallback is written back into its field")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
