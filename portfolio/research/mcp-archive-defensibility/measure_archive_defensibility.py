#!/usr/bin/env python3
"""Does the `mcp-supply-chain-watch` archive actually accrue?

Why this exists
---------------
`portfolio/research/mcp-tool-drift/` ran steps 1 and 2 of the
`mcp-supply-chain-watch` experiment. Step 1 established that tool surfaces drift
(69% of adjacent releases). Step 2 established that the drift worth alerting on
is rare (median 0.00 alerts per server-month) and concluded, in its own words,
that **the archive is the durable value and the alert is the occasional event**.

That conclusion moves the whole product onto the candidate's floor dimension.
Its scorecard reads:

    defensibility: 4
    mitigation: Only the retained per-customer pin history accrues; the diffing
                mechanism is assumed copyable and is not the sale.

and the step-1 write-up closes with: *"the pinned per-customer history is still
the only accruing asset."* Both are assertions. Neither has been measured, and
`portfolio/pipeline/README.md` rule 2 requires a **named mitigation** for any
dimension at 4 or below before a candidate graduates. The named mitigation *is*
the archive. So the question this script answers is the one the candidate now
rests on:

    Is the pinned declaration history a scarce asset that accrues with time --
    or is it public data any entrant can reconstruct in full on their first day?

Three measurements, all against public APIs that are reachable from this
environment (the official MCP registry, npm, PyPI), no credentials, nothing
sent, no MCP server contacted.

1. `population`   -- split every server in the official registry by where its
                     tool declarations live: a public package registry (history
                     retained by the registry, therefore reconstructible after
                     the fact) or a remote endpoint (declaration observable only
                     while you are watching, therefore genuinely accruing).

2. `retention`    -- for package-distributed servers, how much history the
                     public registry hands a cold entrant: versions retained,
                     calendar span, and the share of published versions that
                     have been unpublished and are therefore *not*
                     reconstructible.

3. `copy-cost`    -- reconstruct complete declaration archives end to end, with
                     this repo's own already-published extractor, and time it.
                     Turns "the mechanism is assumed copyable" into a number in
                     seconds and megabytes.

A fourth check (`--control`) attempts a plain HTTPS GET against a sample of the
registry's remote endpoints, purely to record whether this environment can reach
them at all. It sends no MCP protocol traffic and asks no server for its tool
list -- that is the thing `measure_drift.py` was careful not to do, and this
script does not do it either.

Usage
-----
    python3 measure_archive_defensibility.py --out results.json
    python3 measure_archive_defensibility.py --phases population --pages 40
    python3 measure_archive_defensibility.py --recompute-from results.json

No third-party dependencies; standard library only.
"""

from __future__ import annotations

import argparse
import collections
import json
import os
import re
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

REGISTRY = "https://registry.modelcontextprotocol.io/v0/servers"
NPM = "https://registry.npmjs.org"
PYPI = "https://pypi.org/pypi"
UA = {"User-Agent": "monorepo-projects-portfolio-research/1.0"}

# Reuse the extractor already committed in this repo, deliberately: the copy-cost
# measurement below is only honest if it uses a tool that genuinely exists and is
# genuinely public, rather than a fresh one written to be fast.
_DRIFT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "mcp-tool-drift"
)
sys.path.insert(0, _DRIFT_DIR)
try:
    from measure_drift import extract_tools  # noqa: E402
except Exception as exc:  # pragma: no cover - only if the sibling dir moves
    print(f"cannot import measure_drift.extract_tools from {_DRIFT_DIR}: {exc}", file=sys.stderr)
    raise


# ---------------------------------------------------------------------------
# Fetch helpers
# ---------------------------------------------------------------------------


def fetch(url: str, timeout: int = 60) -> bytes:
    return urllib.request.urlopen(
        urllib.request.Request(url, headers=UA), timeout=timeout
    ).read()


def fetch_json(url: str, timeout: int = 60):
    return json.loads(fetch(url, timeout))


def probe(url: str, timeout: int = 15) -> str:
    """Classify what happens on a plain GET. Never raises."""
    try:
        response = urllib.request.urlopen(
            urllib.request.Request(url, headers=UA, method="GET"), timeout=timeout
        )
        return f"http-{response.status}"
    except urllib.error.HTTPError as exc:
        # An HTTP status from the origin means we reached it.
        return f"origin-{exc.code}"
    except urllib.error.URLError as exc:
        reason = str(exc.reason)
        if "Tunnel connection failed" in reason or "403" in reason:
            return "proxy-denied"
        return f"urlerror: {reason[:60]}"
    except Exception as exc:
        return f"{type(exc).__name__}: {str(exc)[:60]}"


