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
import json
import re
import sys
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
MODELS = HERE / "models.yaml"
TRANSITION = HERE / "transition.json"

STAGES = ["none", "planned", "built-dark", "test-paid", "live"]
LIABILITY = ["low", "medium", "high"]
REQUIRED = [
    "buyer", "liability", "model", "first_offer",
    "price_hypothesis", "comparables", "stage", "next", "next_owner",
]
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# A `next` that says the agent part is finished. Why: league-schedule-generator
# ("Nothing agent-doable is left until the link is set") and quick-pick-survey
# ("agent steps done. Owner step: ...") kept next_owner: false, so `next`
# named a finished row from 2026-11-07 to 2026-11-24 and no run was sent to a
# product with no paid offer at all (process critique, 2026-11-24).
NO_AGENT_STEP = re.compile(r"\bnothing agent-doable is left\b|\bagent steps (?:are )?done\b", re.I)

# A paid bet (portfolio/monetization/bets.md, 2026-11-24) is named by `app:`
# instead of `venture:`: `apps/<slug>` in this repository, where the paid apps
# moved from private-monorepo on 2026-11-26, or `private-monorepo/apps/<slug>`
# for the one app that stays private (grants holds client-confidential material).
# Its row adds:
APP_PREFIX = "apps/"
PRIVATE_APP_PREFIX = "private-monorepo/apps/"
PRIVATE_APPS = frozenset({"grants"})
BET_REQUIRED = ["bet", "billing", "tiers", "cost_drivers", "rail", "checkout"]
BILLING = ["subscription", "one-off"]
CHECKOUT = ["dark", "live"]

# A public venture's row says how its offer bills, so the North star's metric
# (only subscriptions are MRR, prompts/goals.md) is countable. A row that is
# not a subscription says why in `billing_why`. Why: on 2026-11-24, 8 of 9
# venture rows were one-off packs written before the subscription pivot, and
# nothing in the file said so (backlog P072).
VENTURE_BILLING = ["subscription", "one-off", "none"]

# Payment providers a checkout file can be wired to, by the host it calls.
# Why: the seven dark packs built 2026-11-02..07 call Lemon Squeezy's licence
# validate endpoint, but the owner opened Paddle on 2026-11-24, so their
# "owner: set the checkout link" step could never happen and the rows sat in
# "Waiting on the owner" with an agent step (rewiring to Paddle) unwritten.
PROVIDER_HOSTS = {
    "lemonsqueezy": "lemonsqueezy.com",
    "paddle": "paddle.com",
    "gumroad": "gumroad.com",
    "stripe": "stripe.com",
}
CHECKOUT_FILES = ("checkout.mjs", "checkout.ts", "checkout.js")


def row_name(row: dict, i: int = 0) -> str:
    """`venture` for a public venture's row, `app:<slug>` for a private bet's."""
    if row.get("venture"):
        return str(row["venture"])
    if row.get("app"):
        return "app:" + app_slug(str(row["app"]))
    return f"row {i}"


def app_slug(app: str) -> str:
    """`payapps` from `apps/payapps` or `private-monorepo/apps/grants`; the text unchanged otherwise."""
    for prefix in (PRIVATE_APP_PREFIX, APP_PREFIX):
        if app.startswith(prefix):
            return app[len(prefix):]
    return app


def app_error(app: str, repo: Path | None = None) -> str | None:
    """Why an `app:` value is wrong, or None: `apps/<slug>` here (a directory, when
    `repo` is given), or `private-monorepo/apps/<slug>` for an app that stayed private."""
    slug = app_slug(app)
    if app.startswith(PRIVATE_APP_PREFIX):
        if slug not in PRIVATE_APPS:
            return (f"`app` {app}: only {', '.join(sorted(PRIVATE_APPS))} stays in private-monorepo; "
                    f"the other paid apps moved here, so write {APP_PREFIX}{slug}")
        return None
    if not app.startswith(APP_PREFIX) or not slug or "/" in slug:
        return f"`app` must be {APP_PREFIX}<slug> (or {PRIVATE_APP_PREFIX}grants)"
    if repo is not None and not (repo / "apps" / slug).is_dir():
        return f"`app` {app}: no apps/{slug} directory"
    return None


