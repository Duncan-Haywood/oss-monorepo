#!/usr/bin/env python3
"""Find marketing copy that states a paid plan's price differently from the app's catalog.

Why this exists
---------------
Each paid product sells from one catalog, `ventures/<v>/apps/<app>/src/shared/plans.ts`
(the file the Billing page and Paddle read). Its prices are then retyped by hand into
20 or more places: the marketing site's meta descriptions, `llms.txt`, the README,
`VENTURE.yaml`, the customer posts in `docs/posts/`. On 2026-11-28 PayApps' Crew price
($179) appeared in 19 shipped files. The site's own `plans-sync.test.ts` keeps the
site's plan table in step with the app, but nothing checked the prose. The first
price change would leave pages promising a price checkout does not charge, which is
the "Honest marketing" guardrail in `prompts/goals.md`, and no test written from the
same copy would notice. This script reads the catalog as the source of truth.

What it flags
-------------
A plan is read from each `PLAN_LIST` entry (free ones too, except plans named "Free" or
"Complimentary", words that sit next to dollar figures in ordinary prose): its `name`,
`priceCents` and `annualPriceCents` (a literal, or `annualPriceFor(n)`, computed as
packages/billing does: 12 months at 10% off, rounded to whole dollars). A plan charges
its monthly price, its annual price and the annual price over 12 (e.g. $179.08/mo).

In the product's own files (everything under `ventures/<v>/`, tests, fixtures and
`plans.ts` itself left out) and in posts in `docs/posts/` that name the product, a
dollar figure is a claim about a plan when it sits right next to the plan's name:

    Crew $179            Crew: $179          | Crew    | $179 |
    Crew plan at $179    $179 a month for Crew    $179/month on the Crew plan

A claim whose figure is not one the plan charges is flagged. Longer plan names win
("Shop Plus $399" is about Shop Plus, not Shop). A figure right after "was", "from",
"previously" or "old" is history and skipped; a line checked and intended may carry
`price-claims: ok`, and a superseded document may carry `price-claims: historical` in its first
10 lines to be skipped whole. HTML tags are removed before a line is read.

    python3 platform/ci/check_price_claims.py [--json] [--root DIR]

Exit 0 when nothing is flagged, 1 when a claim disagrees with its catalog.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from repo_files import ls_files  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
ANNUAL_DISCOUNT = 0.1  # packages/billing/src/pricing.ts, ANNUAL_DISCOUNT

# How customer posts name each product (a post is checked when it names it).
POST_NAMES = {
    "payapps": ["PayApps"],
    "jobshop-quote": ["Job Shop Quote"],
    "cmmc": ["CMMC Workspace"],
    "seller-books": ["Seller Books"],
    "einvoice-pro": ["E-invoice Fix", "einvoice-pro"],
}

TEXT_EXT = {".html", ".md", ".txt", ".ts", ".tsx", ".mjs", ".js", ".yaml", ".yml", ".json"}
SKIP_PARTS = {"test", "tests", "fixtures", "migrations", "node_modules", "e2e", "eval"}
WAIVER = "price-claims: ok"
FILE_WAIVER = "price-claims: historical"  # in a file's first 10 lines: skip the file
GENERIC_FREE_NAMES = {"Free", "Complimentary"}
TAG = re.compile(r"<[^>]+>")

MONEY = r"\$(\d{1,3}(?:,\d{3})+|\d+)(\.\d\d)?(?!\d)"
HISTORY = re.compile(r"(?:\bwas|\bfrom|\bpreviously|\bold|\bformerly)\s*$", re.I)
PERIOD = r"(?:\s*/\s*(?:mo|month|yr|year)\b|\s+(?:a|per)\s+(?:month|year)\b)?"


@dataclass
class Plan:
    product: str
    name: str
    monthly_cents: int
    annual_cents: int | None
    source: str

    def charges(self) -> set[int]:
        """Every figure, in cents, this plan honestly appears at."""
        out = {self.monthly_cents}
        if self.annual_cents:
            out.add(self.annual_cents)
            out.add(round(self.annual_cents / 12))
        return out


@dataclass
class Product:
    slug: str
    plans: list[Plan] = field(default_factory=list)


def annual_price_for(cents: int) -> int:
    return round(cents * 12 * (1 - ANNUAL_DISCOUNT) / 100) * 100


def _cents(expr: str) -> int | None:
    expr = expr.strip().rstrip(",")
    if expr == "null":
        return None
    m = re.fullmatch(r"annualPriceFor\(\s*([\d_]+)\s*\)", expr)
    if m:
        return annual_price_for(int(m.group(1).replace("_", "")))
    m = re.fullmatch(r"[\d_]+", expr)
    if m:
        return int(expr.replace("_", ""))
    raise ValueError(f"unreadable price expression: {expr!r}")


def parse_plans(text: str, product: str, source: str) -> list[Plan]:
    """Plans with a price above zero from a plans.ts PLAN_LIST."""
    start = text.find("PLAN_LIST")
    if start < 0:
        return []
    body = text[start:]
    plans = []
    # Each entry has name, then priceCents, then annualPriceCents, in that order.
    pat = re.compile(
        r'\bname:\s*"([^"]+)",.*?\bpriceCents:\s*([^\n]+?)\n.*?\bannualPriceCents:\s*([^\n]+?)\n',
        re.S,
    )
    for m in pat.finditer(body):
        name, price, annual = m.group(1), _cents(m.group(2)), _cents(m.group(3))
        # A free plan is checked too ("Level 1 $39" on a page where Level 1 is free), unless its
        # name is an everyday word that sits next to dollar figures in ordinary prose.
        if price or name not in GENERIC_FREE_NAMES:
            plans.append(Plan(product, name, price, annual, source))
    return plans


def load_products(root: Path) -> list[Product]:
    products = []
    for vdir in sorted((root / "ventures").iterdir()):
        plans = []
        for f in sorted(vdir.glob("apps/*/src/shared/plans.ts")):
            plans += parse_plans(f.read_text(encoding="utf-8"), vdir.name, str(f.relative_to(root)))
        # Two apps in one venture may both carry a catalog; keep each name once (first app wins).
        seen, uniq = set(), []
        for p in plans:
            if p.name not in seen:
                seen.add(p.name)
                uniq.append(p)
        if uniq:
            products.append(Product(vdir.name, uniq))
    return products


def _name_re(name: str) -> str:
    return r"(?<![\w-])" + re.escape(name).replace(r"\ ", r"\s+") + r"(?![\w-])"


def claims(line: str, plans: list[Plan]):
    """(plan, cents, figure text) for each dollar figure stated as a plan's price on a line."""
    taken: list[tuple[int, int]] = []
    for plan in sorted(plans, key=lambda p: -len(p.name)):
        n = _name_re(plan.name)
        after = re.compile(
            n + r"(?:\s+plan)?(?:\s*[:|(—–-]\s*|\s+(?:at|is|costs|for)\s+|\s+)" + MONEY
        )
        before = re.compile(MONEY + PERIOD + r"\s+(?:for|on)\s+(?:the\s+)?" + n)
        for rx, name_first in ((after, True), (before, False)):
            for m in rx.finditer(line):
                # Where the plan name sits inside the match.
                nm = re.search(n, m.group(0))
                ns = (m.start() + nm.start(), m.start() + nm.end())
                if any(a <= ns[0] < b or ns[0] <= a < ns[1] for a, b in taken):
                    continue  # a longer plan name already owns this spot
                money_at = m.start(1) - 1
                if HISTORY.search(line[max(0, money_at - 14):money_at]):
                    continue
                cents = int(m.group(1).replace(",", "")) * 100
                if m.group(2):
                    cents += int(m.group(2)[1:])
                taken.append(ns)
                yield plan, cents, "$" + m.group(1) + (m.group(2) or "")
        # Mark every occurrence of this name as owned, so "Shop" never re-reads "Shop Plus".
        for m in re.finditer(n, line):
            taken.append((m.start(), m.end()))


