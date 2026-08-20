#!/usr/bin/env python3
"""Measure whether the listings that get found belong to publishers who already had an audience.

Context
-------
`portfolio/research/free-listing-demand/` measured what a cold free listing gets
in this portfolio's candidate categories and found demand is concentrated so far
into the top few percent that publishing one is underpowered as an experiment.
It closed on a claim it did not test:

    "on these channels, publishing is not distribution ... the scarce thing to
    spend an approval on is a referral path, not a listing."

That is an assertion about *why* the top of the distribution is the top. This
script tests it on the one attribute of a referral path that is measurable from
a public API with no credentials: **does the publisher already have an
audience?**

Question
--------
Among leaf listings (nothing depends on them, so their downloads come from
people who found them directly), what share of the ones that get found are
published by someone who had no other package of any size — a genuinely cold
publisher, which is what this portfolio would be?

That share is the realistic ceiling for a cold entrant, and unlike the download
medians in the prior study it discriminates: if cold publishers are common in
the top decile, a listing can create its own demand and the prior study's
conclusion is too pessimistic. If they are rare, the audience precedes the
listing and no amount of listing work substitutes for one.

Method
------
Same three categories, same queries, same relevance and artifact filters, and
the same leaf definition as `measure_listing_demand.py`, so the populations are
comparable. Two things are added:

* **Maintainer capture.** The prior run discarded the ``maintainers`` field the
  search API already returns. It is what makes this study possible.
* **Publisher portfolios.** For a stratified sample of leaf packages, every
  distinct maintainer is looked up with ``maintainer:<username>`` and their
  whole published portfolio is retrieved with download counts. A publisher's
  *audience* is the largest monthly download count among their packages
  **other than** the sampled one.

Two strata are compared:

* **found** — the top decile of leaf listings by monthly downloads.
* **baseline** — a seeded random sample from the rest of the leaves.

Honest limits, stated here because they bound what the result means
-------------------------------------------------------------------
* **Association, not precedence.** Portfolio download counts are current, not
  as-of the sampled package's first publish. A maintainer whose big package
  came *after* the sampled one is counted as having an audience. So this
  measures co-occurrence between having an audience and being found, and
  over-states the "audience came first" reading. It bounds the cold-publisher
  share from above, which is the direction that matters: if even this generous
  measure finds few cold publishers at the top, the stricter one finds fewer.
* **npm only**, like the prior study. The other free channels in
  `channel-inventory.md` publish no comparable per-listing figure.
* **Downloads are not users.** A download is as often a CI run as a person.

Usage
-----
    python3 measure_publisher_audience.py --out results.json
    python3 measure_publisher_audience.py --category sbom-cra-evidence
    python3 measure_publisher_audience.py --baseline-sample 40

Stdlib only. Read-only against the public npm registry. No credentials.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

SEARCH_URL = "https://registry.npmjs.org/-/v1/search"
PAGE_SIZE = 250
MAX_PAGES = 2
USER_AGENT = "monorepo-projects-portfolio-research/1.0 (read-only measurement)"

#: The search endpoint rate-limits well below what a tight loop asks for. The
#: prior study established this pacing; keep it.
REQUEST_INTERVAL_SECONDS = 3.0

#: Audience thresholds, in monthly downloads of a publisher's *other* packages.
#: Reported at several levels because the answer should not depend on one line.
AUDIENCE_THRESHOLDS = (100, 1_000, 10_000, 100_000)

#: Seeded so the baseline sample is reproducible from the committed results.
RANDOM_SEED = 20260819

#: Category definitions are copied verbatim from
#: free-listing-demand/measure_listing_demand.py so the two studies measure the
#: same populations. Changing one without the other invalidates the comparison.
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

ARTIFACT_MARKERS = (
    "-linux-", "-linuxmusl-", "-darwin-", "-win32-", "-freebsd-", "-android-",
    "-x64", "-arm64", "-ia32", "-armv7", "-s390x", "-ppc64", "-riscv64",
    "-musl", "-gnu", "-glibc", "-msvc", "-wasm32",
)


def is_artifact(name: str) -> bool:
    """True for per-platform binary packages that are never independently found."""
    lowered = (name or "").lower()
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
            if isinstance(error, urllib.error.HTTPError) and error.code not in (
                429, 500, 502, 503, 504
            ):
                raise
            last_error = error
            time.sleep(5 * 2 ** attempt)
    raise RuntimeError(f"giving up on {url}: {last_error}")


def _row_from_object(obj: dict) -> dict | None:
    """Normalise one search hit, or None when it carries no download data."""
    package = obj.get("package", {})
    downloads = obj.get("downloads") or {}
    monthly = downloads.get("monthly")
    if monthly is None:
        return None
    try:
        dependents = int(obj.get("dependents") or 0)
    except (TypeError, ValueError):
        dependents = 0
    maintainers = [
        m.get("username")
        for m in (package.get("maintainers") or [])
        if m.get("username")
    ]
    return {
        "name": package.get("name"),
        "monthly": int(monthly),
        "dependents": dependents,
        "last_publish": (package.get("date") or "")[:10],
        "description": package.get("description") or "",
        "keywords": package.get("keywords") or [],
        "maintainers": maintainers,
        "links": package.get("links") or {},
    }


def search(query: str, max_pages: int = MAX_PAGES) -> list[dict]:
    """Return deduplicated, normalised search hits for one query."""
    rows: list[dict] = []
    for page in range(max_pages):
        params = urllib.parse.urlencode(
            {"text": query, "size": PAGE_SIZE, "from": page * PAGE_SIZE}
        )
        payload = fetch(f"{SEARCH_URL}?{params}")
        objects = payload.get("objects", [])
        if not objects:
            break
        for obj in objects:
            row = _row_from_object(obj)
            if row and row["name"]:
                rows.append(row)
        if len(objects) < PAGE_SIZE:
            break
    return rows


def collect_leaves(category: str, spec: dict) -> list[dict]:
    """Every leaf package in one category, with maintainers attached."""
    seen: dict[str, dict] = {}
    dropped = {"irrelevant": 0, "artifact": 0}
    for query in spec["queries"]:
        for row in search(query):
            name = row["name"]
            if name in seen:
                continue
            if is_artifact(name):
                dropped["artifact"] += 1
                continue
            if not is_relevant(row, spec["terms"]):
                dropped["irrelevant"] += 1
                continue
            row["query"] = query
            seen[name] = row
    leaves = [r for r in seen.values() if r["dependents"] == 0]
    leaves.sort(key=lambda r: r["monthly"], reverse=True)
    print(
        f"  {category}: {len(seen)} relevant, {len(leaves)} leaves "
        f"(dropped {dropped['irrelevant']} irrelevant, {dropped['artifact']} artifacts)",
        file=sys.stderr,
    )
    return leaves


def stratify(leaves: list[dict], baseline_sample: int) -> tuple[list[dict], list[dict]]:
    """Split leaves into the found stratum (top decile) and a seeded baseline sample."""
    if not leaves:
        return [], []
    cut = max(1, round(len(leaves) * 0.10))
    found = leaves[:cut]
    rest = leaves[cut:]
    rng = random.Random(RANDOM_SEED)
    baseline = rest if len(rest) <= baseline_sample else rng.sample(rest, baseline_sample)
    baseline.sort(key=lambda r: r["monthly"], reverse=True)
    return found, baseline


class PortfolioIndex:
    """Publisher portfolios, fetched once per maintainer and cached."""

    def __init__(self) -> None:
        self._cache: dict[str, list[dict]] = {}

    def portfolio(self, username: str) -> list[dict]:
        if username not in self._cache:
            rows = search(f"maintainer:{username}", max_pages=MAX_PAGES)
            # One username can appear on packages it does not maintain (the
            # search is a text match on the field); keep only true membership.
            self._cache[username] = [
                {"name": r["name"], "monthly": r["monthly"]}
                for r in rows
                if username in r["maintainers"]
            ]
        return self._cache[username]

    @property
    def size(self) -> int:
        return len(self._cache)


def audience_of(row: dict, index: PortfolioIndex) -> dict:
    """The largest other package any of this listing's maintainers publishes."""
    best_name, best_monthly, portfolio_size = None, 0, 0
    for username in row["maintainers"]:
        for other in index.portfolio(username):
            if other["name"] == row["name"]:
                continue
            portfolio_size += 1
            if other["monthly"] > best_monthly:
                best_name, best_monthly = other["name"], other["monthly"]
    return {
        "name": row["name"],
        "monthly": row["monthly"],
        "maintainers": row["maintainers"],
        "scoped": bool(row["name"] and row["name"].startswith("@")),
        "scope": row["name"].split("/")[0] if (row["name"] or "").startswith("@") else None,
        "other_packages": portfolio_size,
        "largest_other_package": best_name,
        "largest_other_monthly": best_monthly,
        "last_publish": row["last_publish"],
        "repository": (row["links"] or {}).get("repository"),
    }