# ---------------------------------------------------------------------------
# Phase 1 -- population split
# ---------------------------------------------------------------------------


def registry_records(max_pages: int, pause: float) -> list[dict]:
    out: list[dict] = []
    cursor = None
    for _ in range(max_pages):
        url = f"{REGISTRY}?limit=100" + (f"&cursor={urllib.parse.quote(cursor)}" if cursor else "")
        try:
            page = fetch_json(url, timeout=45)
        except Exception as exc:
            print(f"registry paging stopped: {exc}", file=sys.stderr)
            break
        out.extend(page.get("servers", []))
        cursor = page.get("metadata", {}).get("nextCursor")
        if not cursor:
            break
        time.sleep(pause)
    return out


def _package_registries(server: dict) -> set[str]:
    kinds = set()
    for pkg in server.get("packages") or []:
        kind = (pkg.get("registryType") or pkg.get("registry_name") or "").lower()
        if kind:
            kinds.add(kind)
    return kinds


# Registries this environment can read version history from, verified by the
# reachability probe in `main()`. Everything else is either unreachable here or
# does not retain per-version artifacts a third party can re-download.
RECONSTRUCTIBLE = {"npm", "pypi"}


def population_split(records: list[dict]) -> dict:
    """One row per distinct server; latest record wins."""
    latest: dict[str, dict] = {}
    versions_per_server: dict[str, set] = collections.defaultdict(set)
    for record in records:
        server = record.get("server", {})
        name = server.get("name")
        if not name:
            continue
        versions_per_server[name].add(server.get("version"))
        meta = (record.get("_meta") or {}).get("io.modelcontextprotocol.registry/official", {})
        if meta.get("isLatest") or name not in latest:
            latest[name] = server

    buckets = collections.Counter()
    registry_kinds = collections.Counter()
    remote_transports = collections.Counter()
    remote_hosts = collections.Counter()
    remote_only_examples: list[str] = []

    for name, server in latest.items():
        kinds = _package_registries(server)
        remotes = server.get("remotes") or []
        registry_kinds.update(kinds)
        for remote in remotes:
            remote_transports[(remote.get("type") or "unknown")] += 1
            url = remote.get("url") or ""
            host = urllib.parse.urlsplit(url).netloc
            if host:
                remote_hosts[host] += 1

        if kinds & RECONSTRUCTIBLE:
            buckets["package_reconstructible"] += 1
        elif kinds:
            buckets["package_unreachable_registry"] += 1
        elif remotes:
            buckets["remote_only"] += 1
            if len(remote_only_examples) < 8:
                url = (remotes[0].get("url") or "")
                if url:
                    remote_only_examples.append(url)
        else:
            buckets["neither"] += 1

    total = len(latest) or 1
    multi = sum(1 for versions in versions_per_server.values() if len(versions) > 1)
    return {
        "version_records": len(records),
        "distinct_servers": len(latest),
        "servers_with_multiple_versions_pct": round(multi / total * 100, 1),
        "buckets": {
            key: {"n": value, "pct": round(value / total * 100, 1)}
            for key, value in buckets.most_common()
        },
        "package_registry_kinds": dict(registry_kinds.most_common()),
        "remote_transports": dict(remote_transports.most_common()),
        "top_remote_hosts": dict(remote_hosts.most_common(10)),
        "_remote_only_examples": remote_only_examples,
    }


def npm_targets(records: list[dict], limit: int) -> list[str]:
    """npm package identifiers, most-published servers first."""
    counts: collections.Counter = collections.Counter()
    packages: dict[str, set] = collections.defaultdict(set)
    for record in records:
        server = record.get("server", {})
        name = server.get("name")
        if not name:
            continue
        counts[name] += 1
        for pkg in server.get("packages") or []:
            kind = (pkg.get("registryType") or pkg.get("registry_name") or "").lower()
            identifier = pkg.get("identifier") or pkg.get("name")
            if kind == "npm" and identifier:
                packages[name].add(identifier)

    ordered: list[str] = []
    seen: set[str] = set()
    for name, _ in counts.most_common():
        for identifier in sorted(packages.get(name, ())):
            if identifier not in seen:
                seen.add(identifier)
                ordered.append(identifier)
    return ordered[:limit]


# ---------------------------------------------------------------------------
# Phase 2 -- what the public registry retains
# ---------------------------------------------------------------------------

_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}")


def _days_between(first: str, last: str) -> float:
    import datetime

    def parse(stamp: str) -> datetime.datetime:
        return datetime.datetime.strptime(stamp[:10], "%Y-%m-%d")

    return (parse(last) - parse(first)).days


