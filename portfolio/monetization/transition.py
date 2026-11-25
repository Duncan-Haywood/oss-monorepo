#!/usr/bin/env python3
"""Sort every venture into a licence track and a paid model.

Owner, 2026-11-24: "moving the apps to subscription and one off saases",
"as direction transitioning everything that direction moving licenses to more
prop esp for the for profit and non lead magnet ones", model by per-use cost,
"use ur judgement on the way to do it". The reasoning, the legal mechanics and
what a move involves: LICENSING_TRANSITION.md in this directory.

Tracks:
  proprietary   a product: new work continues in the private repository under
                a proprietary licence and is sold as a subscription or a
                one-off licence. What is already published here stays MIT (or
                FSL-1.1-MIT, for anything published after 2026-11-24).
  mit-lead-magnet  a small free tool whose job is to be found and send
                visitors to the products. Stays public, under FSL-1.1-MIT since
                2026-11-24 (the track keeps its old name).
  mit-commons   open hardware, open data and devotional work whose point is
                being open. Stays public, FSL-1.1-MIT.
  mit-deployer-run  the deployer must be the operator (sender of record,
                merchant): stays public (FSL-1.1-MIT) and self-hosted.

Model (proprietary only), by per-use cost:
  subscription  serving a user costs money every month (model calls, a server,
                storage or sync, a data feed we keep current).
  one-off       it runs in the user's browser or machine; a one-off or
                lifetime licence covers it.

Usage:
  python3 portfolio/monetization/transition.py            # summary table
  python3 portfolio/monetization/transition.py --write    # refresh transition.json
  python3 portfolio/monetization/transition.py --check    # transition.json is current
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VENTURES = ROOT / "ventures"
OUT = Path(__file__).with_name("transition.json")

# Lines of non-test source at which a venture reads as a product rather than a
# single-page tool. 5,000 splits the catalogue at 25 ventures; the next band
# down (2,000 to 5,000) is mostly marketplace fee calculators and bid
# calculators, which are lead magnets however long their rule tables are.
DEPTH_PRODUCT = 5000

SOURCE_EXT = (".mjs", ".js", ".cjs", ".ts", ".tsx", ".py", ".rs", ".go")
SKIP_DIRS = {
    "node_modules", "fixtures", "dist", ".git", "test", "tests", "__pycache__",
    "eval", "evals", "samples", "corpus", "vendor",
}
LEAD_MAGNET_SUFFIXES = ("-calculator", "-check", "-checker", "-comparator", "-estimator")

# Judgement calls the rules cannot make, each with its reason. Keep this short:
# a row here is a decision a later run can read and overturn with evidence.
OVERRIDES: dict[str, dict[str, str]] = {
    "sales-agent": {
        "track": "mit-deployer-run",
        "why": "whoever sends the email is the sender of record; it stays on the deployer's own keys (models.yaml)",
    },
    "chant-forge": {
        "track": "mit-commons",
        "why": "devotional music tooling; its value is being freely usable by parishes",
    },
    "ai-bookkeeper": {
        "model": "subscription",
        "why": "holds a business's books, imports bank feeds and calls a model every month",
    },
    "einvoice-preflight": {
        "model": "subscription",
        "why": "60+ countries of e-invoice rules that change every quarter; the cost is keeping them current",
    },
    "local-site-studio": {
        "model": "subscription",
        "why": "hosted sites for local businesses (hosting, domain, edits) are a monthly cost per customer",
    },
    # PR #18757 wrote this row into transition.json by hand, so the stale
    # check (test_committed_json_is_current) went red on main; the decision
    # belongs here, where `--write` reproduces it.
    "photo-editing": {
        "model": "subscription",
        "why": "the cull and pipeline run on the user's machine and stay free; the paid part is hosted proofing galleries, which have a per-user storage cost (models.yaml, 2026-11-25)",
    },
    "changepoint-detector": {
        "model": "one-off",
        "why": "statistics run on the user's own data in the browser or CLI; nothing to serve per user",
    },
}

COMMONS_PREFIXES = ("open-",)

# Products on their way to the private repository ("How one product moves" in
# LICENSING_TRANSITION.md). status "moved": imported (step 2) and the public
# copy frozen as the free edition (step 1); "moving": the free edition is
# frozen and the import is next. `free_tag` is the git tag of the frozen free
# edition; `paid_page` is where the paid edition is announced (in development).
MOVED: dict[str, dict[str, str]] = {
    "wall-framing-takeoff": {
        "status": "moved",
        "where": "private-monorepo apps/wall-framing-takeoff (PR #8, 2026-11-24)",
        "free_tag": "wall-framing-takeoff-free-v1",
        "paid_page": "https://marisstella.app/industries/construction/",
    },
    "einvoice-preflight": {
        "status": "moving",
        "where": "free edition frozen 2026-11-24; import to private-monorepo apps/einvoice-preflight is next",
        "free_tag": "einvoice-preflight-free-v1",
        "paid_page": "https://marisstella.app/industries/e-invoicing/",
    },
}
MOVE_STATUSES = ("moving", "moved")
# Both free editions freeze main at cf0b6311f (2026-11-24). The session that
# froze them could not push tags (HTTP 403), so the tags are the owner's to
# create, once:
#   git tag wall-framing-takeoff-free-v1 cf0b6311f
#   git tag einvoice-preflight-free-v1 cf0b6311f
#   git push origin wall-framing-takeoff-free-v1 einvoice-preflight-free-v1
FREE_EDITION_COMMIT = "cf0b6311f"

SUBSCRIPTION_FILE = re.compile(r"(^|[-_])(server|api|sync|wrangler)([-_.]|$)|^wrangler\.", re.I)
SUBSCRIPTION_TEXT = re.compile(
    r"\bAI[- ](first|enhance|assisted|powered)|\bLLM\b|@anthropic-ai/sdk|\bhosted\b|\bmarketplace\b|\bbank feed",
    re.I,
)
THIRD_PARTY_LICENCE = re.compile(r"^(LICEN[CS]E|COPYING)([-_.].*)?$", re.I)


def source_lines(venture: Path) -> int:
    total = 0
    for root, dirs, files in os.walk(venture):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            if not name.endswith(SOURCE_EXT):
                continue
            if "test" in name or "fuzz" in name or "bench" in name:
                continue
            try:
                with open(os.path.join(root, name), errors="ignore") as fh:
                    total += sum(1 for _ in fh)
            except OSError:
                pass
    return total


def nested_licences(venture: Path) -> list[str]:
    """Licence files below the venture's own root: code or data under someone
    else's terms that a proprietary build must not ship without checking."""
    found = []
    for root, dirs, files in os.walk(venture):
        dirs[:] = [d for d in dirs if d not in {"node_modules", ".git"}]
        if Path(root) == venture:
            continue
        for name in files:
            if THIRD_PARTY_LICENCE.match(name) and not name.endswith(SOURCE_EXT):
                found.append(str(Path(root, name).relative_to(ROOT)))
    return sorted(found)


