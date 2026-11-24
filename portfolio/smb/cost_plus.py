#!/usr/bin/env python3
"""Cost-plus pricing for the regional SMB suites (portfolio/smb/OFFER.md).

The offer: a suite of software for one kind of local business. Building it is
free (owner, 2026-11-24: "dev fee not necessary"; "free dev service offered at
operating cost plus transparent profit margin"). A shop pays what it costs to
*run* its share, plus a margin shown as its own line. Because one suite serves
every shop in the vertical, the shared running cost (upkeep, rule watching,
platform minimums) is divided across shops. The build cost is the owner's
investment: tracked, recovered from the margin, never billed (`build_payback_months`).
This script does that arithmetic from `cost_basis.yaml`, so a statement, a
pricing page and the $10k MRP gap all come from the same numbers.

Every cost line carries `kind`:
  published   a provider's list price (with source and the date read)
  measured    a reading from our own bills or logs (with source)
  assumption  a stand-in until one of the above exists (with why)
The report prints the share of each price that rests on assumptions, so
nobody mistakes an example for a measurement.

Usage:
  python3 portfolio/smb/cost_plus.py                 # every suite
  python3 portfolio/smb/cost_plus.py --suite <slug>  # one suite, with the curve
  python3 portfolio/smb/cost_plus.py --custom-hours 12   # what free custom work costs us
  python3 portfolio/smb/cost_plus.py --check         # validate both YAML files
"""
from __future__ import annotations

import argparse
import math
import sys
from dataclasses import dataclass
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
COST_BASIS = HERE / "cost_basis.yaml"
VERTICALS = HERE / "verticals.yaml"
KINDS = {"published", "measured", "assumption"}
MRP_GOAL_USD = 10_000  # prompts/goals.md, "North star"


@dataclass(frozen=True)
class Line:
    item: str
    usd: float
    kind: str

    @property
    def assumed(self) -> bool:
        return self.kind == "assumption"


@dataclass(frozen=True)
class Merchant:
    pct: float
    fixed_usd: float

    def gross_up(self, net: float) -> float:
        """Price whose payout after the merchant's fee equals `net`."""
        return (net + self.fixed_usd) / (1 - self.pct)

    def fee(self, price: float) -> float:
        return price * self.pct + self.fixed_usd


@dataclass(frozen=True)
class Quote:
    suite: str
    shops: int
    markup: float
    per_shop_variable: float
    per_shop_shared: float
    price: float
    fee: float
    assumed_share: float  # share of cost (per shop, at `shops`) resting on assumptions

    @property
    def cost(self) -> float:
        return self.per_shop_variable + self.per_shop_shared

    @property
    def margin(self) -> float:
        """Monthly profit per shop after merchant fee and all costs."""
        return self.price - self.fee - self.cost


def _lines(raw: list[dict] | None) -> list[Line]:
    return [Line(str(r["item"]), float(r["usd"]), str(r["kind"])) for r in raw or []]


