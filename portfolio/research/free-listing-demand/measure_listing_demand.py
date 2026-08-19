#!/usr/bin/env python3
"""Measure what a cold, free listing actually gets in the pipeline's candidate categories.

Context
-------
`portfolio/pipeline/channel-inventory.md` (PR #79) argues that "run a probe to a
real buyer" splits into demand measurement (free, no credential) and revenue
capture (needs a payout rail), and recommends publishing a free listing to
measure whether a cold listing from this portfolio gets found at all.

That recommendation rests on an unmeasured assumption: that a free listing in
these categories gets found. This script measures the base rate directly from
the npm registry, which is one of the channels that document lists as
agent-listable at zero cost.

Question
--------
If this portfolio published a free tool into one of the candidate categories
today, what is the realistic distribution of demand it would see?

Method
------
The npm search API returns, per package, monthly/weekly download counts and a
dependent count — enough to characterise a category with no per-package fetches
(full registry documents run to megabytes each and are not needed here).

Three filters define the population, and they matter more than the statistics:

* **Category relevance.** A search hit only counts if the package's *own* name,
  description, or keywords contain a category term. Without this the populations
  fill with incidental keyword matches — a "license compliance report" query
  returns anything whose text mentions a licence.
* **No platform artifacts.** Per-platform binaries (``@img/sharp-linuxmusl-x64``
  and friends) are installed automatically as optional dependencies. They carry
  huge download counts and zero dependents, so they masquerade as spectacularly
  successful independent listings. In an unfiltered run they occupied the entire
  top of the SBOM category.
* **Leaf packages only** (``dependents == 0``). Nothing depends on them, so their
  downloads come from people who found them directly — the situation a product
  listing is in. Packages with dependents are libraries pulled in transitively,
  and their counts measure their parents' popularity.

The headline statistic is **concentration** — what share of a category's demand
goes to its largest listings — because it is the one figure that is unaffected
by mirror and CI traffic inflating the bottom of the distribution, and because
it is what decides whether publishing into a category is worth doing.

Absolute download thresholds are reported alongside it, but deliberately as
fixed values rather than as a derived "background" rate. Estimating that
background from abandoned packages was tried first and rejected: old leaf
packages in these categories still have live users, so the estimate ranged over
three orders of magnitude between categories and was measuring category age
rather than automation.

Usage
-----
    python3 measure_listing_demand.py                 # all categories
    python3 measure_listing_demand.py --category mcp-supply-chain
    python3 measure_listing_demand.py --out results.json

Stdlib only. Read-only against the public npm registry. No credentials.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

SEARCH_URL = "https://registry.npmjs.org/-/v1/search"
PAGE_SIZE = 250
MAX_PAGES = 2  # 500 results per query is well past the point where relevance decays
USER_AGENT = "monorepo-projects-portfolio-research/1.0 (read-only measurement)"

#: The search endpoint rate-limits well below what a tight loop asks for. Pace
#: requests rather than relying on backoff to absorb it.
REQUEST_INTERVAL_SECONDS = 3.0

#: A leaf package published this recently is the closest available analogue to a
#: listing published cold today.
RECENT_MONTHS = 18

#: Reporting thresholds for monthly downloads. These are deliberately absolute
#: rather than derived: an attempt to estimate a "background" rate from abandoned
#: packages was tried first and abandoned, because old leaf packages in these
#: categories still have live users, so the estimate ranged over three orders of
#: magnitude between categories and measured age rather than automation.
THRESHOLDS = (100, 1_000, 10_000, 100_000)

# Categories are the pipeline candidates that channel-inventory.md identifies as
# having a free, agent-reachable channel. `queries` come from the language the
# candidate write-ups themselves use; `terms` is the relevance filter — a hit
# only counts if the package's *own* name, description, or keywords mention the
# category. Without that filter the populations fill up with packages that match
# on incidental keyword overlap (a "license compliance" query surfaces every
# package whose README mentions a licence).
CATEGORIES: dict[str, dict[str, object]] = {
    "sbom-cra-evidence": {
        "candidate": "cra-evidence-desk",
        "queries": [
            "sbom",
            "cyclonedx",
            "spdx",
            "software supply chain security",
            "license compliance report",
            "vulnerability report",
        ],
        "terms": [
            "sbom", "cyclonedx", "spdx", "bill of materials", "supply chain",
            "provenance", "attestation", "vex", "cra ",
        ],
    },
    "mcp-supply-chain": {
        "candidate": "mcp-supply-chain-watch",
        "queries": [
            "model context protocol",
            "mcp server",
            "mcp security",
            "mcp registry",
        ],
        "terms": ["mcp", "model context protocol"],
    },
    "accessibility-evidence": {
        "candidate": "eaa-remediation-pipeline / shopify-a11y-evidence",
        "queries": [
            "accessibility audit",
            "wcag",
            "a11y testing",
            "accessibility report",
            "accessibility scanner",
        ],
        "terms": ["accessib", "a11y", "wcag", "aria", "screen reader", "section 508"],
    },
}

#: Platform-specific build artifacts (`@img/sharp-linuxmusl-x64` and friends) are
#: installed automatically as optional dependencies of a parent package. They
#: record huge download counts and zero dependents, so they look like wildly
#: successful independent listings while never having been discovered by anyone.
#: They would dominate any concentration figure they are left in.
ARTIFACT_MARKERS = (
    "-linux-", "-linuxmusl-", "-darwin-", "-win32-", "-freebsd-", "-android-",
    "-x64", "-arm64", "-ia32", "-armv7", "-s390x", "-ppc64", "-riscv64",
    "-musl", "-gnu", "-glibc", "-msvc", "-wasm32",
)


def is_artifact(name: str) -> bool:
    """True for per-platform binary packages that are never independently found."""
    lowered = name.lower()
    return any(marker in lowered for marker in ARTIFACT_MARKERS)


def is_relevant(row: dict, terms: list[str]) -> bool:
    """True when the package's own metadata places it in the category."""
    haystack = " ".join(
        [row["name"] or "", row["description"], " ".join(row["keywords"])]
    ).lower()
    return any(term in haystack for term in terms)