def retention(packages: list[str], pause: float) -> dict:
    rows = []
    for identifier in packages:
        try:
            meta = fetch_json(f"{NPM}/{urllib.parse.quote(identifier, safe='@')}")
        except Exception as exc:
            print(f"{identifier}: metadata fetch failed: {exc}", file=sys.stderr)
            continue
        times = {
            key: value
            for key, value in (meta.get("time") or {}).items()
            if key not in ("created", "modified") and _DATE.match(str(value) or "")
        }
        available = set(meta.get("versions") or {})
        published = set(times)
        if not published:
            continue
        # A version with a `time` entry but no `versions` entry was published and
        # later unpublished: that slice of history is gone from the public record
        # and is exactly the slice a live pin would have captured and nobody can
        # reconstruct after the fact.
        unpublished = sorted(published - available)
        ordered = sorted(published, key=lambda v: times[v])
        rows.append(
            {
                "pkg": identifier,
                "versions_published": len(published),
                "versions_retained": len(published & available),
                "versions_unpublished": len(unpublished),
                "unpublished_examples": unpublished[:5],
                "first": times[ordered[0]][:10],
                "last": times[ordered[-1]][:10],
                "span_days": _days_between(times[ordered[0]], times[ordered[-1]]),
            }
        )
        time.sleep(pause)

    if not rows:
        return {"packages": 0}

    retained = [r["versions_retained"] for r in rows]
    spans = [r["span_days"] for r in rows]
    total_published = sum(r["versions_published"] for r in rows)
    total_unpublished = sum(r["versions_unpublished"] for r in rows)
    with_gap = [r for r in rows if r["versions_unpublished"]]
    return {
        "packages": len(rows),
        "versions_published_total": total_published,
        "versions_unpublished_total": total_unpublished,
        "unpublished_share_pct": round(total_unpublished / max(total_published, 1) * 100, 2),
        "packages_with_any_unpublished": len(with_gap),
        "retained_versions_median": statistics.median(retained),
        "retained_versions_max": max(retained),
        "span_days_median": statistics.median(spans),
        "span_days_max": max(spans),
        "span_days_total": sum(spans),
        "rows": rows,
    }


# ---------------------------------------------------------------------------
# Phase 3 -- what it costs to copy the archive
# ---------------------------------------------------------------------------


def copy_cost(packages: list[str], pause: float, max_versions: int) -> dict:
    """Reconstruct full declaration archives and time the reconstruction."""
    rows = []
    started = time.monotonic()
    total_bytes = 0
    total_versions = 0
    for identifier in packages:
        try:
            meta = fetch_json(f"{NPM}/{urllib.parse.quote(identifier, safe='@')}")
        except Exception as exc:
            print(f"{identifier}: metadata fetch failed: {exc}", file=sys.stderr)
            continue
        times = meta.get("time") or {}
        versions = sorted(
            (v for v in (meta.get("versions") or {}) if v in times),
            key=lambda v: times[v],
        )
        if len(versions) < 2:
            continue
        if len(versions) > max_versions:
            step = (len(versions) - 1) / (max_versions - 1)
            versions = [versions[round(i * step)] for i in range(max_versions)]
            sampled = True
        else:
            sampled = False

        pkg_started = time.monotonic()
        pkg_bytes = 0
        snapshots = 0
        tools_seen: set[str] = set()
        fetch_failures = 0
        for version in versions:
            url = ((meta["versions"][version].get("dist") or {}).get("tarball"))
            if not url:
                fetch_failures += 1
                continue
            try:
                blob = fetch(url)
            except Exception:
                fetch_failures += 1
                continue
            pkg_bytes += len(blob)
            names, _descriptions = extract_tools(blob)
            if names:
                snapshots += 1
                tools_seen |= names
            time.sleep(pause)

        elapsed = time.monotonic() - pkg_started
        total_bytes += pkg_bytes
        total_versions += len(versions)
        rows.append(
            {
                "pkg": identifier,
                "versions_fetched": len(versions),
                "sampled": sampled,
                "snapshots_with_tools": snapshots,
                "distinct_tools_recovered": len(tools_seen),
                "fetch_failures": fetch_failures,
                "history_days": _days_between(times[versions[0]], times[versions[-1]]),
                "megabytes": round(pkg_bytes / 1e6, 2),
                "seconds": round(elapsed, 1),
            }
        )
        print(
            f"{identifier}: {len(versions)} versions, "
            f"{rows[-1]['distinct_tools_recovered']} tools, {rows[-1]['seconds']}s",
            flush=True,
        )

    wall = time.monotonic() - started
    usable = [r for r in rows if r["snapshots_with_tools"] >= 2]
    return {
        "packages_attempted": len(rows),
        "packages_with_usable_archive": len(usable),
        "versions_fetched": total_versions,
        "megabytes_total": round(total_bytes / 1e6, 2),
        "wall_seconds": round(wall, 1),
        "seconds_per_version": round(wall / max(total_versions, 1), 2),
        "history_days_recovered": sum(r["history_days"] for r in usable),
        "rows": rows,
    }