def load(path: Path = MODELS) -> dict:
    with open(path, encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def checkout_providers(venture_dir: Path) -> set[str]:
    """Providers the venture's checkout file(s) call, by host."""
    found: set[str] = set()
    if not venture_dir.is_dir():
        return found
    for name in CHECKOUT_FILES:
        for f in venture_dir.rglob(name):
            if "node_modules" in f.parts:
                continue
            try:
                text = f.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            found.update(p for p, host in PROVIDER_HOSTS.items() if host in text)
    return found


def check(data: dict, repo: Path = REPO) -> list[str]:
    """Problems with the file, empty when it is valid."""
    errors: list[str] = []
    rail = str((data.get("rail") or {}).get("provider") or "")
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
            errors.extend(check_bet_row(row, where, repo))
        elif not row.get("venture"):
            errors.append(f"{where}: missing `venture` (or `app` for a private bet)")
        elif not (repo / "ventures" / str(name)).is_dir():
            errors.append(f"{where}: no ventures/{name} directory")
        else:
            errors.extend(check_venture_billing(row, where))
            wired = checkout_providers(repo / "ventures" / str(name)) - {rail}
            if rail and wired and row.get("next_owner") is True:
                errors.append(
                    f"{where}: checkout calls {', '.join(sorted(wired))} but the rail is {rail}; "
                    "rewiring it is an agent step, so set next_owner: false and write that step in `next`")
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
        if row.get("next_owner") is False and NO_AGENT_STEP.search(str(row.get("next", ""))):
            errors.append(f"{where}: `next` says no agent step is left; set next_owner: true "
                          "(or write the agent step)")
        if row.get("stage") in ("test-paid", "live") and not row.get("evidence"):
            errors.append(f"{where}: stage {row.get('stage')} needs `evidence` (a file path)")
        ev = row.get("evidence")
        if ev and not (repo / str(ev)).exists():
            errors.append(f"{where}: evidence {ev} does not exist")
    return errors


def check_venture_billing(row: dict, where: str) -> list[str]:
    billing = row.get("billing")
    if billing not in VENTURE_BILLING:
        return [f"{where}: billing must be one of {VENTURE_BILLING}"]
    if billing != "subscription" and not str(row.get("billing_why") or "").strip():
        return [f"{where}: billing {billing} needs `billing_why` (only subscriptions count "
                "toward MRR, prompts/goals.md \"North star\")"]
    return []


def billing_summary(data: dict, proprietary: list[dict]) -> str:
    """P072's metric: for-profit products by how their row bills."""
    rows = {r.get("venture"): r for r in data.get("products") or [] if r.get("venture")}
    sub = reasoned = none = 0
    differ = []
    for p in proprietary:
        r = rows.get(p.get("venture"))
        if r is None:
            none += 1
            continue
        if r.get("billing") == "subscription":
            sub += 1
        else:
            reasoned += 1
        if p.get("model") and r.get("billing") != p.get("model"):
            differ.append(f"{p['venture']} ({r.get('billing')}, planned {p['model']})")
    line = (f"Billing of the {len(proprietary)} for-profit products: {sub} subscription row(s), "
            f"{reasoned} not a subscription with a reason, {none} with no row")
    if differ:
        line += "\nBilling differs from LICENSING_TRANSITION.md's plan: " + ", ".join(differ)
    return line


def check_bet_row(row: dict, where: str, repo: Path | None = None) -> list[str]:
    """A private bet's row: where it is built, how it bills, and proposed tiers
    that say they are proposals until a sale is recorded (no invented prices)."""
    errors = []
    problem = app_error(str(row.get("app")), repo)
    if problem:
        errors.append(f"{where}: {problem}")
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


def load_proprietary(path: Path = TRANSITION) -> list[dict]:
    """The for-profit products of LICENSING_TRANSITION.md, in move order."""
    try:
        with open(path, encoding="utf-8") as fh:
            rows = json.load(fh).get("proprietary") or []
    except (OSError, ValueError):
        return []
    return sorted_proprietary(rows)


def sorted_proprietary(rows: list[dict]) -> list[dict]:
    return sorted(rows, key=lambda r: (r.get("move_order") or 999, r.get("venture", "")))


def gaps(data: dict, proprietary: list[dict]) -> list[dict]:
    """For-profit products with no models.yaml row: no buyer, offer or price yet.

    Why: on 2026-11-24, 12 of the 20 products LICENSING_TRANSITION.md moves to
    paid models had no row, so nothing routed a run to define their paid tier
    (goals.md, "North star": a working paid tier comes first)."""
    have = {r.get("venture") for r in data.get("products") or []}
    return [p for p in proprietary if p.get("venture") not in have]


def owner_rows(data: dict) -> list[dict]:
    return [r for r in data.get("products") or [] if r.get("next_owner")]


def next_task(data: dict, proprietary: list[dict] | None = None) -> str:
    q = queue(data)
    if not q:
        missing = gaps(data, proprietary or [])
        if missing:
            p = missing[0]
            kind = p.get("model") or "paid"
            mrr = (" Only subscriptions count toward MRR (prompts/goals.md, \"North star\"), "
                   "so say in the row why if a one-off fits this buyer better."
                   if kind != "subscription" else "")
            return (f"Monetize ({p['venture']}, no models.yaml row; for-profit product "
                    f"{p.get('move_order', '?')} in LICENSING_TRANSITION.md, planned {kind}): add its row "
                    "to portfolio/monetization/models.yaml (buyer, first paid offer, price hypothesis, "
                    "comparables read from vendors' pricing pages with source and date: README.md, "
                    f"'Adding a product'), then build that offer dark in the product.{mrr} "
                    f"{len(missing) - 1} more for-profit product(s) have no row "
                    "(`monetization.py` lists them).")
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
    proprietary = load_proprietary()
    errors = check(data)
    if args.check or errors:
        for e in errors:
            print(e, file=sys.stderr)
        if args.check:
            print("models.yaml: ok" if not errors else f"models.yaml: {len(errors)} problem(s)")
        return 1 if errors else 0
    if args.command == "next":
        print(next_task(data, proprietary))
        return 0
    print(table(data))
    print(billing_summary(data, proprietary))
    missing = gaps(data, proprietary)
    if missing:
        print(f"No row yet ({len(missing)} for-profit products in LICENSING_TRANSITION.md): "
              + ", ".join(p["venture"] for p in missing))
    print()
    print("Next: " + next_task(data, proprietary))
    for r in owner_rows(data):
        print(f"Waiting on the owner: {row_name(r)}: {' '.join(str(r['next']).split())}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