def read_list(path: Path, key: str) -> list[str]:
    if not path.exists():
        return []
    pat = re.compile(rf"^\s*-\s*{key}:\s*(\S+)")
    return [m.group(1) for line in path.read_text().splitlines() if (m := pat.match(line))]


def description(venture: Path) -> str:
    vy = venture / "VENTURE.yaml"
    if not vy.exists():
        return ""
    text = vy.read_text(errors="ignore")
    m = re.search(r"^description:\s*(>-?\s*\n((?:\s+.*\n)+)|(.*))", text, re.M)
    if not m:
        return ""
    body = m.group(2) or m.group(3) or ""
    return " ".join(body.split()).strip("\"'")


def pick_model(slug: str, venture: Path, desc: str) -> tuple[str, str]:
    if slug in OVERRIDES and "model" in OVERRIDES[slug]:
        return OVERRIDES[slug]["model"], OVERRIDES[slug]["why"]
    for name in sorted(os.listdir(venture)):
        if SUBSCRIPTION_FILE.search(name):
            return "subscription", f"runs a server-side part ({name}): a monthly cost per user"
    m = SUBSCRIPTION_TEXT.search(desc)
    if m:
        return "subscription", f"description names an ongoing per-user cost ({m.group(0)!r})"
    return "one-off", "runs in the user's browser or machine; no per-user cost to serve"