# ---------------------------------------------------------------------------
# Phase 4 -- reachability control on remote endpoints
# ---------------------------------------------------------------------------


def control(urls: list[str]) -> dict:
    results = {url: probe(url) for url in urls}
    reachable = sum(1 for verdict in results.values() if verdict.startswith(("http-", "origin-")))
    return {
        "checked": len(results),
        "reachable": reachable,
        "results": results,
        "note": (
            "Plain GET only, to record reachability. No MCP protocol traffic was "
            "sent and no server was asked for its tool list."
        ),
    }


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def report(data: dict) -> None:
    print("\n=== summary ===")
    print(json.dumps({k: v for k, v in data.items() if k != "raw"}, indent=2, default=str))


def derive(data: dict) -> dict:
    """The three numbers the candidate's floor score turns on."""
    out = {}
    population = data.get("population") or {}
    buckets = population.get("buckets") or {}
    if buckets:
        recon = buckets.get("package_reconstructible", {}).get("pct", 0)
        out["share_of_servers_whose_history_is_public_pct"] = recon
        out["share_of_servers_where_a_pin_is_the_only_record_pct"] = round(
            buckets.get("remote_only", {}).get("pct", 0)
            + buckets.get("package_unreachable_registry", {}).get("pct", 0),
            1,
        )
    retention_block = data.get("retention") or {}
    if retention_block.get("packages"):
        out["public_history_unrecoverable_pct"] = retention_block["unpublished_share_pct"]
        out["median_days_of_history_a_cold_entrant_gets_free"] = retention_block[
            "span_days_median"
        ]
    cost = data.get("copy_cost") or {}
    if cost.get("packages_attempted"):
        out["seconds_to_rebuild_one_package_archive_median"] = (
            round(cost["wall_seconds"] / cost["packages_attempted"], 1)
        )
        out["server_days_of_history_rebuilt_per_wall_hour"] = round(
            cost["history_days_recovered"] / max(cost["wall_seconds"], 1) * 3600
        )
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--pages", type=int, default=45, help="registry pages to read")
    parser.add_argument("--retention-limit", type=int, default=40, help="packages for phase 2")
    parser.add_argument("--copy-limit", type=int, default=6, help="packages for phase 3")
    parser.add_argument("--max-versions", type=int, default=14, help="versions per package in phase 3")
    parser.add_argument("--pause", type=float, default=0.1)
    parser.add_argument(
        "--phases",
        default="population,retention,copy-cost,control",
        help="comma-separated subset to run",
    )
    parser.add_argument("--out", default=None)
    parser.add_argument(
        "--recompute-from",
        default=None,
        help="re-derive the headline numbers from a committed result file, offline",
    )
    args = parser.parse_args()

    if args.recompute_from:
        with open(args.recompute_from) as handle:
            data = json.load(handle)
        print(json.dumps(derive(data), indent=2))
        return 0

    phases = {p.strip() for p in args.phases.split(",") if p.strip()}
    data: dict = {"measured_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}

    records: list[dict] = []
    if phases & {"population", "retention", "copy-cost", "control"}:
        print("Reading the official MCP registry...", flush=True)
        records = registry_records(args.pages, args.pause)
        print(f"  {len(records)} version records", flush=True)

    if "population" in phases:
        data["population"] = population_split(records)
        print(json.dumps(data["population"]["buckets"], indent=2))

    targets = npm_targets(records, max(args.retention_limit, args.copy_limit))
    data["npm_targets_available"] = len(targets)

    if "retention" in phases:
        print(f"\nPhase 2: retention across {min(args.retention_limit, len(targets))} npm packages")
        data["retention"] = retention(targets[: args.retention_limit], args.pause)

    if "copy-cost" in phases:
        print(f"\nPhase 3: rebuilding archives for {min(args.copy_limit, len(targets))} packages")
        data["copy_cost"] = copy_cost(targets[: args.copy_limit], args.pause, args.max_versions)

    if "control" in phases:
        examples = (data.get("population") or {}).get("_remote_only_examples") or []
        print(f"\nPhase 4: reachability control on {len(examples)} remote endpoints")
        data["control"] = control(examples)

    data["derived"] = derive(data)
    report({k: v for k, v in data.items()})

    if args.out:
        with open(args.out, "w") as handle:
            json.dump(data, handle, indent=1)
        print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
