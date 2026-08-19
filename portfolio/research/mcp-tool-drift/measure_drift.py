#!/usr/bin/env python3
"""Measure how often MCP servers change their declared tool surface.

Why this exists
---------------
The `mcp-supply-chain-watch` candidate (PR #79, `portfolio/pipeline/`) proposes
selling change-monitoring over the tool declarations of third-party MCP servers.
Its own write-up names the cheapest possible kill for that idea:

    "Poll a set of publicly listed MCP servers ... and measure how many change a
    tool description at all over two weeks. If the base rate is near zero, there
    is no product -- that is the cheapest possible kill."

This script runs that test *retrospectively* instead of forward. Rather than
waiting two weeks to observe drift, it diffs the tool declarations that npm
already has on record across a package's published versions. Same question,
answerable today.

It reads only public data: the official MCP registry API and the public npm
registry. It does not connect to any MCP server, does not send anything, and
does not need credentials.

Two measurements
----------------
`--mode lifetime`  diffs each package's first published version against its
                   last. Answers "does this server's tool surface change at all
                   over its life?" Biased high: it counts normal product growth.

`--mode consecutive`  diffs adjacent sampled versions of the same package.
                   Answers "if I am pinned to version N and upgrade to N+1, how
                   often does the tool surface move under me?" This is the
                   number the product thesis actually rests on.

Known limitations (read before quoting a number)
------------------------------------------------
Tool declarations are extracted *statically*, with regexes over the shipped
JS/TS, because running an untrusted MCP server to ask it `tools/list` is exactly
the thing we are not going to do on a research box. Consequences:

* Extraction is best-effort. A package that switches to a bundler or minifier
  can stop matching entirely, which shows up as "every tool removed at once".
  Those pairs are flagged `wipe` and excluded from the headline rates -- a
  measurement artifact, not a real removal.
* Description changes are UNDER-counted. Only descriptions written adjacent to
  their tool name are recovered. The true description-drift rate is at least
  what this reports, likely higher.
* Packages where nothing is extracted from either version are reported as
  `no-tools-extracted` and excluded rather than silently counted as "no change".

So the reported rates are a floor, and the honest claim is directional: the base
rate is not near zero. Do not put these numbers in customer-facing copy.

Usage
-----
    python3 measure_drift.py --mode consecutive --limit 10
    python3 measure_drift.py --mode lifetime --limit 45 --out results.json

No third-party dependencies; standard library only.
"""

from __future__ import annotations

import argparse
import collections
import io
import json
import re
import sys
import tarfile
import time
import urllib.parse
import urllib.request

REGISTRY = "https://registry.modelcontextprotocol.io/v0/servers"
NPM = "https://registry.npmjs.org"
UA = {"User-Agent": "monorepo-projects-portfolio-research/1.0"}

# Tool-declaration call shapes seen across the MCP TypeScript/JS ecosystem.
TOOL_NAME_PATTERNS = [
    re.compile(r"\.registerTool\(\s*['\"`]([A-Za-z0-9_.\-]{2,64})['\"`]"),
    re.compile(r"\.tool\(\s*['\"`]([A-Za-z0-9_.\-]{2,64})['\"`]"),
    re.compile(r"\bname\s*:\s*['\"`]([A-Za-z0-9_.\-]{2,64})['\"`]\s*,\s*description\s*:"),
    re.compile(r"['\"]name['\"]\s*:\s*['\"]([A-Za-z0-9_.\-]{2,64})['\"]\s*,\s*['\"]description['\"]\s*:"),
]

# name -> description, only where the two sit adjacent (hence under-counting).
TOOL_DESC_PATTERN = re.compile(
    r"name\s*:\s*['\"`]([A-Za-z0-9_.\-]{2,64})['\"`]\s*,\s*"
    r"(?:title\s*:\s*['\"`][^'\"`]*['\"`]\s*,\s*)?"
    r"description\s*:\s*['\"`]([^'\"`]{0,400})['\"`]"
)

SKIP_PATH = re.compile(r"(^|/)(node_modules|tests?|__tests__|examples?|docs?)/")
CODE_EXT = (".js", ".mjs", ".cjs", ".ts", ".tsx", ".json")
# Generic identifiers that are never real tool names.
NOISE = re.compile(r"(default|index|main|name|type|string|object|number|boolean|error|Error)")


def fetch(url: str, timeout: int = 60) -> bytes:
    return urllib.request.urlopen(
        urllib.request.Request(url, headers=UA), timeout=timeout
    ).read()