def classify(slug: str, venture: Path, flagships: list[str], paid_rows: list[str]) -> dict:
    lines = source_lines(venture)
    desc = description(venture)
    rec: dict = {"venture": slug, "source_lines": lines}
    ov = OVERRIDES.get(slug, {})
    if "track" in ov:
        rec.update(track=ov["track"], why=ov["why"])
    elif slug.startswith(COMMONS_PREFIXES):
        rec.update(track="mit-commons", why="an open project by name (open hardware or open data)")
    elif slug in flagships:
        rec.update(track="proprietary", why=f"flagship #{flagships.index(slug) + 1}: the depth people pay for")
    elif slug in paid_rows:
        rec.update(track="proprietary", why="has a paid model in models.yaml")
    elif lines >= DEPTH_PRODUCT and not slug.endswith(LEAD_MAGNET_SUFFIXES):
        rec.update(track="proprietary", why=f"over {DEPTH_PRODUCT} lines of product code, more than a single-page tool")
    else:
        rec.update(track="mit-lead-magnet", why="single-purpose free tool: its job is to be found")
    if rec["track"] == "proprietary":
        rec["model"], rec["model_why"] = pick_model(slug, venture, desc)
        rec["third_party_licences"] = nested_licences(venture)
        rec["moved"] = MOVED.get(slug)
        rec["priority"] = (flagships.index(slug) if slug in flagships else 100) * 1_000_000 - lines
    return rec


def build() -> dict:
    flagships = read_list(ROOT / "portfolio/flagships.yaml", "venture")
    paid_rows = read_list(ROOT / "portfolio/monetization/models.yaml", "venture")
    records = []
    for venture in sorted(p for p in VENTURES.iterdir() if p.is_dir()):
        if not (venture / "VENTURE.yaml").exists() and not (venture / "README.md").exists():
            continue
        records.append(classify(venture.name, venture, flagships, paid_rows))
    products = sorted((r for r in records if r["track"] == "proprietary"), key=lambda r: r["priority"])
    for i, r in enumerate(products, 1):
        r["move_order"] = i
        del r["priority"]
    counts: dict[str, int] = {}
    for r in records:
        counts[r["track"]] = counts.get(r["track"], 0) + 1
    models = {m: sum(1 for r in products if r["model"] == m) for m in ("subscription", "one-off")}
    return {
        "generated_by": "portfolio/monetization/transition.py",
        "depth_product_lines": DEPTH_PRODUCT,
        "counts": dict(sorted(counts.items())),
        "models": models,
        "proprietary": products,
        "stay_mit": {
            t: sorted(r["venture"] for r in records if r["track"] == t)
            for t in ("mit-commons", "mit-deployer-run")
        },
        "lead_magnets": counts.get("mit-lead-magnet", 0),
    }


def decisions(data: dict) -> dict:
    """`data` without the line counts, which every product PR moves. The
    stale check compares this, so the committed file goes stale when a track,
    model or move order changes, not when a flagship gains a line. Why: in its
    first day on main (2026-11-23..24) transition.json was rewritten by four
    unrelated venture PRs (#18553, #18558, #18562, #18566) and main_health
    still found it red, each time for photo-editing's source_lines alone."""
    out = json.loads(json.dumps(data))
    for r in out["proprietary"]:
        r.pop("source_lines", None)
    return out


def render(data: dict) -> str:
    out = [f"tracks: {data['counts']}", f"proprietary models: {data['models']}", ""]
    out.append(f"{'#':>3}  {'venture':32} {'model':12} {'lines':>6}  licences  why")
    for r in data["proprietary"]:
        lic = len(r["third_party_licences"])
        out.append(f"{r['move_order']:>3}  {r['venture']:32} {r['model']:12} {r['source_lines']:>6}  {lic:>8}  {r['model_why']}")
    for t, slugs in data["stay_mit"].items():
        out.append(f"\n{t}: {', '.join(slugs)}")
    return "\n".join(out)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--write", action="store_true", help="refresh transition.json")
    ap.add_argument("--check", action="store_true", help="exit 1 if transition.json is stale")
    ap.add_argument("--json", action="store_true", help="print the JSON")
    args = ap.parse_args(argv)
    data = build()
    text = json.dumps(data, indent=2) + "\n"
    if args.write:
        OUT.write_text(text)
        print(f"wrote {OUT.relative_to(ROOT)}")
        return 0
    if args.check:
        if not OUT.exists() or decisions(json.loads(OUT.read_text())) != decisions(data):
            print("transition.json is stale: run transition.py --write", file=sys.stderr)
            return 1
        return 0
    print(text if args.json else render(data))
    return 0


if __name__ == "__main__":
    sys.exit(main())
