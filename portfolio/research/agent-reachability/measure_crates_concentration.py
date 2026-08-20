#!/usr/bin/env python3
"""Replicate PR #111's listing-demand concentration finding on a second registry.

PR #111 measured npm and stated its own main limit plainly: npm only, because no
other free agent-listable channel published a comparable per-listing figure
through an API reachable from here. The companion probe in this directory
(`probe_reachability.py`) found that crates.io *is* reachable and does expose
per-crate download counts, so that limit can be partially lifted.

The question this answers is not "is Rust a good market." It is narrower and
load-bearing for the pipeline: **is #111's finding a property of npm, or of
open package registries generally?** If a second, differently-shaped registry
reproduces the same concentration, then "publishing is not distribution" is a
property of the channel class the agent can reach -- and the pipeline's
`distribution` column means something different from what it currently records.

Method mirrors #111 as closely as the two APIs allow:

  * Population is *leaf* crates -- zero reverse dependencies -- so we count
    listings that were discovered directly rather than pulled in by a parent.
    This is the filter that stops foundational crates from inflating the top of
    the distribution, which would bias the result toward the conclusion.
  * Demand is `recent_downloads` (crates.io's trailing-90-day figure) converted
    to a monthly rate, so the numbers sit on the same scale as #111's
    monthly npm figures.
  * The same statistics are reported, including the top-1 and top-5 removal
    sensitivity check, because keyword-defined categories always admit a few
    incidental matches.

Read-only. Stdlib only. No credentials. Paced to crates.io's crawler policy
(<=1 request/second, identifying User-Agent with a contact URL).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://crates.io/api/v1"

# crates.io's crawler policy asks for a UA that identifies the caller and gives a
# way to contact them. A repository URL satisfies that without putting anyone's
# personal address into a third party's logs.
USER_AGENT = (
    "monorepo-projects-research/1.0 "
    "(+https://github.com/Duncan-Haywood/monorepo-projects; portfolio research; read-only)"
)

# Categories are the three the pipeline maps to a free, agent-listable channel --
# the same three #111 measured on npm, so the two tables are comparable.
CATEGORIES: dict[str, dict] = {
    "sbom-cra-evidence": {
        "candidates": ["cra-evidence-desk"],
        "queries": ["sbom", "cyclonedx", "spdx", "dependency audit"],
    },
    "accessibility-evidence": {
        "candidates": ["eaa-remediation-pipeline", "shopify-a11y-evidence"],
        "queries": ["accessibility", "a11y", "wcag"],
    },
    "mcp-supply-chain": {
        "candidates": ["mcp-supply-chain-watch"],
        "queries": ["mcp", "model context protocol"],
    },
}


def get(url: str, pace: float, timeout: float = 30.0, retries: int = 3) -> dict | None:
    """One paced GET returning parsed JSON, or None if the row should be dropped."""
    for attempt in range(retries):
        time.sleep(pace)
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code == 429:  # backoff and retry; anything else is terminal
                time.sleep(2.0 * (attempt + 1))
                continue
            print(f"    ! HTTP {exc.code} {url}", file=sys.stderr)
            return None
        except Exception as exc:  # noqa: BLE001
            print(f"    ! {type(exc).__name__} {url}", file=sys.stderr)
            time.sleep(1.0 * (attempt + 1))
    return None


def search(query: str, want: int, pace: float) -> list[dict]:
    """Collect up to `want` crates for a query, following pagination."""
    out: list[dict] = []
    page = 1
    while len(out) < want:
        qs = urllib.parse.urlencode(
            {"q": query, "per_page": 100, "page": page, "sort": "relevance"})
        data = get(f"{API}/crates?{qs}", pace)
        if not data:
            break
        crates = data.get("crates") or []
        if not crates:
            break
        out.extend(crates)
        total = (data.get("meta") or {}).get("total", 0)
        if page * 100 >= min(total, want) or len(out) >= total:
            break
        page += 1
    return out[:want]


def reverse_dep_count(name: str, pace: float) -> int | None:
    """Number of crates depending on `name`. None if it could not be determined."""
    qs = urllib.parse.urlencode({"per_page": 1})
    data = get(f"{API}/crates/{urllib.parse.quote(name)}/reverse_dependencies?{qs}", pace)
    if data is None:
        return None
    return (data.get("meta") or {}).get("total")


# ---------------------------------------------------------------------------
# statistics -- same set PR #111 reports
# ---------------------------------------------------------------------------

def percentile(sorted_vals: list[float], q: float) -> float:
    """Nearest-rank percentile on an ascending list."""
    if not sorted_vals:
        return 0.0
    idx = max(0, min(len(sorted_vals) - 1, int(round(q * (len(sorted_vals) - 1)))))
    return sorted_vals[idx]


def concentration(vals: list[float]) -> dict:
    """Top-1%/top-5% share, and the smallest share of listings taking half of demand."""
    if not vals:
        return {}
    desc = sorted(vals, reverse=True)
    total = sum(desc)
    n = len(desc)

    def k_for(frac: float) -> int:
        return max(1, int(round(frac * n)))

    def share(frac: float) -> float | None:
        k = k_for(frac)
        return round(100.0 * sum(desc[:k]) / total, 1) if total else None

    half, running = None, 0.0
    for i, v in enumerate(desc, 1):
        running += v
        if total and running >= total / 2:
            half = {"n_listings": i, "pct_of_listings": round(100.0 * i / n, 2)}
            break

    return {
        "n": n,
        "total_monthly_downloads": int(total),
        "p25": round(percentile(sorted(desc), 0.25), 1),
        "median": round(percentile(sorted(desc), 0.50), 1),
        "p75": round(percentile(sorted(desc), 0.75), 1),
        "p90": round(percentile(sorted(desc), 0.90), 1),
        "top_1pct_share": share(0.01),
        "top_5pct_share": share(0.05),
        # With a small n, "top 1%" rounds to a single listing, so the figure stops
        # meaning "the top centile" and silently becomes "the largest listing".
        # PR #111's npm populations (402-970) do not have this problem; these do,
        # so the two tables' top-k columns are NOT directly comparable unless this
        # is false. `half_of_demand_goes_to` is scale-free and stays comparable.
        "top_1pct_is_single_listing": k_for(0.01) == 1,
        "top_5pct_n_listings": k_for(0.05),
        # A population this small cannot support a distribution claim at all.
        "n_too_small_for_concentration": n < 30,
        "half_of_demand_goes_to": half,
        "largest_listing": int(desc[0]),
        "largest_share": round(100.0 * desc[0] / total, 1) if total else None,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", help="write results JSON here")
    ap.add_argument("--per-category", type=int, default=150,
                    help="max crates to resolve per category (each costs 1 request)")
    ap.add_argument("--pace", type=float, default=1.05,
                    help="seconds between requests; crates.io asks for <=1/sec")
    ap.add_argument("--recompute-from", metavar="RESULTS.json",
                    help="recompute every statistic from a previous run's stored "
                         "rows instead of re-fetching, so the published figures "
                         "can be checked without touching the network")
    args = ap.parse_args()

    if args.recompute_from:
        with open(args.recompute_from) as fh:
            prev = json.load(fh)
        for cat, block in prev["categories"].items():
            vals = [r["monthly_downloads"] for r in block["rows"]]
            block["stats"] = concentration(vals)
            block["sensitivity_drop_top_1"] = concentration(sorted(vals, reverse=True)[1:])
            block["sensitivity_drop_top_5"] = concentration(sorted(vals, reverse=True)[5:])
            s = block["stats"]
            print(f"{cat}: n={s['n']} median={s['median']} "
                  f"half->{(s['half_of_demand_goes_to'] or {}).get('pct_of_listings')}%",
                  file=sys.stderr)
        text = json.dumps(prev, indent=2)
        if args.out:
            with open(args.out, "w") as fh:
                fh.write(text + "\n")
            print(f"wrote {args.out}", file=sys.stderr)
        else:
            print(text)
        return 0

    payload: dict = {
        "generated_by": "portfolio/research/agent-reachability/measure_crates_concentration.py",
        "registry": "crates.io",
        "demand_metric": "recent_downloads (trailing 90d) / 3 = monthly rate",
        "population": "leaf crates only (zero reverse dependencies)",
        "compare_with": "PR #111, portfolio/research/free-listing-demand (npm)",
        "categories": {},
    }

    for cat, spec in CATEGORIES.items():
        print(f"\n=== {cat} ===", file=sys.stderr)
        seen: dict[str, dict] = {}
        for q in spec["queries"]:
            found = search(q, args.per_category, args.pace)
            print(f"  query {q!r}: {len(found)} crates", file=sys.stderr)
            for c in found:
                if c.get("name") and c["name"] not in seen:
                    seen[c["name"]] = c

        candidates = list(seen.values())[: args.per_category]
        print(f"  resolving reverse deps for {len(candidates)} distinct crates",
              file=sys.stderr)

        rows, dropped = [], {"reverse_deps_unknown": 0, "non_leaf": 0}
        for i, c in enumerate(candidates, 1):
            name = c["name"]
            rdeps = reverse_dep_count(name, args.pace)
            if rdeps is None:
                dropped["reverse_deps_unknown"] += 1
                continue
            if rdeps > 0:
                dropped["non_leaf"] += 1
                continue
            recent = c.get("recent_downloads") or 0
            rows.append({
                "name": name,
                "reverse_dependencies": rdeps,
                "recent_downloads_90d": recent,
                "monthly_downloads": round(recent / 3.0, 1),
                "downloads_all_time": c.get("downloads"),
                "created_at": c.get("created_at"),
                "updated_at": c.get("updated_at"),
            })
            if i % 25 == 0:
                print(f"    {i}/{len(candidates)} ({len(rows)} leaf)", file=sys.stderr)

        vals = [r["monthly_downloads"] for r in rows]
        stats = concentration(vals)
        desc_names = sorted(rows, key=lambda r: -r["monthly_downloads"])

        payload["categories"][cat] = {
            "candidates": spec["candidates"],
            "queries": spec["queries"],
            "n_distinct_crates_examined": len(candidates),
            "dropped": dropped,
            "stats": stats,
            "sensitivity_drop_top_1": concentration(sorted(vals, reverse=True)[1:]),
            "sensitivity_drop_top_5": concentration(sorted(vals, reverse=True)[5:]),
            "top_10_listings": [
                {"name": r["name"], "monthly_downloads": r["monthly_downloads"]}
                for r in desc_names[:10]
            ],
            "rows": rows,
        }
        if stats:
            print(f"  -> n={stats['n']} median={stats['median']} "
                  f"top1%={stats['top_1pct_share']}%", file=sys.stderr)

    text = json.dumps(payload, indent=2)
    if args.out:
        with open(args.out, "w") as fh:
            fh.write(text + "\n")
        print(f"\nwrote {args.out}", file=sys.stderr)
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