_last_request_at = 0.0


def fetch(url: str, retries: int = 6) -> dict:
    """GET a JSON document, pacing requests and retrying on 429/5xx."""
    global _last_request_at
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last_error: Exception | None = None
    for attempt in range(retries):
        wait = REQUEST_INTERVAL_SECONDS - (time.monotonic() - _last_request_at)
        if wait > 0:
            time.sleep(wait)
        _last_request_at = time.monotonic()
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.load(response)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as error:
            # A 4xx other than rate-limiting is not going to succeed on retry.
            if isinstance(error, urllib.error.HTTPError) and error.code not in (429, 500, 502, 503, 504):
                raise
            last_error = error
            time.sleep(5 * 2 ** attempt)
    raise RuntimeError(f"giving up on {url}: {last_error}")


def search(query: str) -> list[dict]:
    """Return deduplicated search hits for one query, across up to MAX_PAGES."""
    rows: list[dict] = []
    for page in range(MAX_PAGES):
        params = urllib.parse.urlencode(
            {"text": query, "size": PAGE_SIZE, "from": page * PAGE_SIZE}
        )
        payload = fetch(f"{SEARCH_URL}?{params}")
        objects = payload.get("objects", [])
        if not objects:
            break
        for obj in objects:
            package = obj.get("package", {})
            downloads = obj.get("downloads") or {}
            monthly = downloads.get("monthly")
            if monthly is None:
                continue  # no download data; cannot be used either way
            # `dependents` arrives as a string in the current API response.
            try:
                dependents = int(obj.get("dependents") or 0)
            except (TypeError, ValueError):
                dependents = 0
            rows.append(
                {
                    "name": package.get("name"),
                    "monthly": int(monthly),
                    "weekly": int(downloads.get("weekly") or 0),
                    "dependents": dependents,
                    "last_publish": (package.get("date") or "")[:10],
                    "version": package.get("version"),
                    "description": package.get("description") or "",
                    "keywords": package.get("keywords") or [],
                    "query": query,
                }
            )
        if len(objects) < PAGE_SIZE:
            break
    return rows


