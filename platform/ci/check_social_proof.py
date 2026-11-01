#!/usr/bin/env python3
"""Fail if visible page copy makes social-proof claims the repo can't back.

`check_jsonld.py` guards the structured-data side of `goals.md` ("Honest
marketing", 16 CFR Part 465); this guards the visible side: "trusted by",
"join 5,000 users", star ratings, "award-winning", "as seen in". A line that
attributes the claim to someone else ("X says it is trusted by thousands",
"its own marketing", a quoted example) is allowed, because comparison pages
describe competitors. Scans `*.html`, `README.md` and `llms.txt` under
`ventures/` (or `--root`).

    python3 platform/ci/check_social_proof.py [--root DIR]   # exit 1 if any found
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CLAIM = re.compile(
    r"(trusted by\b|\bjoin(ed)? (over |more than )?[\d,]+\+? "
    r"|[\d,]+\+? (happy|satisfied) "
    r"|\brated \d(\.\d)?\s*(/\s*5|stars|out of)"
    r"|[★⭐]{3,}|\b\d(\.\d)?\s*(/\s*5|out of 5) stars"
    r"|\b\d(\.\d)?-star (rated|rating|average)"
    r"|\bas (seen|featured) (on|in)\b"
    r"|\b(award[- ]winning|#1 (rated|choice)|best[- ]selling)\b)", re.I)
# Cheap superset of CLAIM: every alternative above contains one of these
# literals (or slash, optional space, 5), so a lowercased line without one
# cannot match. Plain `in` tests are far faster than CLAIM, whose leading
# `[\d,]+` alternatives cost ~9 s over the 67 MB tree (now ~1 s).
PREFILTER_KEYS = ("trusted by", "join ", "joined ", "happy ", "satisfied ", "rated ",
                  "★", "⭐", "out of 5", "-star ", "as seen ", "as featured ",
                  "award", "#1 ", "best-selling", "best selling")
SLASH5 = re.compile(r"/\s*5")


def maybe_claim(lowered):
    return any(k in lowered for k in PREFILTER_KEYS) or SLASH5.search(lowered) is not None


# The claim belongs to a named third party, or is a format example.
ATTRIBUTED = re.compile(
    r"\b(says|said|claims?|claimed|advertis\w+|its own marketing|own marketing"
    r"|marketing says|according to|sample|example|e\.g\.|such as|seen in a third)\b|<code>", re.I)


def check(text):
    """Return [(line_no, snippet)] for unattributed social-proof claims."""
    out = []
    if not maybe_claim(text.lower()):
        return out
    for i, line in enumerate(text.splitlines(), 1):
        if not maybe_claim(line.lower()):
            continue
        m = CLAIM.search(line)
        if m and not ATTRIBUTED.search(line):
            out.append((i, line.strip()[max(0, m.start() - 40):m.end() + 40]))
    return out


def files(root):
    for pat in ("*.html", "README.md", "llms.txt"):
        for p in sorted(root.rglob(pat)):
            if "node_modules" not in p.parts:
                yield p


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=str(ROOT / "ventures"))
    args = ap.parse_args(argv)
    bad, n = 0, 0
    for p in files(Path(args.root)):
        n += 1
        for line_no, snip in check(p.read_text(encoding="utf-8", errors="replace")):
            bad += 1
            print(f"{p}:{line_no}: {snip}")
    print(f"{n} files scanned, {bad} unattributed social-proof claims")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
