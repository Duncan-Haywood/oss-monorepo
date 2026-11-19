#!/usr/bin/env python3
"""Which open programmes aim at a venue whose rules forbid AI-generated content?

Every programme in research/PROGRAMMES.md names a target venue, and every paper here is
written by AI agents (the research guardrails require saying so). Some venues ask authors
to confirm that generative AI did not create the content; a paper from this repository
cannot honestly tick that box. This script matches each programme's venue column against
venue_policies.json (entries taken from the venues' own pages, with dates) and prints,
per programme, whether each named venue prohibits AI content, allows it with disclosure,
or is not yet in the register.

    python3 research/_shared/venue_policy.py            # table
    python3 research/_shared/venue_policy.py --json     # machine-readable
    python3 research/_shared/venue_policy.py --strict   # exit 1 if any programme names
                                                        # only prohibiting venues
    python3 research/_shared/venue_policy.py --venue "IEEE Access" --venue "Energies (MDPI)"
                                                        # classify candidate venues

Stdlib only; no network.
"""
import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
RESEARCH = HERE.parent
ORDER = {"prohibits": 0, "unchecked": 1, "disclose": 2}


def load_register(path=HERE / "venue_policies.json"):
    return json.loads(Path(path).read_text())["venues"]


def programmes(text):
    """(slug, venue column) for each row of the 'Open programmes' table."""
    rows = []
    in_table = False
    for line in text.splitlines():
        if line.startswith("## "):
            in_table = line.strip() == "## Open programmes"
            continue
        if not in_table or not line.startswith("| ["):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        m = re.match(r"\[`([^`]+)`\]", cells[0])
        if m and len(cells) >= 4:
            rows.append((m.group(1), cells[-1]))
    return rows


def classify(venue_text, register):
    """Register entries whose match strings appear in the venue text."""
    hits = []
    low = venue_text.lower()
    for v in register:
        if any(s.lower() in low for s in v["match"]):
            hits.append(v)
    return hits


def verdict(hits):
    """'prohibits' only if every matched venue prohibits; 'none' if nothing matched."""
    if not hits:
        return "none"
    policies = {h["policy"] for h in hits}
    if policies == {"prohibits"}:
        return "prohibits"
    if "disclose" in policies:
        return "has-disclose"
    if "prohibits" in policies:
        return "prohibits+unchecked"
    return "unchecked"


def report(prog_text, register):
    out = []
    for slug, venue in programmes(prog_text):
        hits = classify(venue, register)
        out.append({"programme": slug, "venue": venue, "verdict": verdict(hits),
                    "matched": [{"id": h["id"], "policy": h["policy"]} for h in hits]})
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--programmes", default=str(RESEARCH / "PROGRAMMES.md"))
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--venue", action="append", default=[],
                    help="classify this venue text instead of PROGRAMMES.md (repeatable)")
    a = ap.parse_args(argv)
    if a.venue:
        reg = load_register()
        for text in a.venue:
            hits = classify(text, reg)
            v = verdict(hits)
            if {"prohibits", "disclose"} <= {h["policy"] for h in hits}:
                v = "mixed"  # one venue under two publishers' rules (e.g. co-sponsored)
            m = ", ".join(f'{h["id"]}={h["policy"]}' for h in hits) or "-"
            print(f"{v:<20} {text:<48} {m}")
        return 0
    rows = report(Path(a.programmes).read_text(), load_register())
    if a.json:
        print(json.dumps(rows, indent=1))
    else:
        for r in sorted(rows, key=lambda r: (r["verdict"] != "prohibits", r["verdict"], r["programme"])):
            m = ", ".join(f'{x["id"]}={x["policy"]}' for x in r["matched"]) or "-"
            print(f'{r["verdict"]:<20} {r["programme"]:<32} {m}')
        n = {k: sum(r["verdict"] == k for r in rows) for k in
             ("prohibits", "prohibits+unchecked", "has-disclose", "unchecked", "none")}
        print(f"{len(rows)} programmes: " + ", ".join(f"{v} {k}" for k, v in n.items()))
    bad = [r for r in rows if r["verdict"] == "prohibits"]
    return 1 if (a.strict and bad) else 0


if __name__ == "__main__":
    sys.exit(main())
