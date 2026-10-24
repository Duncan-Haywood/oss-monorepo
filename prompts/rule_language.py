#!/usr/bin/env python3
"""How much of the guidance is worded as a hard rule, and does it need to be?

Counts absolute words ("never", "must", "always", "do not", ...) in every
agent-guidance file that prompts/system.json maps, and sorts each line that
uses one into two piles:

- **liability**: the line also names a hard-limit topic (fabrication, secrets,
  fork PRs, licensing, money, accounts, the law, citations, ...). Absolute
  wording is right there (prompts/goals.md, "Guardrails").
- **default**: anything else. Each one is a candidate for rewording as a
  guideline with its reason (prompts/steering.md, "Guidelines, not rules").

The split is a keyword heuristic, not a judgment: read the lines before
rewording them. Advisory only; it always exits 0.

    python3 prompts/rule_language.py              # per-file table
    python3 prompts/rule_language.py --lines FILE # the default-pile lines in FILE
    python3 prompts/rule_language.py --json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SYSTEM = Path(__file__).resolve().parent / "system.json"

ABSOLUTE = re.compile(r"\b(never|must|always|do not|don't|mandatory|required|forbidden)\b", re.I)
LIABILITY = re.compile(
    r"fabricat|invent|fork|secret|credential|token|licen[cs]|copyright|payment|money|bank|"
    r"account|paid|spend|budget|owner-only|legal|\blaw|terms|cit(e|ation)|attribut|personal|"
    r"privacy|affiliat|endorse|contact|overstate|plagiar|quot(e|ing)|disclaimer|medical|"
    r"publish(ing)? under",
    re.I,
)


def guidance_files(system_path: Path = SYSTEM, root: Path = ROOT) -> list[Path]:
    system = json.loads(system_path.read_text())
    seen: dict[Path, None] = {}
    for doc in system.get("docs", []):
        paths = [root / doc["path"]] if "path" in doc else sorted(root.glob(doc["glob"]))
        for p in paths:
            if p.is_file():
                seen[p] = None
    return list(seen)


def classify(text: str) -> dict[str, list[tuple[int, str]]]:
    """Lines with an absolute word, split into liability and default piles."""
    piles: dict[str, list[tuple[int, str]]] = {"liability": [], "default": []}
    in_code = False
    for n, line in enumerate(text.splitlines(), 1):
        if line.lstrip().startswith("```"):
            in_code = not in_code
            continue
        if in_code or not ABSOLUTE.search(line):
            continue
        piles["liability" if LIABILITY.search(line) else "default"].append((n, line.strip()))
    return piles


def survey(files: list[Path], root: Path = ROOT) -> list[dict]:
    rows = []
    for f in files:
        piles = classify(f.read_text(errors="replace"))
        rows.append({"file": str(f.relative_to(root)), "liability": len(piles["liability"]),
                     "default": len(piles["default"])})
    return sorted(rows, key=lambda r: (-r["default"], r["file"]))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--lines", metavar="FILE", help="print the default-pile lines of one file")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)

    if args.lines:
        for n, line in classify((ROOT / args.lines).read_text())["default"]:
            print(f"{args.lines}:{n}: {line}")
        return 0

    rows = survey(guidance_files())
    if args.json:
        print(json.dumps(rows, indent=2))
        return 0
    total_l = sum(r["liability"] for r in rows)
    total_d = sum(r["default"] for r in rows)
    print(f"{len(rows)} guidance files; lines with absolute wording: "
          f"{total_l} on liability topics, {total_d} elsewhere (candidates to reword)\n")
    print(f"{'default':>7} {'liab.':>5}  file")
    for r in rows:
        if r["default"] or r["liability"]:
            print(f"{r['default']:>7} {r['liability']:>5}  {r['file']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