def fetch_json(url: str, timeout: int = 60):
    return json.loads(fetch(url, timeout))


def extract_tools(tarball: bytes) -> tuple[set[str], dict[str, str]]:
    """Statically recover (tool names, name->description) from an npm tarball."""
    names: set[str] = set()
    descriptions: dict[str, str] = {}
    try:
        archive = tarfile.open(fileobj=io.BytesIO(tarball), mode="r:gz")
    except Exception:
        return names, descriptions

    for member in archive.getmembers():
        if not member.isfile() or member.size > 3_000_000:
            continue
        path = member.name
        if SKIP_PATH.search(path) or not path.endswith(CODE_EXT):
            continue
        # Most .json in a package is config noise; only manifest-ish ones help.
        if path.endswith(".json") and not path.endswith(
            ("server.json", "mcp.json", "tools.json")
        ):
            continue
        try:
            text = archive.extractfile(member).read().decode("utf-8", "ignore")
        except Exception:
            continue
        for pattern in TOOL_NAME_PATTERNS:
            names.update(m.group(1) for m in pattern.finditer(text))
        for m in TOOL_DESC_PATTERN.finditer(text):
            descriptions.setdefault(m.group(1), m.group(2))

    names = {n for n in names if not NOISE.fullmatch(n)}
    return names, descriptions


def registry_servers(max_pages: int = 40, pause: float = 0.15) -> list[dict]:
    """Page the official MCP registry."""
    out: list[dict] = []
    cursor = None
    for _ in range(max_pages):
        url = f"{REGISTRY}?limit=100" + (f"&cursor={cursor}" if cursor else "")
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


def npm_packaged_servers(records: list[dict]) -> list[tuple[str, str, int]]:
    """(server name, npm package, number of registry version records)."""
    by_name: dict[str, list[dict]] = collections.defaultdict(list)
    for rec in records:
        by_name[rec["server"]["name"]].append(rec)

    found: list[tuple[str, str, int]] = []
    for name, recs in by_name.items():
        packages = set()
        for rec in recs:
            for pkg in rec["server"].get("packages") or []:
                registry_type = (
                    pkg.get("registryType") or pkg.get("registry_name") or ""
                ).lower()
                identifier = pkg.get("identifier") or pkg.get("name")
                if registry_type == "npm" and identifier:
                    packages.add(identifier)
        found.extend((name, p, len(recs)) for p in packages)

    found.sort(key=lambda row: -row[2])
    # De-duplicate npm packages shared by several registry entries.
    seen: set[str] = set()
    unique = []
    for name, pkg, count in found:
        if pkg not in seen:
            seen.add(pkg)
            unique.append((name, pkg, count))
    return unique


def ordered_versions(meta: dict) -> list[str]:
    times = meta.get("time", {})
    return sorted(
        (v for v in meta.get("versions", {}) if v in times), key=lambda v: times[v]
    )


def compare(prev: tuple[set, dict], curr: tuple[set, dict]) -> dict:
    prev_names, prev_desc = prev
    curr_names, curr_desc = curr
    shared = set(prev_desc) & set(curr_desc)
    return {
        "n_from": len(prev_names),
        "n_to": len(curr_names),
        "added": sorted(curr_names - prev_names)[:25],
        "removed": sorted(prev_names - curr_names)[:25],
        "n_added": len(curr_names - prev_names),
        "n_removed": len(prev_names - curr_names),
        "n_desc_changed": len([k for k in shared if prev_desc[k] != curr_desc[k]]),
        # Every tool vanishing at once is almost always the package switching to
        # a bundler, not a real removal. Flagged so it can be excluded.
        "wipe": bool(prev_names) and not curr_names,
    }


