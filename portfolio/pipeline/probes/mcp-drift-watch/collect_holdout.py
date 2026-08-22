#!/usr/bin/env python3
"""Collect a held-out corpus for the drift classifier, from packages it never saw.

Why this exists
---------------
`portfolio/research/mcp-tool-drift/` measured the thing `mcp-supply-chain-watch`
is sold on: 69% of adjacent MCP server releases move the declared tool surface,
78.3% of description changes are cosmetic, and 7.2% are instruction-bearing --
the class that is the alert. It then closed its own write-up with the caveat
that matters here:

    "The corrected classifier was tuned on the corpus it is scored against, so
     7.2% is in-sample and will not hold unchanged on fresh data."

Nothing has re-opened that. This script does, the same way
`source-silence-detector/holdout_backtest.py` did for `public-record-watch`:
fetch changes from packages whose before/after pairs were never read while the
rules were being written, run the *shipped* classifier over them unchanged, and
report what it does out of sample.

What "held out" means precisely
-------------------------------
The rules were corrected by reading all 152 before/after pairs in
`results-2026-08-19-classified.json`. Those pairs come from 19 packages, named
in `TUNED_ON` below. A package is held out here when it is not one of those 19
*and* it sits outside the first 40 rows of today's ranking -- ranks 1-40 being
the slice that pass fetched.

The 21 packages that pass fetched and that yielded no description change are the
one soft edge. They contributed no labelled pair, so they are held out with
respect to labelling, which is what "tuned on" means for a classifier corrected
by hand. Today's ranking is also not identical to that day's -- the registry has
grown -- so `--min-rank` is a best effort and `TUNED_ON` is the guarantee. Both
are recorded in the output.

Reads only public data (the MCP registry and the npm registry), sends nothing,
needs no credentials. Runs no MCP server: extraction is static, for the reason
the research directory gives -- asking an untrusted server for `tools/list` is
exactly the thing this product exists to be careful about.

Usage
-----
    python3 collect_holdout.py --limit 60 --out results-holdout-2026-08-22.json

No third-party dependencies; standard library only.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.parse

sys.path.insert(
    0,
    os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "research", "mcp-tool-drift"
    ),
)

# The classifier under test is imported, never copied. Two engines that drift
# apart silently is the failure `portfolio/research/a11y-engine-agreement/`
# found across this repository's two accessibility engines; a held-out score
# for a fork of the rules would measure the fork.
from classify_drift import (  # noqa: E402
    extract_tools,
    fetch,
    fetch_json,
    label_all,
    npm_packaged_servers,
    ordered_versions,
    registry_servers,
    NPM,
)

# The 19 packages whose before/after pairs were read by hand while the rules
# were being corrected. Derived from results-2026-08-19-classified.json; a test
# checks this list still matches that file.
TUNED_ON = frozenset(
    {
        "@aetherwealth/mcp",
        "@ankimcp/anki-mcp-server",
        "@bolthub/mcp",
        "@certscore/mcp",
        "@fouradata/mcp",
        "@kawacode/mcp",
        "@perplexity-ai/mcp-server",
        "@posteverywhere/mcp",
        "@rolli/mcp",
        "@scope-bid/scope-mcp",
        "@shipeasy/mcp",
        "@signal8ai/mcp",
        "@trusty-squire/mcp",
        "@voxell/forge-mcp",
        "fodda-mcp",
        "mcp-server-scf",
        "mcp-socialapi",
        "raven-mcp",
        "tenjin-cli",
    }
)

# Rows 1-40 of the ranking were fetched by the tuning pass.
TUNING_SLICE = 40


def select_holdout(targets, min_rank: int, limit: int):
    """Rows outside the tuning slice, minus the packages that carried labels."""
    kept, excluded_named, excluded_rank = [], [], 0
    for rank, (server, pkg, count) in enumerate(targets, start=1):
        if rank <= min_rank:
            excluded_rank += 1
            continue
        if pkg in TUNED_ON:
            excluded_named.append(pkg)
            continue
        kept.append((server, pkg, count))
    return kept[:limit], {
        "excluded_by_rank": excluded_rank,
        "excluded_by_name": sorted(excluded_named),
        "eligible": len(kept),
        "taken": min(limit, len(kept)),
        "dropped_by_limit": max(0, len(kept) - limit),
    }


def collect(targets, samples: int, pause: float):
    """One record per description change, carrying before and after text.

    Deliberately a re-implementation of `classify_drift.collect` rather than a
    call into it: that function prints as it goes and returns a shape tied to
    its own summariser, and the sampling here needs to record per-package
    outcomes so a package that yields nothing is visible in the output instead
    of silently absent.
    """
    changes = []
    per_package = []
    for server, pkg, _ in targets:
        row = {"pkg": pkg, "server": server, "versions_seen": 0, "pairs": 0, "changes": 0}
        try:
            meta = fetch_json(f"{NPM}/{urllib.parse.quote(pkg, safe='@')}")
        except Exception as exc:
            row["error"] = f"metadata: {exc}"
            per_package.append(row)
            continue

        versions = ordered_versions(meta)
        if len(versions) > samples:
            step = (len(versions) - 1) / (samples - 1)
            versions = [versions[i] for i in sorted({round(i * step) for i in range(samples)})]
        row["versions_seen"] = len(versions)
        if len(versions) < 2:
            per_package.append(row)
            continue

        previous = previous_version = None
        for version in versions:
            try:
                current = extract_tools(fetch(meta["versions"][version]["dist"]["tarball"]))
            except Exception:
                continue
            if previous is not None:
                row["pairs"] += 1
                for tool in sorted(set(previous[1]) & set(current[1])):
                    old, new = previous[1][tool], current[1][tool]
                    if old != new:
                        changes.append(
                            {
                                "pkg": pkg,
                                "server": server,
                                "tool": tool,
                                "from": previous_version,
                                "to": version,
                                "t": meta["time"][version][:10],
                                "old": old,
                                "new": new,
                            }
                        )
                        row["changes"] += 1
            previous, previous_version = current, version
            time.sleep(pause)
        per_package.append(row)
        print(
            f"  {pkg}: {row['versions_seen']} versions, {row['pairs']} pairs, "
            f"{row['changes']} description changes",
            flush=True,
        )
    return changes, per_package


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--limit", type=int, default=60, help="held-out packages to analyse")
    ap.add_argument("--samples", type=int, default=6, help="versions sampled per package")
    ap.add_argument("--pages", type=int, default=40, help="registry pages to read")
    ap.add_argument("--pause", type=float, default=0.1, help="seconds between requests")
    ap.add_argument("--min-rank", type=int, default=TUNING_SLICE, help="skip this many top rows")
    ap.add_argument("--out", default=None, help="write corpus + provenance as JSON")
    args = ap.parse_args()

    print("Reading the official MCP registry...", flush=True)
    records = registry_servers(max_pages=args.pages, pause=args.pause)
    targets = npm_packaged_servers(records)
    print(f"  {len(records)} version records, {len(targets)} distinct npm-packaged servers")

    holdout, selection = select_holdout(targets, args.min_rank, args.limit)
    print(
        f"  held out: {selection['eligible']} eligible, taking {selection['taken']}"
        f" (dropped by --limit: {selection['dropped_by_limit']};"
        f" excluded by name: {len(selection['excluded_by_name'])})\n",
        flush=True,
    )

    changes, per_package = collect(holdout, args.samples, args.pause)
    changes = label_all(changes, strict=True)

    out = {
        "collected": "held-out corpus for the mcp-drift-watch classifier",
        "selection": selection,
        "tuned_on": sorted(TUNED_ON),
        "packages": per_package,
        "totals": {
            "packages_attempted": len(per_package),
            "packages_with_changes": sum(1 for p in per_package if p["changes"]),
            "version_pairs": sum(p["pairs"] for p in per_package),
            "description_changes": len(changes),
        },
        "changes": changes,
    }
    print("\n=== totals ===")
    print(json.dumps(out["totals"], indent=2))

    if args.out:
        with open(args.out, "w") as fh:
            json.dump(out, fh, indent=1)
        print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