def percentiles(values: list[int]) -> dict[str, float | int | None]:
    """Percentile summary of a download distribution."""
    keys = ("n", "p5", "p10", "p25", "median", "p75", "p90", "p95", "p99", "max")
    if not values:
        return {key: None for key in keys}
    ordered = sorted(values)

    def at(fraction: float) -> int:
        index = min(int(fraction * (len(ordered) - 1) + 0.5), len(ordered) - 1)
        return ordered[index]

    return {
        "n": len(ordered),
        "p5": at(0.05),
        "p10": at(0.10),
        "p25": at(0.25),
        "median": at(0.50),
        "p75": at(0.75),
        "p90": at(0.90),
        "p95": at(0.95),
        "p99": at(0.99),
        "max": ordered[-1],
    }


def concentration(values: list[int]) -> dict:
    """How unevenly category demand is split across its listings.

    This is the figure the whole question turns on and, unlike any absolute
    download count, it is unaffected by mirror and CI traffic inflating the
    bottom of the distribution.
    """
    if not values:
        return {"total": 0, "top_1pct_share": None, "top_5pct_share": None,
                "top_10pct_share": None, "packages_for_half_of_demand_pct": None}
    ordered = sorted(values, reverse=True)
    total = sum(ordered)
    count = len(ordered)
    if total == 0:
        return {"total": 0, "top_1pct_share": None, "top_5pct_share": None,
                "top_10pct_share": None, "packages_for_half_of_demand_pct": None}

    def share(fraction: float) -> float:
        take = max(1, int(count * fraction))
        return round(sum(ordered[:take]) / total, 4)

    running = 0
    needed = count
    for index, value in enumerate(ordered, start=1):
        running += value
        if running >= total / 2:
            needed = index
            break

    return {
        "total": total,
        "top_1pct_share": share(0.01),
        "top_5pct_share": share(0.05),
        "top_10pct_share": share(0.10),
        "packages_for_half_of_demand_pct": round(100 * needed / count, 3),
    }


def threshold_shares(values: list[int]) -> dict[str, float | None]:
    """Share of listings clearing each absolute monthly-download threshold."""
    if not values:
        return {f"above_{threshold}": None for threshold in THRESHOLDS}
    return {
        f"above_{threshold}": round(
            sum(1 for value in values if value > threshold) / len(values), 4
        )
        for threshold in THRESHOLDS
    }


def parse_date(value: str) -> datetime | None:
    try:
        return datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


def analyse(rows: list[dict], now: datetime) -> dict:
    """Summarise one category's independently-discoverable listings."""
    recent_after = now - timedelta(days=RECENT_MONTHS * 30.44)

    # Packages with dependents are libraries pulled in transitively; their
    # downloads measure their parents' popularity, not their own discovery.
    leaves = [row for row in rows if row["dependents"] == 0]
    recent_leaves = [
        row
        for row in leaves
        if (published := parse_date(row["last_publish"])) and published >= recent_after
    ]

    def cohort(subset: list[dict], definition: str) -> dict:
        values = [row["monthly"] for row in subset]
        ranked = sorted(values, reverse=True)
        return {
            "definition": definition,
            "distribution": percentiles(values),
            "concentration": concentration(values),
            # Relevance filtering is keyword-based, so a handful of packages that
            # mention a category term incidentally survive it. If the shape of
            # the distribution only holds because of them it is an artefact, so
            # recompute with the largest few removed.
            "concentration_excluding_top_1": concentration(ranked[1:]),
            "concentration_excluding_top_5": concentration(ranked[5:]),
            "threshold_shares": threshold_shares(values),
        }

    return {
        "packages_total": len(rows),
        "leaf_packages": len(leaves),
        "depended_on_packages": len(rows) - len(leaves),
        "all_leaves": cohort(leaves, "packages with zero dependents"),
        "recent_leaves": cohort(
            recent_leaves,
            f"zero-dependent packages published within the last {RECENT_MONTHS} months",
        ),
        "top_leaves": sorted(
            (
                {
                    "name": row["name"],
                    "monthly": row["monthly"],
                    "last_publish": row["last_publish"],
                    "description": row["description"][:110],
                }
                for row in leaves
            ),
            key=lambda row: row["monthly"],
            reverse=True,
        )[:10],
    }