def summarise(records: list[dict]) -> dict:
    """Share of listings whose publisher clears each audience threshold."""
    n = len(records)
    if n == 0:
        return {"n": 0}
    shares = {
        f"publisher_audience_above_{t}": round(
            sum(1 for r in records if r["largest_other_monthly"] >= t) / n, 4
        )
        for t in AUDIENCE_THRESHOLDS
    }
    cold = [r for r in records if r["largest_other_monthly"] < AUDIENCE_THRESHOLDS[1]]
    solo = [r for r in records if r["other_packages"] == 0]
    audiences = sorted(r["largest_other_monthly"] for r in records)
    return {
        "n": n,
        **shares,
        "cold_publisher_share": round(len(cold) / n, 4),
        "solo_package_share": round(len(solo) / n, 4),
        "scoped_share": round(sum(1 for r in records if r["scoped"]) / n, 4),
        "has_repository_share": round(
            sum(1 for r in records if r["repository"]) / n, 4
        ),
        "publisher_audience_median": audiences[n // 2],
        "listing_downloads_median": sorted(r["monthly"] for r in records)[n // 2],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--category", action="append", choices=sorted(CATEGORIES))
    parser.add_argument(
        "--baseline-sample",
        type=int,
        default=60,
        help="how many non-top-decile leaves to sample per category (default 60)",
    )
    parser.add_argument("--out", help="write full results as JSON to this path")
    args = parser.parse_args()

    selected = args.category or sorted(CATEGORIES)
    index = PortfolioIndex()
    results: dict[str, dict] = {}

    for category in selected:
        spec = CATEGORIES[category]
        print(f"collecting {category}...", file=sys.stderr)
        leaves = collect_leaves(category, spec)
        found, baseline = stratify(leaves, args.baseline_sample)
        print(
            f"  sampling {len(found)} found + {len(baseline)} baseline "
            f"({index.size} publishers cached so far)",
            file=sys.stderr,
        )
        strata = {}
        for label, rows in (("found", found), ("baseline", baseline)):
            records = [audience_of(row, index) for row in rows]
            strata[label] = {"summary": summarise(records), "records": records}
            print(f"  {label}: {strata[label]['summary']}", file=sys.stderr)
        results[category] = {
            "candidate": spec["candidate"],
            "leaf_count": len(leaves),
            "strata": strata,
        }

    payload = {
        "measured_at": datetime.now(timezone.utc).isoformat(),
        "method": {
            "source": "npm registry search API (registry.npmjs.org/-/v1/search)",
            "found_stratum": "top decile of leaf packages by monthly downloads",
            "baseline_stratum": (
                f"seeded random sample (seed {RANDOM_SEED}) of up to "
                f"{args.baseline_sample} leaves below the top decile"
            ),
            "audience_definition": (
                "largest monthly download count among the listing's maintainers' "
                "other packages"
            ),
            "audience_thresholds": list(AUDIENCE_THRESHOLDS),
            "known_limit": (
                "portfolio counts are current, not as-of the listing's first "
                "publish, so this measures association and bounds the "
                "cold-publisher share from above"
            ),
            "publishers_looked_up": index.size,
        },
        "categories": results,
    }

    if args.out:
        with open(args.out, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=1, sort_keys=True)
        print(f"wrote {args.out}", file=sys.stderr)
    else:
        json.dump(payload, sys.stdout, indent=1, sort_keys=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
