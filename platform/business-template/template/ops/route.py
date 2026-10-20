#!/usr/bin/env python3
"""Pick the business function this run works on.

Every scheduled run starts here (prompt.md, step 1). The stage in
ops/routing.json decides the weights: an `intake` business always gets the
intake function, and once `review_every` runs have been recorded since the
last review, the run reviews instead. Otherwise the function is drawn by
weight, so several hourly jobs spread across product, marketing, sales,
finance, legal and support instead of all doing the same thing.

    python3 ops/route.py                    # draw
    python3 ops/route.py --skip marketing   # another open PR already has it
    python3 ops/route.py --function finance # the owner named the task
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STAGES = ("intake", "build", "launch", "grow")


def load_routing(root: Path = ROOT) -> dict:
    return json.loads((root / "ops" / "routing.json").read_text())


def load_runs(root: Path = ROOT) -> list[dict]:
    runs = []
    for path in sorted((root / "ops" / "runs").glob("*.json")):
        try:
            runs.append(json.loads(path.read_text()))
        except json.JSONDecodeError:
            continue  # check.py reports it; routing should not die on it
    return runs


def runs_since_review(runs: list[dict]) -> int:
    count = 0
    for run in reversed(runs):
        if run.get("function") == "review":
            break
        count += 1
    return count


def open_owner_items(root: Path = ROOT) -> int:
    path = root / "OWNER.md"
    if not path.exists():
        return 0
    return sum(1 for line in path.read_text().splitlines() if line.lstrip().startswith("- [ ]"))


def choose(routing: dict, runs: list[dict], skip: set[str], rng: random.Random) -> tuple[str, str]:
    stage = routing["stage"]
    if stage == "intake":
        return "intake", "the business is in intake: questions first"
    every = routing.get("review_every", 24)
    if "review" not in skip and runs_since_review(runs) >= every:
        return "review", f"{runs_since_review(runs)} runs since the last review (every {every})"
    weights = {f: w for f, w in routing["weights"][stage].items() if w > 0 and f not in skip}
    if not weights:
        weights = {f: w for f, w in routing["weights"][stage].items() if w > 0}
    names = sorted(weights)
    pick = rng.choices(names, weights=[weights[n] for n in names])[0]
    return pick, f"drawn by {stage}-stage weight {weights[pick]:.2f}"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--function", help="work on this function instead of drawing one")
    ap.add_argument("--skip", action="append", default=[], help="function another open PR already covers")
    ap.add_argument("--seed", type=int, help="fix the draw (tests)")
    args = ap.parse_args(argv)

    routing = load_routing()
    if routing.get("stage") not in STAGES:
        print(f"ops/routing.json: stage must be one of {', '.join(STAGES)}", file=sys.stderr)
        return 2
    if args.function:
        function, why = args.function, "named by the task"
    else:
        function, why = choose(routing, load_runs(), set(args.skip), random.Random(args.seed))
    brief = ROOT / "functions" / f"{function}.md"
    if not brief.exists():
        print(f"no brief for function {function!r} at {brief.relative_to(ROOT)}", file=sys.stderr)
        return 2
    print(f"function: {function}")
    print(f"brief:    functions/{function}.md")
    print(f"stage:    {routing['stage']}")
    print(f"why:      {why}")
    print(f"owner:    {open_owner_items()} open item(s) in OWNER.md")
    print(f"trailer:  Business-Function: {function}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
