#!/usr/bin/env python3
"""Run the static audit over real published storefront themes, and count what it cannot decide.

Why this exists
---------------
`audit.py` is step 1 of the `eaa-remediation-pipeline` experiment ("build the
audit pass"). This script is the part that makes it a measurement rather than a
tool: it runs that pass over a population of *published* e-commerce theme and
storefront-template packages and reports the distribution.

The number being sought is not "how many accessibility problems do shop themes
have" -- that is well established and not in dispute. It is the one the
candidate's own economics turn on:

    The write-up scores `autonomous ops: 6` and carries a per-job contractor
    cost because "automated tools catch roughly a quarter to a third of WCAG
    issues" -- a secondary-source claim about *rendered pages*. A remediation
    vendor does not edit rendered pages. It edits templates. On a template,
    a second gap opens underneath the first: markup whose accessibility outcome
    is decided by data that is not in the file.

    How much of the audit surface is undecidable from the template alone?

That number bounds how much of this candidate's delivery can be automated
before a rendered page and real store data enter the loop, which is the input
to `autonomous ops` and, through the contractor cost, to `gross margin`.

Corpus
------
npm, because it is one of the few package registries reachable from this
environment without going through the egress proxy (see `README.md`, "What
could not be measured here"). This is a real limitation on the population and
is stated in the findings rather than papered over: the themes that EU shops
actually run are distributed through the Shopify theme store and the
WordPress.org directory, and neither is reachable from here.

Usage
-----
    python3 measure_themes.py --out results.json
    python3 measure_themes.py --recompute-from results.json   # offline

The second form re-derives every number in the README from the committed rows
with no network access, so the audit rules can be changed and the effect
measured without re-fetching anything.

Reads only the public npm registry, sends nothing, needs no credentials.
No third-party dependencies; standard library only.
"""

from __future__ import annotations

import argparse
import collections
import concurrent.futures
import io
import json
import statistics
import sys
import tarfile
import time
import urllib.parse
import urllib.request

import audit

NPM = "https://registry.npmjs.org"
UA = {"User-Agent": "monorepo-projects-portfolio-research/1.0"}

QUERIES = [
    "storefront theme",
    "ecommerce theme",
    "shop theme template",
    "shopify theme",
    "woocommerce theme",
    "commerce starter template",
    "ecommerce starter html",
    "online store template",
    "checkout template html",
    "product page template",
    "liquid theme sections",
    "medusa storefront",
    "nextjs commerce template",
    "bootstrap ecommerce template",
    "html5 shop template",
    "saleor storefront",
    "vendure storefront",
    "prestashop theme",
    "magento theme template",
    "cart page template",
]

# Two filters, because npm search returns the tooling *about* themes and the
# generic UI libraries alongside the themes themselves. Auditing a linter's test
# fixtures or a component library's docs site measures nothing about a
# storefront, and the first run of this script drew both.
TOOLING = (
    "theme-check", "language-server", "eslint", "stylelint", "-cli", "cli-",
    "webpack", "rollup", "vite-plugin", "vite/", "babel", "codemod", "types",
    "@types/", "hot-reload", "devtools", "test", "mock", "maizzle", "email",
    "newsletter", "mjml", "@nuxt/", "@vue/", "@angular/", "eslint-",
    "generator", "docs", "storybook", "icons", "tailwind",
)

# A package qualifies only if its own metadata says it is a storefront theme or
# template. Name, description and keywords are all searched, so a package that
# merely mentions commerce in prose is not pulled in.
STOREFRONT_TERMS = (
    "storefront", "shop", "store", "ecommerce", "e-commerce", "commerce",
    "shopify", "woocommerce", "magento", "checkout", "cart", "product page",
    "medusa", "saleor", "vendure", "bigcommerce", "prestashop",
)
THEME_TERMS = ("theme", "template", "starter", "boilerplate", "skin", "storefront")

MIN_MARKUP_FILES = 5
MAX_TARBALL = 40_000_000
SKIP_DIRS = ("/node_modules/", "/test/", "/tests/", "/__tests__/", "/fixtures/", "/spec/")