def _tracked(root: Path, paths: list[str]) -> list[Path]:
    try:
        return [root / p for p in ls_files(root, *paths)]
    except (OSError, subprocess.CalledProcessError):
        files = []
        for p in paths:
            base = root / p
            files += [f for f in base.rglob("*") if f.is_file()] if base.is_dir() else [base]
        return files


def _shipped(path: Path) -> bool:
    if path.suffix not in TEXT_EXT or path.name == "plans.ts":
        return False
    if ".test." in path.name or path.name.endswith(".spec.ts"):
        return False
    return not (SKIP_PARTS & set(path.parts))


def scan(root: Path):
    findings = []
    products = load_products(root)
    posts = [p for p in _tracked(root, ["docs/posts"]) if p.suffix == ".md"]
    for prod in products:
        files = [f for f in _tracked(root, [f"ventures/{prod.slug}"]) if _shipped(f)]
        names = POST_NAMES.get(prod.slug, [])
        for post in posts:
            try:
                text = post.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            if any(n in text for n in names):
                files.append(post)
        for f in files:
            try:
                lines = f.read_text(encoding="utf-8").splitlines()
            except (OSError, UnicodeDecodeError):
                continue
            if any(FILE_WAIVER in ln for ln in lines[:10]):
                continue
            for i, line in enumerate(lines, 1):
                if "$" not in line or WAIVER in line:
                    continue
                # Tags out, so "<h2>Crew</h2><p class="price">$179" reads as "Crew $179".
                for plan, cents, figure in claims(TAG.sub(" ", line), prod.plans):
                    if cents not in plan.charges():
                        findings.append({
                            "file": str(f.relative_to(root)),
                            "line": i,
                            "product": prod.slug,
                            "plan": plan.name,
                            "found": figure,
                            "catalog": sorted(plan.charges()),
                            "source": plan.source,
                            "text": line.strip()[:200],
                        })
    return products, findings


def _usd(cents: int) -> str:
    return f"${cents // 100:,}" + (f".{cents % 100:02d}" if cents % 100 else "")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--root", type=Path, default=ROOT)
    a = ap.parse_args(argv)
    products, findings = scan(a.root)
    if a.json:
        print(json.dumps({"findings": findings}, indent=2))
    else:
        for p in products:
            print(f"{p.slug}: " + ", ".join(
                f"{pl.name} {_usd(pl.monthly_cents)}" + (f"/{_usd(pl.annual_cents)} yr" if pl.annual_cents else "")
                for pl in p.plans))
        for f in findings:
            print(f"{f['file']}:{f['line']}: {f['product']} {f['plan']} stated as {f['found']}, "
                  f"catalog charges {', '.join(_usd(c) for c in f['catalog'])} ({f['source']})")
        print(f"{len(findings)} price claim(s) disagree with their catalog.")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
