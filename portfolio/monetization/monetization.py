#!/usr/bin/env python3
"""Business model per product: print the plan, name the next task, check the file.

    python3 portfolio/monetization/monetization.py          # table + next task
    python3 portfolio/monetization/monetization.py next     # just the next task
    python3 portfolio/monetization/monetization.py --check  # validate models.yaml

The data is models.yaml next to this file; the reasoning is README.md. A run
that lands a step moves that row's `stage` forward and rewrites its `next` in
the same PR, so the next run picks up where it left off (owner, 2026-11-02:
"this should be a continual thing to focus on").
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
MODELS = HERE / "models.yaml"

STAGES = ["none", "planned", "built-dark", "test-paid", "live"]
LIABILITY = ["low", "medium", "high"]
REQUIRED = [
    "venture", "buyer", "liability", "model", "first_offer",
    "price_hypothesis", "comparables", "stage", "next", "next_owner",
]
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def load(path: Path = MODELS) -> dict:
    with open(path, encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def check(data: dict, repo: Path = REPO) -> list[str]:
    """Problems with the file, empty when it is valid."""
    errors: list[str] = []
    products = data.get("products")
    if not isinstance(products, list) or not products:
        return ["models.yaml: `products` must be a non-empty list"]
    seen: set[str] = set()
    for i, row in enumerate(products):
        name = row.get("venture", f"row {i}")
        where = f"models.yaml {name}"
        for key in REQUIRED:
            if key not in row:
                errors.append(f"{where}: missing `{key}`")
        if name in seen:
            errors.append(f"{where}: listed twice")
        seen.add(name)
        if not (repo / "ventures" / str(name)).is_dir():
            errors.append(f"{where}: no ventures/{name} directory")
        if row.get("stage") not in STAGES:
            errors.append(f"{where}: stage must be one of {STAGES}")
        if row.get("liability") not in LIABILITY:
            errors.append(f"{where}: liability must be one of {LIABILITY}")
        if not isinstance(row.get("next_owner"), bool):
            errors.append(f"{where}: next_owner must be true or false")
        for c in row.get("comparables") or []:
            src = str(c.get("source", ""))
            if not src.startswith("https://"):
                errors.append(f"{where}: comparable {c.get('what')!r} needs an https source")
            if not DATE.match(str(c.get("read", ""))):
                errors.append(f"{where}: comparable {c.get('what')!r} needs a `read` date")
            if not c.get("price"):
                errors.append(f"{where}: comparable {c.get('what')!r} needs a price")
        # A row may not claim money it can't show: a live row must say where
        # its sale is recorded.
        if row.get("stage") in ("test-paid", "live") and not row.get("evidence"):
            errors.append(f"{where}: stage {row.get('stage')} needs `evidence` (a file path)")
        ev = row.get("evidence")
        if ev and not (repo / str(ev)).exists():
            errors.append(f"{where}: evidence {ev} does not exist")
    return errors


def queue(data: dict) -> list[dict]:
    """Agent-doable rows, best first: furthest along, then lowest liability.

    Finishing one product's paid path beats starting a second, and a
    low-liability product beats a high one at the same stage.
    """
    rows = [
        (i, r) for i, r in enumerate(data.get("products") or [])
        if r.get("stage") != "live" and not r.get("next_owner") and not r.get("parked")
    ]
    rows.sort(key=lambda ir: (
        -STAGES.index(ir[1]["stage"]),
        LIABILITY.index(ir[1]["liability"]),
        ir[0],
    ))
    return [r for _, r in rows]


def owner_rows(data: dict) -> list[dict]:
    return [r for r in data.get("products") or [] if r.get("next_owner")]


def next_task(data: dict) -> str:
    q = queue(data)
    if not q:
        return ("Monetize: no agent-doable row in portfolio/monetization/models.yaml. "
                "Add a product (README.md, 'Adding a product') or unpark one whose blocker landed.")
    r = q[0]
    return (f"Monetize ({r['venture']}, stage {r['stage']}): {' '.join(str(r['next']).split())} "
            "Then move its `stage` and rewrite its `next` in portfolio/monetization/models.yaml.")


def table(data: dict) -> str:
    lines = [f"{'venture':28} {'stage':11} {'liability':9} {'next by':7} first offer"]
    for r in data.get("products") or []:
        who = "owner" if r.get("next_owner") else ("parked" if r.get("parked") else "agent")
        lines.append(f"{r['venture']:28} {r['stage']:11} {r['liability']:9} {who:7} {r['first_offer']}")
    rail = data.get("rail") or {}
    lines.append("")
    lines.append(f"Payout rail: {rail.get('stage', '?')} ({rail.get('provider', '?')})")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("command", nargs="?", choices=["plan", "next"], default="plan")
    ap.add_argument("--check", action="store_true", help="validate models.yaml and exit")
    args = ap.parse_args(argv)
    data = load()
    errors = check(data)
    if args.check or errors:
        for e in errors:
            print(e, file=sys.stderr)
        if args.check:
            print("models.yaml: ok" if not errors else f"models.yaml: {len(errors)} problem(s)")
        return 1 if errors else 0
    if args.command == "next":
        print(next_task(data))
        return 0
    print(table(data))
    print()
    print("Next: " + next_task(data))
    for r in owner_rows(data):
        print(f"Waiting on the owner: {r['venture']}: {' '.join(str(r['next']).split())}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