def fetch(url: str, timeout: int = 60) -> bytes:
    return urllib.request.urlopen(
        urllib.request.Request(url, headers=UA), timeout=timeout
    ).read()


def fetch_json(url: str, timeout: int = 60):
    return json.loads(fetch(url, timeout))


def search(query: str, size: int = 60) -> list[dict]:
    url = f"{NPM}/-/v1/search?text={urllib.parse.quote(query)}&size={size}"
    try:
        return [o["package"] for o in fetch_json(url, timeout=45).get("objects", [])]
    except Exception as exc:
        print(f"search {query!r} failed: {exc}", file=sys.stderr)
        return []


def looks_like_a_storefront_theme(package: dict) -> bool:
    name = package["name"].lower()
    if any(token in name for token in TOOLING):
        return False
    blurb = " ".join(
        [name, (package.get("description") or "").lower()]
        + [k.lower() for k in package.get("keywords") or []]
    )
    if any(token in blurb for token in ("eslint", "linter", "language server")):
        return False
    return any(t in blurb for t in STOREFRONT_TERMS) and any(t in blurb for t in THEME_TERMS)


def candidate_packages(pause: float) -> list[dict]:
    seen: dict[str, dict] = {}
    for query in QUERIES:
        for package in search(query):
            name = package["name"]
            if name in seen or not looks_like_a_storefront_theme(package):
                continue
            seen[name] = package
        time.sleep(pause)
    return sorted(seen.values(), key=lambda p: p["name"])


def markup_from_tarball(blob: bytes) -> list[tuple[str, str]]:
    """(path, source) for every template-ish file in an npm tarball."""
    out: list[tuple[str, str]] = []
    try:
        archive = tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz")
    except Exception:
        return out
    for member in archive.getmembers():
        if not member.isfile() or member.size > 2_000_000:
            continue
        path = member.name
        if not path.endswith(audit.MARKUP_EXT):
            continue
        if any(token in path for token in SKIP_DIRS):
            continue
        try:
            source = archive.extractfile(member).read().decode("utf-8", "ignore")
        except Exception:
            continue
        out.append((path, source))
    return out


def tarball_url(name: str, version: str) -> str:
    """The registry's canonical tarball path, derivable without the packument.

    Fetching the full packument for every candidate was the dominant cost of the
    first run (popular packages ship megabytes of version history), and none of
    it is needed: npm search already returns the latest version.
    """
    basename = name.split("/")[-1]
    return f"{NPM}/{name}/-/{basename}-{version}.tgz"


def audit_package(package: dict, pause: float) -> dict | None:
    name = package["name"]
    version = package.get("version")
    if not version:
        return None
    try:
        blob = fetch(tarball_url(name, version), timeout=120)
    except Exception as exc:
        print(f"{name}: tarball failed: {exc}", file=sys.stderr)
        return None
    if len(blob) > MAX_TARBALL:
        return None
    time.sleep(pause)

    files = markup_from_tarball(blob)
    if len(files) < MIN_MARKUP_FILES:
        return None

    results = []
    for path, source in files:
        try:
            results.append(audit.audit_source(source, path))
        except Exception as exc:
            print(f"{name}:{path}: audit failed: {exc}", file=sys.stderr)

    findings = [f for r in results for f in r["findings"]]
    undecided = [u for r in results for u in r["undecidable"]]
    severity = collections.Counter(f["severity"] for f in findings)
    return {
        "package": name,
        "version": version,
        "published": (package.get("date") or "")[:10],
        "files": len(results),
        "fragments": sum(1 for r in results if r["is_fragment"]),
        "elements": sum(r["elements"] for r in results),
        "findings": len(findings),
        "blocking": severity["blocking"],
        "degrading": severity["degrading"],
        "undecidable": len(undecided),
        "by_check": dict(collections.Counter(f["check"] for f in findings)),
        "undecidable_by_check": dict(collections.Counter(u["check"] for u in undecided)),
    }


