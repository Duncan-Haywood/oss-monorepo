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

Directories on main before the programme bar landed (2026-10-24) are listed in legacy_projects.txt and exempt.
It also runs src_layout.py: a src-layout project whose tests a plain `pytest` cannot import
(`src_layout.py --fix` repairs it), and reproduce_names.py: a new experiment script that no
doc in its directory names (README.md's Reproduce section is the place), and a README.md
paragraph over MAX_README_PARAGRAPH characters. Exit 1 lists each failing directory and what it lacks.
"""
import json
import re
import sys
from pathlib import Path

import reproduce_names
import src_layout

RESEARCH = Path(__file__).resolve().parents[1]
SECTIONS = ["Question", "Why it matters", "Related work", "Gap", "Hypotheses",
            "Method", "Evaluation", "Milestones", "Target venue"]
MIN_REFS = 10
# A README paragraph past this many characters is a log, not a summary. By
# 2026-11-16 build-data's README was one 21,344-character paragraph that each
# session appended a sentence to, and llm-coding-inference's held 12,857 in
# one; two run records said finding where to add a result took a scripted
# search. Split it into sections or one bullet per session; the detail lives in LOG.md.
MAX_README_PARAGRAPH = 6000
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


def long_paragraphs(d, limit=MAX_README_PARAGRAPH):
    """(line number, length) of README.md lines longer than `limit` characters."""
    f = d / "README.md"
    if not f.is_file():
        return []
    return [(n, len(line)) for n, line in enumerate(f.read_text(errors="ignore").splitlines(), 1)
            if len(line) > limit]


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
        if src_layout.needs_fix(d):
            found = found + ["tests import a src/ package that plain pytest cannot find;"
                             " run python3 research/_shared/src_layout.py --fix"]
        for n, size in long_paragraphs(d):
            found = found + [f"README.md:{n} is one {size:,}-character paragraph (over {MAX_README_PARAGRAPH:,});"
                             " split it into sections or one bullet per session, detail in LOG.md"]
        if found:
            bad[d.name] = found
    known = reproduce_names.baseline(root / "_shared" / reproduce_names.BASELINE.name)
    for d in sorted(p for p in root.iterdir() if p.is_dir() and p.name[0] not in "_."):
        new = [s for s in reproduce_names.unnamed(d) if s not in known]
        if new:
            bad.setdefault(d.name, []).append(
                "experiment script(s) named in no *.md here: " + ", ".join(s.split("/", 2)[2] for s in new)
                + "; add each to README.md's Reproduce section (command and what it writes)")
    for name, found in bad.items():
        for p in found:
            print(f"research/{name}: {p}")
    if not bad:
        print("ok")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
