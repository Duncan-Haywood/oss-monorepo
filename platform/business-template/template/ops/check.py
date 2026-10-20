#!/usr/bin/env python3
"""Check the business repository is in a state the hourly runs can trust.

CI runs this on every pull request (.github/workflows/ci.yml), and every run
runs it before merging (prompt.md, step 2). It fails on:

- a missing core file or function brief;
- ops/routing.json with an unknown stage or weights that do not sum to 1;
- a business past intake whose BUSINESS.md still has unanswered questions
  with no recorded assumption;
- duplicate ids in OWNER.md (two runs asking the owner the same thing);
- a run record missing a field, or naming an unknown function;
- unbalanced books (ops/books.py check);
- a template placeholder left unfilled.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

import books  # noqa: E402
from route import STAGES  # noqa: E402

CORE = ["prompt.md", "CLAUDE.md", "BUSINESS.md", "GUARDRAILS.md", "OWNER.md", "SETUP.md", "ops/routing.json"]
FUNCTIONS = ["intake", "product", "marketing", "sales", "finance", "legal", "support", "review"]
RUN_KEYS = {"at", "function", "stage", "outcome", "summary", "pr", "owner_asks", "blocker", "friction"}
PLACEHOLDER = re.compile(r"\{\{[A-Z_]+\}\}")
TEXT = {".md", ".json", ".py", ".yml", ".yaml", ".csv", ".txt", ".html"}


def check(root: Path = ROOT) -> list[str]:
    out: list[str] = []
    for rel in CORE + [f"functions/{f}.md" for f in FUNCTIONS]:
        if not (root / rel).exists():
            out.append(f"missing {rel}")
    if out:
        return out

    routing = json.loads((root / "ops" / "routing.json").read_text())
    stage = routing.get("stage")
    if stage not in STAGES:
        out.append(f"ops/routing.json: stage {stage!r} is not one of {', '.join(STAGES)}")
    for name, weights in routing.get("weights", {}).items():
        if name not in STAGES[1:]:
            out.append(f"ops/routing.json: weights for unknown stage {name!r}")
        unknown = set(weights) - set(FUNCTIONS)
        if unknown:
            out.append(f"ops/routing.json: {name} weights name unknown function(s) {sorted(unknown)}")
        if abs(sum(weights.values()) - 1) > 1e-6:
            out.append(f"ops/routing.json: {name} weights sum to {sum(weights.values()):.3f}, not 1")
    for name in STAGES[1:]:
        if name not in routing.get("weights", {}):
            out.append(f"ops/routing.json: no weights for stage {name!r}")

    business = (root / "BUSINESS.md").read_text()
    if stage != "intake":
        for line in business.splitlines():
            if re.match(r"\s*-\s*\*\*Answer:\*\*\s*$", line) or "**Answer:** _open_" in line:
                out.append("BUSINESS.md: past intake but a question is still open; record the answer or the assumption used")
                break

    ids = re.findall(r"^- \[[ x]\] \*\*([a-z0-9-]+)\*\*", (root / "OWNER.md").read_text(), re.M)
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        out.append(f"OWNER.md: duplicate item id(s) {dupes}; extend the existing item instead")

    for path in sorted((root / "ops" / "runs").glob("*.json")):
        try:
            run = json.loads(path.read_text())
        except json.JSONDecodeError as exc:
            out.append(f"{path.relative_to(root)}: not JSON ({exc})")
            continue
        missing = RUN_KEYS - set(run)
        if missing:
            out.append(f"{path.relative_to(root)}: missing {sorted(missing)}")
        if run.get("function") not in FUNCTIONS:
            out.append(f"{path.relative_to(root)}: unknown function {run.get('function')!r}")

    try:
        out += [f"finance/ledger.csv: {p}" for p in books.problems(books.read(root / "finance" / "ledger.csv"))]
    except (OSError, ValueError) as exc:
        out.append(f"finance/ledger.csv: {exc}")

    for path in root.rglob("*"):
        if ".git" in path.parts or not path.is_file() or path.suffix not in TEXT:
            continue
        if path.resolve() == Path(__file__).resolve():
            continue
        if PLACEHOLDER.search(path.read_text(errors="ignore")):
            out.append(f"{path.relative_to(root)}: unfilled template placeholder")
    return out


def main() -> int:
    found = check()
    for line in found:
        print(line)
    print("ok" if not found else f"{len(found)} problem(s)")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