def run(selected: list[str], now: datetime) -> dict:
    results: dict[str, object] = {
        "measured_at": now.isoformat(),
        "method": {
            "source": "npm registry search API (registry.npmjs.org/-/v1/search)",
            "page_size": PAGE_SIZE,
            "max_pages_per_query": MAX_PAGES,
            "recent_months": RECENT_MONTHS,
            "thresholds": list(THRESHOLDS),
            "filters": [
                "package's own name/description/keywords must contain a category term",
                "per-platform binary artifacts excluded",
            ],
        },
        "categories": {},
    }
    for name in selected:
        spec = CATEGORIES[name]
        queries: list[str] = spec["queries"]  # type: ignore[assignment]
        terms: list[str] = spec["terms"]  # type: ignore[assignment]
        print(f"[{name}] {len(queries)} queries", file=sys.stderr)
        by_name: dict[str, dict] = {}
        dropped = {"irrelevant": 0, "artifact": 0}
        for query in queries:
            hits = search(query)
            kept_here = 0
            for row in hits:
                # Keep one row per package; queries overlap heavily.
                if not row["name"] or row["name"] in by_name:
                    continue
                if is_artifact(row["name"]):
                    dropped["artifact"] += 1
                    continue
                if not is_relevant(row, terms):
                    dropped["irrelevant"] += 1
                    continue
                by_name[row["name"]] = row
                kept_here += 1
            print(f"  {query!r}: {len(hits)} hits, {kept_here} new kept", file=sys.stderr)
        rows = list(by_name.values())
        print(
            f"  -> {len(rows)} in category; dropped {dropped['irrelevant']} irrelevant, "
            f"{dropped['artifact']} platform artifacts",
            file=sys.stderr,
        )
        results["categories"][name] = {  # type: ignore[index]
            "candidate": spec["candidate"],
            "queries": queries,
            "terms": terms,
            "dropped": dropped,
            "summary": analyse(rows, now),
            "rows": sorted(rows, key=lambda row: row["monthly"], reverse=True),
        }
    return results


def report(results: dict) -> None:
    for name, block in results["categories"].items():
        summary = block["summary"]
        print(f"\n=== {name}  (candidate: {block['candidate']}) ===")
        print(
            f"  in category {summary['packages_total']}  "
            f"leaf {summary['leaf_packages']}  depended-on {summary['depended_on_packages']}"
        )
        for cohort in ("all_leaves", "recent_leaves"):
            data = summary[cohort]
            dist, conc, shares = data["distribution"], data["concentration"], data["threshold_shares"]
            print(f"  -- {cohort} (n={dist['n']})")
            print(
                f"     p25={dist['p25']:<8} median={dist['median']:<8} "
                f"p75={dist['p75']:<9} p90={dist['p90']:<9} p99={dist['p99']}"
            )
            print(
                f"     top 1%/5%/10% of listings take "
                f"{conc['top_1pct_share']}/{conc['top_5pct_share']}/{conc['top_10pct_share']} "
                f"of demand; half of demand goes to the top "
                f"{conc['packages_for_half_of_demand_pct']}%"
            )
            print(
                "     share above "
                + ", ".join(f"{t:,}/mo: {shares[f'above_{t}']}" for t in THRESHOLDS)
            )
            print(
                "     half-of-demand share excluding top 1 / top 5: "
                f"{data['concentration_excluding_top_1']['packages_for_half_of_demand_pct']}% / "
                f"{data['concentration_excluding_top_5']['packages_for_half_of_demand_pct']}%"
            )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--category", action="append", choices=sorted(CATEGORIES), help="limit to one category (repeatable)")
    parser.add_argument("--out", help="write the full result JSON here")
    args = parser.parse_args()

    selected = args.category or sorted(CATEGORIES)
    results = run(selected, datetime.now(timezone.utc))
    report(results)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as handle:
            json.dump(results, handle, indent=1, sort_keys=True)
        print(f"\nwrote {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
