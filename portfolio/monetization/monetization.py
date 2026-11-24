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
    "buyer", "liability", "model", "first_offer",
    "price_hypothesis", "comparables", "stage", "next", "next_owner",
]
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# A paid bet (portfolio/monetization/bets.md, 2026-11-24) is built in the
# private repository and named by `app:` instead of `venture:`. Its row adds:
APP_PREFIX = "private-monorepo/apps/"
BET_REQUIRED = ["bet", "billing", "tiers", "cost_drivers", "rail", "checkout"]
BILLING = ["subscription", "one-off"]
CHECKOUT = ["dark", "live"]


def row_name(row: dict, i: int = 0) -> str:
    """`venture` for a public venture's row, `app:<slug>` for a private bet's."""
    if row.get("venture"):
        return str(row["venture"])
    if row.get("app"):
        return "app:" + str(row["app"]).removeprefix(APP_PREFIX)
    return f"row {i}"


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
        name = row_name(row, i)
        where = f"models.yaml {name}"
        for key in REQUIRED:
            if key not in row:
                errors.append(f"{where}: missing `{key}`")
        if name in seen:
            errors.append(f"{where}: listed twice")
        seen.add(name)
        if row.get("venture") and row.get("app"):
            errors.append(f"{where}: set `venture` or `app`, not both")
        elif row.get("app"):
            errors.extend(check_bet_row(row, where))
        elif not row.get("venture"):
            errors.append(f"{where}: missing `venture` (or `app` for a private bet)")
        elif not (repo / "ventures" / str(name)).is_dir():
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


def check_bet_row(row: dict, where: str) -> list[str]:
    """A private bet's row: where it is built, how it bills, and proposed tiers
    that say they are proposals until a sale is recorded (no invented prices)."""
    errors = []
    app = str(row.get("app"))
    if not app.startswith(APP_PREFIX) or len(app) == len(APP_PREFIX):
        errors.append(f"{where}: `app` must be {APP_PREFIX}<slug>")
    for key in BET_REQUIRED:
        if key not in row:
            errors.append(f"{where}: missing `{key}`")
    if "billing" in row and row["billing"] not in BILLING:
        errors.append(f"{where}: billing must be one of {BILLING}")
    if "checkout" in row and row["checkout"] not in CHECKOUT:
        errors.append(f"{where}: checkout must be one of {CHECKOUT}")
    if row.get("checkout") == "live" and row.get("stage") != "live":
        errors.append(f"{where}: checkout live needs stage live")
    if "rail" in row and row["rail"] != "paddle":
        errors.append(f"{where}: rail must be paddle (owner, 2026-11-24)")
    tiers = row.get("tiers")
    if "tiers" in row and not (isinstance(tiers, list) and tiers):
        errors.append(f"{where}: `tiers` must be a non-empty list")
    for t in tiers if isinstance(tiers, list) else []:
        label = t.get("name", "?") if isinstance(t, dict) else t
        if not isinstance(t, dict) or not t.get("name") or not t.get("price"):
            errors.append(f"{where}: tier {label!r} needs `name` and `price`")
            continue
        if row.get("stage") not in ("test-paid", "live") and t.get("status") != "proposal":
            errors.append(f"{where}: tier {label!r} must say `status: proposal` until a sale is recorded")
        if t.get("status") == "proposal" and not str(t.get("why") or "").strip():
            errors.append(f"{where}: proposed tier {label!r} needs `why` (its reasoning)")
    drivers = row.get("cost_drivers")
    if "cost_drivers" in row and not (isinstance(drivers, list) and drivers):
        errors.append(f"{where}: `cost_drivers` must be a non-empty list")
    return errors


def queue(data: dict) -> list[dict]:
    """Agent-doable rows, best first: the paid bets in bets.md order, then the
    rest furthest along, then lowest liability.

    The bets come first (owner, 2026-11-24: invest by promise, north star $10k
    MRR). Among the other rows, finishing one product's paid path beats
    starting a second, and a low-liability product beats a high one.
    """
    rows = [
        (i, r) for i, r in enumerate(data.get("products") or [])
        if r.get("stage") != "live" and not r.get("next_owner") and not r.get("parked")
    ]
    rows.sort(key=lambda ir: (
        (0, ir[1]["bet"]) if isinstance(ir[1].get("bet"), int) else (1, 0),
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
    return (f"Monetize ({row_name(r)}, stage {r['stage']}): {' '.join(str(r['next']).split())} "
            "Then move its `stage` and rewrite its `next` in portfolio/monetization/models.yaml.")


def table(data: dict) -> str:
    lines = [f"{'product':28} {'stage':11} {'liability':9} {'next by':7} first offer"]
    for r in data.get("products") or []:
        who = "owner" if r.get("next_owner") else ("parked" if r.get("parked") else "agent")
        lines.append(f"{row_name(r):28} {r['stage']:11} {r['liability']:9} {who:7} {r['first_offer']}")
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
        print(f"Waiting on the owner: {row_name(r)}: {' '.join(str(r['next']).split())}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