def _percentiles(values: list[float]) -> dict:
    if not values:
        return {}
    ordered = sorted(values)

    def at(fraction):
        return round(ordered[min(len(ordered) - 1, int(fraction * len(ordered)))], 2)

    return {
        "n": len(ordered),
        "p25": at(0.25),
        "median": round(statistics.median(ordered), 2),
        "p75": at(0.75),
        "p90": at(0.90),
        "max": round(ordered[-1], 2),
    }


def summarise(rows: list[dict]) -> dict:
    findings = sum(r["findings"] for r in rows)
    undecided = sum(r["undecidable"] for r in rows)
    decided_or_not = findings + undecided
    by_check: collections.Counter = collections.Counter()
    undecidable_by_check: collections.Counter = collections.Counter()
    for row in rows:
        by_check.update(row["by_check"])
        undecidable_by_check.update(row["undecidable_by_check"])

    # Per-package undecidable share, on the checks where "undecidable" is even a
    # possible answer. A package-level distribution, not one ratio over the pool,
    # so a single huge theme cannot carry the headline.
    shares = []
    for row in rows:
        local = row["findings"] + row["undecidable"]
        if local >= 10:
            shares.append(row["undecidable"] / local * 100)

    # Only four checks have an "undecidable" branch at all -- the ones whose
    # answer can be supplied by a template expression. Measuring the undecidable
    # share against *every* check would let the ratio be moved by adding checks
    # that can never be undecidable, so the restricted denominator is the honest
    # one and is reported alongside the raw figure.
    capable = set(undecidable_by_check)
    capable_findings = sum(n for check, n in by_check.items() if check in capable)

    return {
        "packages": len(rows),
        "files": sum(r["files"] for r in rows),
        "elements": sum(r["elements"] for r in rows),
        "findings": findings,
        "blocking": sum(r["blocking"] for r in rows),
        "degrading": sum(r["degrading"] for r in rows),
        "undecidable": undecided,
        "undecidable_share_pct": round(undecided / decided_or_not * 100, 1) if decided_or_not else 0,
        "checks_with_an_undecidable_branch": sorted(capable),
        "undecidable_share_on_those_checks_pct": (
            round(undecided / (capable_findings + undecided) * 100, 1)
            if (capable_findings + undecided) else 0
        ),
        "undecidable_share_per_package_pct": _percentiles(shares),
        "blocking_per_1000_elements": _percentiles(
            [r["blocking"] / r["elements"] * 1000 for r in rows if r["elements"]]
        ),
        "packages_with_zero_blocking": sum(1 for r in rows if r["blocking"] == 0),
        "by_check": dict(by_check.most_common()),
        "undecidable_by_check": dict(undecidable_by_check.most_common()),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--limit", type=int, default=120, help="packages to try")
    parser.add_argument("--pause", type=float, default=0.15)
    parser.add_argument("--workers", type=int, default=6, help="concurrent tarball fetches")
    parser.add_argument("--out", default=None)
    parser.add_argument("--recompute-from", default=None,
                        help="re-derive the summary from committed rows, offline")
    args = parser.parse_args()

    if args.recompute_from:
        with open(args.recompute_from) as handle:
            data = json.load(handle)
        print(json.dumps(summarise(data["packages"]), indent=2))
        return 0

    print("Searching npm for storefront themes...", flush=True)
    packages = candidate_packages(args.pause)
    print(f"  {len(packages)} candidate packages; trying {min(args.limit, len(packages))}\n", flush=True)

    rows = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [
            pool.submit(audit_package, package, args.pause)
            for package in packages[: args.limit]
        ]
        for future in concurrent.futures.as_completed(futures):
            row = future.result()
            if row:
                rows.append(row)
                print(
                    f"{row['package']}@{row['version']}: {row['files']} files, "
                    f"{row['blocking']} blocking, {row['undecidable']} undecidable",
                    flush=True,
                )
    rows.sort(key=lambda r: r["package"])

    summary = summarise(rows)
    print("\n=== summary ===")
    print(json.dumps(summary, indent=2))

    if args.out:
        with open(args.out, "w") as handle:
            json.dump({"summary": summary, "packages": rows}, handle, indent=1)
        print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