def run_lifetime(targets, pause: float) -> list[dict]:
    results = []
    for index, (server, pkg, version_records) in enumerate(targets, 1):
        try:
            meta = fetch_json(f"{NPM}/{urllib.parse.quote(pkg, safe='@')}")
        except Exception as exc:
            results.append({"pkg": pkg, "status": f"meta-fail: {exc}"})
            continue
        versions = ordered_versions(meta)
        if len(versions) < 2:
            results.append(
                {"pkg": pkg, "status": "single-version", "n_versions": len(versions)}
            )
            continue
        first, last = versions[0], versions[-1]
        try:
            a = extract_tools(fetch(meta["versions"][first]["dist"]["tarball"]))
            b = extract_tools(fetch(meta["versions"][last]["dist"]["tarball"]))
        except Exception as exc:
            results.append({"pkg": pkg, "status": f"tarball-fail: {exc}"})
            continue
        if not a[0] and not b[0]:
            results.append(
                {"pkg": pkg, "status": "no-tools-extracted", "n_versions": len(versions)}
            )
            continue
        times = meta["time"]
        row = {
            "pkg": pkg,
            "server": server,
            "status": "ok",
            "n_versions": len(versions),
            "registry_version_records": version_records,
            "first": first,
            "last": last,
            "first_t": times[first][:10],
            "last_t": times[last][:10],
        }
        row.update(compare(a, b))
        results.append(row)
        print(
            f"[{index}/{len(targets)}] {pkg}: {row['n_from']}->{row['n_to']} tools, "
            f"+{row['n_added']} -{row['n_removed']} desc~{row['n_desc_changed']}",
            flush=True,
        )
        time.sleep(pause)
    return results


def run_consecutive(targets, samples: int, pause: float) -> list[dict]:
    rows = []
    for server, pkg, _ in targets:
        try:
            meta = fetch_json(f"{NPM}/{urllib.parse.quote(pkg, safe='@')}")
        except Exception as exc:
            print(f"{pkg}: metadata fetch failed: {exc}", file=sys.stderr)
            continue
        versions = ordered_versions(meta)
        if len(versions) < 2:
            continue
        if len(versions) > samples:
            step = (len(versions) - 1) / (samples - 1)
            picked = sorted({round(i * step) for i in range(samples)})
            versions = [versions[i] for i in picked]

        previous = None
        previous_version = None
        for version in versions:
            try:
                current = extract_tools(fetch(meta["versions"][version]["dist"]["tarball"]))
            except Exception:
                continue
            if previous is not None and (previous[0] or current[0]):
                row = {
                    "pkg": pkg,
                    "server": server,
                    "from": previous_version,
                    "to": version,
                    "t": meta["time"][version][:10],
                }
                row.update(compare(previous, current))
                rows.append(row)
            previous, previous_version = current, version
            time.sleep(pause)
        print(f"{pkg}: {sum(1 for r in rows if r['pkg'] == pkg)} version-pairs", flush=True)
    return rows


def summarise(rows: list[dict], mode: str) -> dict:
    if mode == "lifetime":
        rows = [r for r in rows if r.get("status") == "ok"]
    usable = [r for r in rows if not r["wipe"] and r["n_from"] and r["n_to"]]
    if not usable:
        return {"usable": 0}

    def rate(pred):
        n = len([r for r in usable if pred(r)])
        return {"n": n, "pct": round(n / len(usable) * 100)}

    return {
        "mode": mode,
        "compared": len(rows),
        "usable_excluding_wipeouts": len(usable),
        "any_tool_surface_change": rate(
            lambda r: r["n_added"] or r["n_removed"] or r["n_desc_changed"]
        ),
        "tool_added": rate(lambda r: r["n_added"]),
        "tool_removed_breaking": rate(lambda r: r["n_removed"]),
        "description_changed_undercounted": rate(lambda r: r["n_desc_changed"]),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--mode", choices=["lifetime", "consecutive"], default="consecutive")
    ap.add_argument("--limit", type=int, default=10, help="packages to analyse")
    ap.add_argument("--samples", type=int, default=8, help="versions sampled per package (consecutive mode)")
    ap.add_argument("--pages", type=int, default=40, help="registry pages to read")
    ap.add_argument("--pause", type=float, default=0.1, help="seconds between requests")
    ap.add_argument("--out", default=None, help="write raw rows + summary as JSON")
    args = ap.parse_args()

    print("Reading the official MCP registry...", flush=True)
    records = registry_servers(max_pages=args.pages, pause=args.pause)
    print(f"  {len(records)} version records", flush=True)

    targets = npm_packaged_servers(records)
    print(f"  {len(targets)} distinct npm-packaged servers; analysing {min(args.limit, len(targets))}\n", flush=True)
    targets = targets[: args.limit]

    if args.mode == "lifetime":
        rows = run_lifetime(targets, args.pause)
    else:
        rows = run_consecutive(targets, args.samples, args.pause)

    summary = summarise(rows, args.mode)
    print("\n=== summary ===")
    print(json.dumps(summary, indent=2))

    if args.out:
        with open(args.out, "w") as fh:
            json.dump({"summary": summary, "rows": rows}, fh, indent=1)
        print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