def load(path: Path = COST_BASIS) -> dict:
    with open(path, encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def merchant_of(basis: dict) -> Merchant:
    m = basis["merchant"]
    return Merchant(float(m["pct"]), float(m["fixed_usd"]))


def suite_costs(basis: dict, slug: str) -> tuple[list[Line], list[Line], list[Line]]:
    """(shared monthly lines, per-shop monthly lines, one-off build lines)."""
    suite = next((s for s in basis["suites"] if s["slug"] == slug), None)
    if suite is None:
        raise KeyError(f"no suite {slug!r} in {COST_BASIS.name}")
    shared = _lines(basis.get("platform_monthly")) + _lines(suite.get("shared_monthly"))
    return shared, _lines(suite.get("per_shop_monthly")), _lines(suite.get("build_once"))


def quote(basis: dict, slug: str, shops: int, markup: float | None = None) -> Quote:
    """Cost-plus monthly price per shop when `shops` shops share the suite."""
    if shops < 1:
        raise ValueError("shops must be at least 1")
    suite = next(s for s in basis["suites"] if s["slug"] == slug)
    mk = float(markup if markup is not None else suite.get("markup", basis["markup"]["default"]))
    if mk < 1:
        raise ValueError("markup below 1.0 prices under cost")
    shared, per_shop, _build = suite_costs(basis, slug)  # build is free to the shop
    shared_total = sum(l.usd for l in shared)
    shared_assumed = sum(l.usd for l in shared if l.assumed)
    variable = sum(l.usd for l in per_shop)
    variable_assumed = sum(l.usd for l in per_shop if l.assumed)
    per_shared = shared_total / shops
    cost = variable + per_shared
    m = merchant_of(basis)
    price = m.gross_up(cost * mk)
    assumed = (variable_assumed + shared_assumed / shops) / cost if cost else 0.0
    return Quote(slug, shops, mk, variable, per_shared, price, m.fee(price), assumed)


def shops_for_mrp(basis: dict, slug: str, price: float, goal: float = MRP_GOAL_USD) -> int | None:
    """Shops needed at a fixed `price` for monthly recurring profit >= goal.

    Fixed costs are the shared running lines; each shop adds its variable cost
    and the merchant fee. The build is not in it: it is recovered separately
    (build_payback_months). None when a shop never pays its way.
    """
    shared, per_shop, _build = suite_costs(basis, slug)
    fixed = sum(l.usd for l in shared)
    contribution = price - merchant_of(basis).fee(price) - sum(l.usd for l in per_shop)
    if contribution <= 0:
        return None
    return max(1, math.ceil((goal + fixed) / contribution))


def build_cost(basis: dict, slug: str) -> float:
    """The suite's one-off build cost: the owner's investment, never billed."""
    return sum(l.usd for l in suite_costs(basis, slug)[2])


def build_payback_months(basis: dict, slug: str, shops: int, markup: float | None = None) -> float | None:
    """Months of margin, at `shops` shops, to recover the free build."""
    margin = quote(basis, slug, shops, markup).margin * shops
    return build_cost(basis, slug) / margin if margin > 0 else None


def custom_work(basis: dict, hours: float) -> dict:
    """What work only one shop needs costs us. Building is free to the shop
    (owner, 2026-11-24: "dev fee not necessary"); only running it is billed,
    at cost plus the margin, through that shop's statement."""
    rate = basis["custom_work"]
    return {"hours": hours, "cost": hours * float(rate["hour_usd"]), "billed": 0.0,
            "rate_kind": rate["kind"]}


# ---------------------------------------------------------------- validation

def check_cost_basis(basis: dict) -> list[str]:
    errs: list[str] = []
    m = basis.get("merchant") or {}
    if not (0 <= float(m.get("pct", -1)) < 1):
        errs.append("merchant.pct must be in [0, 1)")
    for key in ("source", "read"):
        if not m.get(key):
            errs.append(f"merchant.{key} missing")
    if float(basis.get("markup", {}).get("default", 0)) < 1:
        errs.append("markup.default must be >= 1.0 (cost-plus never prices under cost)")

    def lines(where: str, raw: list | None) -> None:
        for i, r in enumerate(raw or []):
            tag = f"{where}[{i}] ({r.get('item', '?')})"
            if r.get("kind") not in KINDS:
                errs.append(f"{tag}: kind must be one of {sorted(KINDS)}")
            if not isinstance(r.get("usd"), (int, float)) or r["usd"] < 0:
                errs.append(f"{tag}: usd must be a number >= 0")
            if r.get("kind") in {"published", "measured"} and not r.get("source"):
                errs.append(f"{tag}: a {r.get('kind')} line needs a source")
            if r.get("kind") == "published" and not r.get("read"):
                errs.append(f"{tag}: a published price needs the date it was read")
            if r.get("kind") == "assumption" and not r.get("why"):
                errs.append(f"{tag}: an assumption needs a why")

    lines("platform_monthly", basis.get("platform_monthly"))
    cw = basis.get("custom_work") or {}
    if cw:
        lines("custom_work", [{"item": "custom_work", "usd": cw.get("hour_usd"), **cw}])
    slugs = set()
    for s in basis.get("suites", []):
        slug = s.get("slug")
        if slug in slugs:
            errs.append(f"duplicate suite {slug}")
        slugs.add(slug)
        for part in ("shared_monthly", "per_shop_monthly", "build_once"):
            lines(f"{slug}.{part}", s.get(part))
        if not s.get("per_shop_monthly"):
            errs.append(f"{slug}: per_shop_monthly is empty; every shop costs something")
    return errs


def check_verticals(rows: list[dict]) -> list[str]:
    errs: list[str] = []
    seen = set()
    for i, v in enumerate(rows or []):
        slug = v.get("slug") or f"#{i}"
        if slug in seen:
            errs.append(f"duplicate vertical {slug}")
        seen.add(slug)
        for key in ("name", "group", "pain_points", "suite_modules", "first_module"):
            if not v.get(key):
                errs.append(f"{slug}: {key} missing")
        for j, p in enumerate(v.get("pain_points") or []):
            ev = p.get("evidence") or []
            if not ev or not all(str(e.get("source", "")).startswith("http") for e in ev):
                errs.append(f"{slug}.pain_points[{j}]: every pain needs evidence with a URL")
        for j, c in enumerate(v.get("compliance") or []):
            if not str(c.get("source", "")).startswith("http"):
                errs.append(f"{slug}.compliance[{j}]: needs a source URL")
        for j, s in enumerate(v.get("software_today") or []):
            if not str(s.get("source", "")).startswith("http"):
                errs.append(f"{slug}.software_today[{j}]: needs a source URL")
    return errs


# ---------------------------------------------------------------- report

def _money(x: float) -> str:
    return f"${x:,.2f}"


def report(basis: dict, slug: str | None, markup: float | None) -> str:
    out: list[str] = []
    suites = [s for s in basis["suites"] if slug in (None, s["slug"])]
    if not suites:
        raise KeyError(f"no suite {slug!r}")
    for s in suites:
        plan = int(s.get("plan_shops", 25))
        q = quote(basis, s["slug"], plan, markup)
        need = shops_for_mrp(basis, s["slug"], q.price)
        out.append(f"{s['slug']}: {s.get('name', '')}")
        out.append(
            f"  at {plan} shops: cost {_money(q.cost)}/shop/mo "
            f"(variable {_money(q.per_shop_variable)} + shared {_money(q.per_shop_shared)}), "
            f"x{q.markup:g} -> price {_money(q.price)}/mo incl. merchant fee {_money(q.fee)}"
        )
        out.append(f"  profit {_money(q.margin)}/shop/mo; "
                   f"{q.assumed_share:.0%} of the cost rests on assumptions")
        out.append(f"  statement: running cost {_money(q.cost)} + margin {_money(q.margin)} "
                   f"+ payment fee {_money(q.fee)} = {_money(q.price)}")
        out.append(f"  shops for ${MRP_GOAL_USD:,} MRP at that price: "
                   f"{need if need else 'never (a shop does not cover its own cost)'}")
        pay = build_payback_months(basis, s["slug"], plan, markup)
        out.append(f"  free build {_money(build_cost(basis, s['slug']))}, recovered from margin in "
                   f"{f'{pay:.0f} months' if pay else 'never'} at {plan} shops")
        if s.get("incumbent"):
            inc = s["incumbent"]
            out.append(f"  incumbent: {inc['name']} {inc['price']} ({inc['source']})")
        if slug:
            out.append("  price as shops join (same markup):")
            for n in (1, 5, 10, 25, 50, 100, 250):
                qq = quote(basis, s["slug"], n, markup)
                out.append(f"    {n:>4} shops  {_money(qq.price):>11}/mo  "
                           f"profit {_money(qq.margin)}/shop  MRP {_money(qq.margin * n)}")
        out.append("")
    return "\n".join(out).rstrip()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--suite")
    ap.add_argument("--markup", type=float)
    ap.add_argument("--custom-hours", type=float)
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args(argv)
    basis = load()
    if a.check:
        errs = check_cost_basis(basis)
        if VERTICALS.exists():
            errs += check_verticals(yaml.safe_load(VERTICALS.read_text(encoding="utf-8")))
        for e in errs:
            print(e, file=sys.stderr)
        print("ok" if not errs else f"{len(errs)} problem(s)")
        return 1 if errs else 0
    if a.custom_hours is not None:
        c = custom_work(basis, a.custom_hours)
        print(f"custom work: {c['hours']:g} h costs us {_money(c['cost'])} (rate is {c['rate_kind']}); "
              f"billed to the shop: {_money(c['billed'])}. Its running cost goes on the statement at cost x markup.")
        return 0
    print(report(basis, a.suite, a.markup))
    return 0


if __name__ == "__main__":
    sys.exit(main())
