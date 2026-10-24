#!/usr/bin/env python3
"""Check that new research directories belong to a programme (research/PROGRAMMES.md).

    python3 research/_shared/programme_check.py

Since 2026-10-24 the unit of research is the programme: one hard question pursued over
many sessions toward a paper. A directory created after that date passes if it

- is a programme: it holds a PROPOSAL.md with the sections PROGRAMMES.md lists and at
  least ten links or ids under "Related work"; or
- names its programme in project.json (`"programme": "<slug>"`, a directory that is a
  programme); or
- explains why it stands alone (`"programme": "none"` with a non-empty `why_standalone`).

Directories that existed on 2026-10-24 are listed in legacy_projects.txt and exempt.
Exit 1 lists each failing directory and what it lacks.
"""
import json
import re
import sys
from pathlib import Path

RESEARCH = Path(__file__).resolve().parents[1]
SECTIONS = ["Question", "Why it matters", "Related work", "Gap", "Hypotheses",
            "Method", "Evaluation", "Milestones", "Target venue"]
MIN_REFS = 10
REF = re.compile(r"https?://|doi:|arXiv:", re.I)


def sections(text):
    """{heading: body} for the `## ` headings of a markdown file."""
    out, cur = {}, None
    for line in text.splitlines():
        if line.startswith("## "):
            cur = line[3:].strip().lower()
            out[cur] = []
        elif cur is not None:
            out[cur].append(line)
    return {k: "\n".join(v) for k, v in out.items()}


def proposal_problems(d):
    f = d / "PROPOSAL.md"
    if not f.is_file():
        return ["no PROPOSAL.md"]
    secs = sections(f.read_text(errors="ignore"))
    problems = [f"PROPOSAL.md has no '## {s}' section" for s in SECTIONS if s.lower() not in secs]
    refs = len(REF.findall(secs.get("related work", "")))
    if "related work" in secs and refs < MIN_REFS:
        problems.append(f"PROPOSAL.md 'Related work' cites {refs} works, fewer than {MIN_REFS}")
    return problems


def problems(d, legacy, root=RESEARCH):
    if d.name in legacy:
        return []
    own = proposal_problems(d)
    if own == []:
        return []
    card = d / "project.json"
    prog = json.loads(card.read_text()).get("programme") if card.is_file() else None
    if prog == "none":
        why = json.loads(card.read_text()).get("why_standalone", "").strip()
        return [] if why else ["project.json says programme 'none' but gives no why_standalone"]
    if prog:
        target = root / prog
        if not target.is_dir():
            return [f"project.json names programme '{prog}', which is not a research/ directory"]
        if proposal_problems(target):
            return [f"project.json names '{prog}', which has no complete PROPOSAL.md"]
        return []
    if (d / "PROPOSAL.md").is_file():
        return own
    return ["neither a programme (PROPOSAL.md) nor part of one (project.json 'programme');"
            " see research/PROGRAMMES.md"]


def main(root=RESEARCH):
    legacy = set((root / "_shared" / "legacy_projects.txt").read_text().split())
    bad = {}
    for d in sorted(p for p in root.iterdir() if p.is_dir() and p.name[0] not in "_."):
        found = problems(d, legacy, root)
        if found:
            bad[d.name] = found
    for name, found in bad.items():
        for p in found:
            print(f"research/{name}: {p}")
    if not bad:
        print("ok")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
