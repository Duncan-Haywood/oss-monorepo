#!/usr/bin/env python3
"""Check the manuscript against a target venue's stated submission requirements.

Each requirement is copied from the venue's own pages (paper/VENUE.md lists them with
URLs and the date read). The checks are mechanical; whether the paper may be submitted
at all is decided by the venue's generative-AI rule, which is reported first and comes
from research/_shared/venue_policies.json.

    python3 paper/venue_check.py                  # IJFP, manuscript.md
    python3 paper/venue_check.py --venue ieee

Exit 0 always unless --strict, which exits 1 when any check fails. Stdlib only.
"""
import argparse
import json
import re
import sys
from pathlib import Path

PAPER = Path(__file__).resolve().parent
REGISTER = PAPER.parents[1] / "_shared" / "venue_policies.json"

# River Publishers, "Guidelines for Authors Submitting a Journal Paper" (read 2026-11-19).
REQUIREMENTS = {
    "ijfp": {
        "title_chars": 80,          # "Titles are limited to 80 characters, including spaces."
        "abstract_words": 250,      # "Please provide a 250 word summary of the submission."
        "sections": {               # sections the guideline lists as required parts
            "keywords": r"^\*\*Keywords?[.:]?\*\*|^## Keywords",
            "notation list": r"^## (Notation|Nomenclature|List of (notations|symbols))",
            "figure and table caption list": r"^## (Figure|List of figures)",
            "AI-use statement": r"^## (AI use|Declaration of generative AI)",
        },
    },
    "ieee": {
        "title_chars": None,
        "abstract_words": 250,      # IEEE journals generally ask 150 to 250 words; not checked per title
        "sections": {"AI-use statement": r"^## (AI use|Declaration of generative AI|Acknowledg)"},
    },
}


def title(md):
    return md.splitlines()[0].lstrip("#").strip()


def abstract_words(md):
    m = re.search(r"^## Abstract\s*\n(.*?)(?=^\*\*Keywords|^## )", md, re.S | re.M)
    if not m:
        return None
    text = re.sub(r"<[^>]+>", "", m.group(1))
    return len(text.split())


def checks(md, venue):
    req = REQUIREMENTS[venue]
    out = []
    if req["title_chars"]:
        n = len(title(md))
        out.append(("title length", n <= req["title_chars"], f"{n} characters, limit {req['title_chars']}"))
    n = abstract_words(md)
    out.append(("abstract length", n is not None and n <= req["abstract_words"],
                f"{n} words, limit {req['abstract_words']}"))
    for name, pat in req["sections"].items():
        ok = re.search(pat, md, re.M | re.I) is not None
        out.append((name, ok, "present" if ok else "missing"))
    return out


def policy(venue):
    for v in json.loads(REGISTER.read_text())["venues"]:
        if v["id"] == venue:
            return v
    return None


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--venue", default="ijfp", choices=sorted(REQUIREMENTS))
    ap.add_argument("--paper", default="manuscript.md")
    ap.add_argument("--strict", action="store_true")
    a = ap.parse_args(argv)
    md = (PAPER / a.paper).read_text()
    p = policy(a.venue)
    if p:
        print(f"generative-AI policy: {p['policy'].upper()} ({p['name']}, read {p['checked']})")
        print(f"  {p['summary']}")
    rows = checks(md, a.venue)
    for name, ok, detail in rows:
        print(f"{'ok  ' if ok else 'FAIL'} {name}: {detail}")
    failed = sum(not ok for _, ok, _ in rows)
    print(f"{len(rows) - failed} of {len(rows)} format checks pass")
    return 1 if (a.strict and failed) else 0


if __name__ == "__main__":
    sys.exit(main())
