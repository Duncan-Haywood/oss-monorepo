#!/usr/bin/env python3
"""Replicate the npm concentration finding on two other free, agent-reachable registries.

Context
-------
`measure_listing_demand.py` measured what a cold free listing gets in the
pipeline's candidate categories, on npm, and found the load-bearing result:
demand is concentrated so far past the point where a probe is informative that
publishing a listing cannot move the distribution score either way. Its own
"What this does not show" section names the limitation that matters most:

    **npm only.** WordPress.org, Open VSX, and GitHub Marketplace are the other
    free agent-listable channels [...] WordPress.org in particular has a
    different buyer (site owners, many of them businesses) and may well behave
    differently; nothing here refutes that.

That caveat is doing real work downstream. The pipeline's newest ask (Ask 7 on
issue #139 — read-only egress for `api.wordpress.org`) is justified by the claim
that WordPress.org's buyer behaves differently enough to move modelled revenue
from $16-$145/month to roughly $980/month. WordPress.org is unreachable from
this environment, so that claim cannot be tested directly.

It can be bounded indirectly. If the concentration shape is a property of *npm*,
the WordPress.org hypothesis is open. If the same shape appears on independent
registries with different languages, different ages, and different buyers, then
it is a property of free listing channels generally, and a channel change is not
what rescues the free-listing probe.

Question
--------
Does the npm concentration finding replicate on other registries that are
reachable from this environment with no egress change and no credential?

Method
------
Same categories, same relevance filter, same statistics as the npm run — the
percentile, concentration, and threshold functions are imported from
`measure_listing_demand` rather than reimplemented, so the numbers are directly
comparable and cannot drift apart.

Two registries, chosen because they are reachable read-only from here and
because they widen the buyer, not just the sample:

* **Packagist** (PHP). The closest reachable proxy to WordPress.org's buyer:
  WordPress is PHP, and the agencies and site builders who install WordPress
  plugins are the same population that installs Composer packages. Packagist
  also publishes a per-package ``dependents`` count, so the npm run's leaf
  filter is reproducible exactly, and ``favers`` (stars), which is a *human*
  action rather than a download and so is immune to the CI-traffic critique
  that the npm write-up flags against its own absolute counts.
* **RubyGems** (Ruby). An independent check on a mature registry with a
  developer buyer. It publishes no dependent count through its search API, so
  its population cannot be restricted to leaves; its figures are reported for
  the whole category and labelled accordingly.

Both are among the registries `portfolio/research/registry-audience-match/`
(via PR #166) already established are publishable end to end with no egress
change, so nothing here depends on an ask that is still open.

Usage
-----
    python3 measure_registry_concentration.py --out results.json
    python3 measure_registry_concentration.py --registry packagist
    python3 measure_registry_concentration.py --category mcp-supply-chain

Stdlib only. Read-only against public registry APIs. No credentials, no writes,
no account.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from measure_listing_demand import (
    CATEGORIES,
    THRESHOLDS,
    concentration,
    percentiles,
    threshold_shares,
)

USER_AGENT = "monorepo-projects-portfolio-research/1.0 (read-only measurement)"

PACKAGIST_SEARCH = "https://packagist.org/search.json"
PACKAGIST_DETAIL = "https://packagist.org/packages/{name}.json"
RUBYGEMS_SEARCH = "https://rubygems.org/api/v1/search.json"

#: Packagist search is loose — "sbom" alone reports over 3,000 hits — so the
#: relevance filter, not the page count, is what defines the population. Five
#: pages per query is well past the point where search relevance decays.
PACKAGIST_PAGE_SIZE = 100
PACKAGIST_MAX_PAGES = 5

#: RubyGems paginates at 30 and returns an empty page once exhausted.
RUBYGEMS_MAX_PAGES = 10

#: A detail fetch per package is needed on Packagist for `dependents` and
#: monthly downloads. This bounds a category that turns out to be far larger
#: than expected; a run that hits the cap says so in its output rather than
#: silently reporting a truncated population.
MAX_DETAIL_FETCHES = 900

#: Anonymous read pacing. Neither API documents a hard anonymous limit; these
#: are deliberately conservative, since the whole point is to be a well-behaved
#: guest on a registry this portfolio may later want to publish to.
INTERVALS = {"packagist": 0.7, "rubygems": 1.5}

_last_request_at = 0.0


def fetch(url: str, interval: float, retries: int = 5) -> dict | list:
    """GET a JSON document, pacing requests and retrying on 429/5xx."""
    global _last_request_at
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last_error: Exception | None = None
    for attempt in range(retries):
        wait = interval - (time.monotonic() - _last_request_at)
        if wait > 0:
            time.sleep(wait)
        _last_request_at = time.monotonic()
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.load(response)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as error:
            if isinstance(error, urllib.error.HTTPError) and error.code not in (
                429, 500, 502, 503, 504,
            ):
                raise
            last_error = error
            time.sleep(5 * 2 ** attempt)
    raise RuntimeError(f"giving up on {url}: {last_error}")


def is_relevant(haystack: str, terms: list[str]) -> bool:
    """True when the package's own metadata places it in the category.

    Same rule as the npm run: a search hit only counts if the package's own
    name and description mention a category term. Without it the populations
    fill with incidental keyword overlap.
    """
    lowered = haystack.lower()
    return any(term in lowered for term in terms)


# --------------------------------------------------------------------------
# Packagist
# --------------------------------------------------------------------------


def packagist_search(query: str, terms: list[str]) -> tuple[dict[str, dict], int]:
    """Return relevant search hits for one query, keyed by package name."""
    kept: dict[str, dict] = {}
    dropped = 0
    for page in range(1, PACKAGIST_MAX_PAGES + 1):
        params = urllib.parse.urlencode(
            {"q": query, "per_page": PACKAGIST_PAGE_SIZE, "page": page}
        )
        payload = fetch(f"{PACKAGIST_SEARCH}?{params}", INTERVALS["packagist"])
        results = payload.get("results", []) if isinstance(payload, dict) else []
        if not results:
            break
        for row in results:
            name = row.get("name")
            if not name:
                continue
            if not is_relevant(f"{name} {row.get('description') or ''}", terms):
                dropped += 1
                continue
            kept.setdefault(name, {"name": name, "description": row.get("description") or "", "query": query})
        if len(results) < PACKAGIST_PAGE_SIZE:
            break
    return kept, dropped


def packagist_detail(name: str) -> dict | None:
    """Per-package downloads, dependents and stars.

    The search endpoint reports lifetime downloads only. Monthly downloads and
    the dependent count — the two figures the npm methodology needs — are on
    the package document.
    """
    try:
        payload = fetch(PACKAGIST_DETAIL.format(name=name), INTERVALS["packagist"])
    except urllib.error.HTTPError:
        return None  # deleted or renamed between search and fetch
    package = payload.get("package", {}) if isinstance(payload, dict) else {}
    if not package:
        return None
    downloads = package.get("downloads") or {}
    return {
        "monthly": int(downloads.get("monthly") or 0),
        "total": int(downloads.get("total") or 0),
        "dependents": int(package.get("dependents") or 0),
        "favers": int(package.get("favers") or 0),
        "last_publish": (package.get("time") or "")[:10],
        "abandoned": bool(package.get("abandoned")),
    }


def collect_packagist(spec: dict, label: str) -> dict:
    terms: list[str] = spec["terms"]  # type: ignore[assignment]
    queries: list[str] = spec["queries"]  # type: ignore[assignment]
    candidates: dict[str, dict] = {}
    dropped_irrelevant = 0
    for query in queries:
        found, dropped = packagist_search(query, terms)
        dropped_irrelevant += dropped
        new = 0
        for name, row in found.items():
            if name not in candidates:
                candidates[name] = row
                new += 1
        print(f"  [packagist/{label}] {query!r}: {new} new kept", file=sys.stderr)

    names = sorted(candidates)
    truncated = len(names) > MAX_DETAIL_FETCHES
    if truncated:
        names = names[:MAX_DETAIL_FETCHES]

    rows: list[dict] = []
    for index, name in enumerate(names, start=1):
        detail = packagist_detail(name)
        if detail is None:
            continue
        rows.append({**candidates[name], **detail})
        if index % 50 == 0:
            print(f"  [packagist/{label}] detail {index}/{len(names)}", file=sys.stderr)
    return {
        "rows": rows,
        "dropped_irrelevant": dropped_irrelevant,
        "truncated_at": MAX_DETAIL_FETCHES if truncated else None,
    }


# --------------------------------------------------------------------------
# RubyGems
# --------------------------------------------------------------------------


def collect_rubygems(spec: dict, label: str) -> dict:
    terms: list[str] = spec["terms"]  # type: ignore[assignment]
    queries: list[str] = spec["queries"]  # type: ignore[assignment]
    candidates: dict[str, dict] = {}
    dropped_irrelevant = 0
    for query in queries:
        new = 0
        for page in range(1, RUBYGEMS_MAX_PAGES + 1):
            params = urllib.parse.urlencode({"query": query, "page": page})
            payload = fetch(f"{RUBYGEMS_SEARCH}?{params}", INTERVALS["rubygems"])
            gems = payload if isinstance(payload, list) else []
            if not gems:
                break
            for gem in gems:
                name = gem.get("name")
                if not name or name in candidates:
                    continue
                if not is_relevant(f"{name} {gem.get('info') or ''}", terms):
                    dropped_irrelevant += 1
                    continue
                candidates[name] = {
                    "name": name,
                    "description": (gem.get("info") or "")[:200],
                    "total": int(gem.get("downloads") or 0),
                    "version_downloads": int(gem.get("version_downloads") or 0),
                    "query": query,
                }
                new += 1
        print(f"  [rubygems/{label}] {query!r}: {new} new kept", file=sys.stderr)
    return {
        "rows": sorted(candidates.values(), key=lambda row: row["total"], reverse=True),
        "dropped_irrelevant": dropped_irrelevant,
        "truncated_at": None,
    }


# --------------------------------------------------------------------------
# Analysis
# --------------------------------------------------------------------------


def cohort(values: list[int], definition: str) -> dict:
    """One population's shape, using the npm run's own statistics."""
    ranked = sorted(values, reverse=True)
    return {
        "definition": definition,
        "distribution": percentiles(values),
        "concentration": concentration(values),
        # Keyword relevance filtering is imperfect, so a few incidental matches
        # survive. If the shape only holds because of them it is an artefact.
        "concentration_excluding_top_1": concentration(ranked[1:]),
        "concentration_excluding_top_5": concentration(ranked[5:]),
        "threshold_shares": threshold_shares(values),
    }


def analyse_packagist(rows: list[dict]) -> dict:
    leaves = [row for row in rows if row["dependents"] == 0]
    return {
        "packages_total": len(rows),
        "leaf_packages": len(leaves),
        "depended_on_packages": len(rows) - len(leaves),
        "all_leaves": cohort(
            [row["monthly"] for row in leaves],
            "monthly downloads, packages with zero dependents",
        ),
        # Stars are a human action, not a download, so they cannot be inflated
        # by CI or mirror traffic. If concentration holds here too, the npm
        # finding does not depend on downloads being a good adoption proxy.
        "all_leaves_by_favers": cohort(
            [row["favers"] for row in leaves],
            "stars (favers), packages with zero dependents",
        ),
        "top_leaves": sorted(
            (
                {
                    "name": row["name"],
                    "monthly": row["monthly"],
                    "favers": row["favers"],
                    "last_publish": row.get("last_publish", ""),
                    "description": row["description"][:110],
                }
                for row in leaves
            ),
            key=lambda row: row["monthly"],
            reverse=True,
        )[:10],
    }


def analyse_rubygems(rows: list[dict]) -> dict:
    return {
        "packages_total": len(rows),
        "leaf_packages": None,  # RubyGems' search API exposes no dependent count
        "depended_on_packages": None,
        "all_packages": cohort(
            [row["total"] for row in rows],
            "lifetime downloads, all in-category gems (no leaf filter available)",
        ),
        "top_packages": [
            {
                "name": row["name"],
                "total": row["total"],
                "description": row["description"][:110],
            }
            for row in rows[:10]
        ],
    }


COLLECTORS = {
    "packagist": (collect_packagist, analyse_packagist),
    "rubygems": (collect_rubygems, analyse_rubygems),
}


def run(registries: list[str], categories: list[str], now: datetime) -> dict:
    results: dict[str, object] = {
        "measured_at": now.isoformat(),
        "method": {
            "purpose": (
                "Test whether measure_listing_demand.py's npm concentration finding "
                "is a property of npm or of free listing channels generally."
            ),
            "statistics": "imported from measure_listing_demand.py, unmodified",
            "categories_from": "measure_listing_demand.CATEGORIES",
            "thresholds": list(THRESHOLDS),
            "sources": {
                "packagist": (
                    "packagist.org/search.json + packagist.org/packages/{name}.json "
                    "(monthly downloads, dependents, favers)"
                ),
                "rubygems": (
                    "rubygems.org/api/v1/search.json (lifetime downloads; no "
                    "dependent count is exposed, so no leaf filter is possible)"
                ),
            },
            "filters": [
                "package's own name/description must contain a category term",
            ],
        },
        "registries": {},
    }
    for registry in registries:
        collect, analyse = COLLECTORS[registry]
        block: dict[str, object] = {}
        for name in categories:
            spec = CATEGORIES[name]
            print(f"[{registry}] {name}", file=sys.stderr)
            collected = collect(spec, name)
            rows = collected["rows"]
            print(
                f"  -> {len(rows)} in category; dropped "
                f"{collected['dropped_irrelevant']} irrelevant",
                file=sys.stderr,
            )
            block[name] = {
                "candidate": spec["candidate"],
                "queries": spec["queries"],
                "dropped_irrelevant": collected["dropped_irrelevant"],
                "truncated_at": collected["truncated_at"],
                "summary": analyse(rows),
                "rows": rows,
            }
        results["registries"][registry] = block  # type: ignore[index]
    return results


def report(results: dict) -> None:
    for registry, categories in results["registries"].items():
        for name, block in categories.items():
            summary = block["summary"]
            print(f"\n=== {registry} / {name}  (candidate: {block['candidate']}) ===")
            print(f"  in category {summary['packages_total']}  leaf {summary['leaf_packages']}")
            if block["truncated_at"]:
                print(f"  !! population truncated at {block['truncated_at']} detail fetches")
            for key, data in summary.items():
                if not isinstance(data, dict) or "concentration" not in data:
                    continue
                dist, conc = data["distribution"], data["concentration"]
                if not dist["n"]:
                    continue
                print(f"  -- {key} (n={dist['n']}): {data['definition']}")
                print(
                    f"     p25={dist['p25']:<8} median={dist['median']:<8} "
                    f"p75={dist['p75']:<9} p90={dist['p90']:<9} p99={dist['p99']}"
                )
                print(
                    f"     top 1%/5%/10% take "
                    f"{conc['top_1pct_share']}/{conc['top_5pct_share']}/{conc['top_10pct_share']}"
                    f"; half of demand goes to the top "
                    f"{conc['packages_for_half_of_demand_pct']}%"
                )
                print(
                    "     half-of-demand share excluding top 1 / top 5: "
                    f"{data['concentration_excluding_top_1']['packages_for_half_of_demand_pct']}% / "
                    f"{data['concentration_excluding_top_5']['packages_for_half_of_demand_pct']}%"
                )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--registry", action="append", choices=sorted(COLLECTORS),
        help="limit to one registry (repeatable)",
    )
    parser.add_argument(
        "--category", action="append", choices=sorted(CATEGORIES),
        help="limit to one category (repeatable)",
    )
    parser.add_argument("--out", help="write the full result JSON here")
    args = parser.parse_args()

    results = run(
        args.registry or sorted(COLLECTORS),
        args.category or sorted(CATEGORIES),
        datetime.now(timezone.utc),
    )
    report(results)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as handle:
            json.dump(results, handle, indent=1, sort_keys=True)
        print(f"\nwrote {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
