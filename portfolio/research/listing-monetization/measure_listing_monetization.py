#!/usr/bin/env python3
"""Measure whether listings that *win* free-registry discovery monetise at all.

Context
-------
`portfolio/research/free-listing-demand/` measured the download distribution a
cold listing faces on npm. Follow-on work priced it:

  * #218 — a cold publisher's odds of a top-decile listing are 4.9%
    (vs 16.2% for a publisher with an existing audience).
  * #219 — central-case revenue for a cold free listing is $16-$145/month,
    computed from that download distribution times an **assumed ~2% conversion
    rate**, which its own write-up names as the weakest input in the model.
  * #225 — the concentration replicates on Packagist and RubyGems; changing
    registry does not improve the discovery term.

Every one of those measures the *funnel entrance*: how much attention a listing
can attract. None measures the exit. The assumed conversion rate has never been
checked against the population that would have to convert.

This script checks it from the other end. Instead of modelling what a winning
listing would earn, it asks what the listings that already won actually do:

  > Among the listings that reached the top decile of downloads in these
  > categories -- the outcome a cold publisher has a ~4.9% chance of reaching --
  > how many have any mechanism to receive money at all, and how many have a
  > *product* mechanism rather than a donation button?

If the winners of the discovery lottery have no route to revenue, then the
conversion rate #219 had to assume is not a parameter to refine. It is the
thing that is missing, and no amount of additional discovery fixes it.

Method
------
The population is built by **importing** `measure_listing_demand.py` -- same
`CATEGORIES`, same queries, same relevance filter, same artifact exclusion, same
leaf (zero-dependents) definition. The two studies therefore cannot drift apart,
and any correction to the population definition applies to both. This is the
same discipline `cross-registry-replication.py` used.

For each sampled package the script reads only structured registry metadata plus
the published README, and classifies the monetisation route it declares:

  ``none``       -- no funding field, no commercial licence signal, no README
                    commercial signal.
  ``donation``   -- GitHub Sponsors, Open Collective, Ko-fi, Patreon, Tidelift,
                    Liberapay, thanks.dev, Buy Me a Coffee. Money may arrive;
                    it is a gift, not a price.
  ``commercial`` -- a declared price, a paid tier, a licence key, an enterprise
                    edition, a hosted paid service, or a licence that only makes
                    sense as one half of a dual-licence sale (AGPL/SSPL/BUSL/
                    Elastic/`SEE LICENSE IN`/`UNLICENSED`).

``commercial`` dominates ``donation`` dominates ``none`` when several apply, so
the reported commercial share is the share with *any* product-revenue route.

Honest limits are recorded in the README next to the results; the important ones
are that a declared route is not revenue, README matching is heuristic in both
directions, and `funding` is under-declared across npm generally.

Read-only. No credentials. No writes to any registry. Standard library only.

Usage
-----
    python3 measure_listing_monetization.py --out results.json
    python3 measure_listing_monetization.py --categories mcp-supply-chain
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# Import the population definition rather than restating it, so this study and
# the download study cannot disagree about what is in a category.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "free-listing-demand"))

from measure_listing_demand import (  # noqa: E402
    CATEGORIES,
    is_artifact,
    is_relevant,
    percentiles,
    search,
)

REGISTRY = "https://registry.npmjs.org"
USER_AGENT = "monorepo-projects-portfolio-research/1.0 (read-only measurement)"

#: Packument fetches are paced separately from search: this is a CDN-backed
#: document endpoint, not the search cluster.
PACKUMENT_INTERVAL_SECONDS = 0.75

#: Packuments carry every version's manifest and can reach tens of megabytes for
#: large packages. Anything past this is read for its metadata only and reported
#: with ``readme_available: false`` rather than silently counted as "no signal".
MAX_PACKUMENT_BYTES = 12 * 1024 * 1024

#: Top decile is the threshold because that is the outcome #218 priced: the
#: 4.9%/16.2% figures are odds of reaching a *top-decile* listing.
WINNER_PERCENTILE = 90

#: Size of the comparison draw from below the threshold. Monetisation share is
#: only interesting relative to the rest of the category -- if the losers
#: declare it at the same rate, reaching the top decile buys nothing.
CONTROL_SAMPLE = 60


# --------------------------------------------------------------------------
# Monetisation signals
# --------------------------------------------------------------------------

#: Hosts that receive money as a gift. Matched against the `funding` field and
#: against README link targets.
DONATION_HOSTS = (
    "github.com/sponsors",
    "opencollective.com",
    "ko-fi.com",
    "patreon.com",
    "liberapay.com",
    "buymeacoffee.com",
    "thanks.dev",
    "tidelift.com",
    "paypal.me",
    "paypal.com/donate",
    "issuehunt.io",
    "salt.dev",
)

#: Licences that are either explicitly non-open or are the restrictive half of a
#: standard dual-licence sale. Their presence on a registry listing is a
#: deliberate commercial posture, not an accident.
COMMERCIAL_LICENCES = (
    "agpl", "sspl", "busl", "business source", "elastic-2", "elastic license",
    "polyform", "commons clause", "prosperity", "fair source", "unlicensed",
    "see license in", "proprietary", "commercial",
)

#: Permissive licences, listed so a package carrying one is never classified
#: commercial on the licence signal alone.
PERMISSIVE_LICENCES = (
    "mit", "apache", "bsd", "isc", "mpl", "cc0", "unlicense", "wtfpl", "zlib",
    "lgpl", "gpl-2", "gpl-3", "0bsd", "artistic", "epl",
)

#: README phrases that indicate a price exists. Deliberately phrase-level, not
#: word-level: "pricing" alone matches too much ("pricing data", "pricing API"),
#: and a bare "$" matches shell prompts in every install snippet.
COMMERCIAL_README_PATTERNS = (
    r"\blicen[cs]e key\b",
    r"\bactivation key\b",
    r"\bpaid (?:plan|tier|version|edition|subscription)s?\b",
    r"\bpro (?:plan|tier|version|edition|subscription)\b",
    r"\bteam (?:plan|tier)\b",
    r"\bbusiness (?:plan|tier)\b",
    r"\benterprise (?:plan|tier|edition|licen[cs]e|version)\b",
    r"\bcommercial (?:licen[cs]e|use requires|support)\b",
    r"\bdual[- ]licen[cs]ed\b",
    r"\bfree (?:tier|plan)\b",
    r"\bstarts? at \$\d",
    r"\bper (?:month|seat|user|developer)\b.{0,40}\$\d",
    r"\$\d+(?:\.\d{2})?\s*(?:/|per\s+)(?:mo\b|month|year|yr\b|seat|user)",
    r"\bupgrade to (?:pro|premium|paid|enterprise)\b",
    r"\bbuy (?:a )?licen[cs]e\b",
    r"\bpurchase (?:a )?licen[cs]e\b",
    r"\bsubscription required\b",
    r"\b(?:14|30|7)[- ]day (?:free )?trial\b",
)

#: Link targets that mean "there is a pricing page". A pricing page is the
#: single least ambiguous declaration that a product has a price.
COMMERCIAL_URL_PATTERNS = (
    r"https?://[^\s)\"'<>]*/pricing\b",
    r"https?://[^\s)\"'<>]*/plans\b",
    r"https?://[^\s)\"'<>]*/buy\b",
    r"https?://[^\s)\"'<>]*/subscribe\b",
    r"https?://(?:www\.)?(?:gumroad|lemonsqueezy|paddle|polar\.sh|stripe)\.com",
    r"https?://[^\s)\"'<>]*\.gumroad\.com",
    r"https?://buy\.stripe\.com",
)

#: Badge-image and CI-shield hosts. Their URLs routinely contain `/buy`,
#: `/plans`, and similar path segments as *label text* rather than as a
#: destination, so they are stripped before URL matching. Caught in the smoke
#: run: a `shields.io/badge/buy` badge classified an MIT package as commercial.
BADGE_HOSTS = (
    "img.shields.io", "shields.io", "badgen.net", "badge.fury.io",
    "flat.badgen.net", "travis-ci", "circleci.com/api", "codecov.io/gh",
    "api.codeclimate.com", "snyk.io/test", "camo.githubusercontent.com",
)

_COMMERCIAL_README_RE = re.compile("|".join(COMMERCIAL_README_PATTERNS), re.IGNORECASE)
_COMMERCIAL_URL_RE = re.compile("|".join(COMMERCIAL_URL_PATTERNS), re.IGNORECASE)
_BADGE_URL_RE = re.compile(
    r"https?://(?:[^\s)\"'<>]*\.)?(?:" + "|".join(re.escape(h) for h in BADGE_HOSTS) + r")[^\s)\"'<>]*",
    re.IGNORECASE,
)

#: README regions that quote *other* projects' commercial terms -- badge rows,
#: "sponsored by", and dependency tables -- are stripped before matching, since
#: a sponsor acknowledgement is not the package's own price.
_SPONSOR_ACK_RE = re.compile(
    r"^.{0,200}\b(?:sponsored by|backed by|supported by|thanks to our sponsors|"
    r"our sponsors|special thanks)\b.*$",
    re.IGNORECASE | re.MULTILINE,
)


_last_packument_at = 0.0


def fetch_packument(name: str) -> tuple[dict | None, bool, str | None]:
    """Return (document, readme_available, error).

    Reads the full packument so the root-level ``readme`` is available. Oversized
    documents are reported rather than parsed, and never counted as "no signal".
    """
    global _last_packument_at
    url = f"{REGISTRY}/{urllib.parse.quote(name, safe='@')}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last_error: Exception | None = None
    for attempt in range(5):
        wait = PACKUMENT_INTERVAL_SECONDS - (time.monotonic() - _last_packument_at)
        if wait > 0:
            time.sleep(wait)
        _last_packument_at = time.monotonic()
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                declared = response.headers.get("Content-Length")
                if declared and int(declared) > MAX_PACKUMENT_BYTES:
                    return None, False, "packument-too-large"
                raw = response.read(MAX_PACKUMENT_BYTES + 1)
            if len(raw) > MAX_PACKUMENT_BYTES:
                return None, False, "packument-too-large"
            return json.loads(raw.decode("utf-8")), True, None
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None, False, "not-found"
            if error.code not in (429, 500, 502, 503, 504):
                return None, False, f"http-{error.code}"
            last_error = error
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError) as error:
            last_error = error
        time.sleep(2 * 2 ** attempt)
    return None, False, f"give-up: {last_error}"


def latest_manifest(packument: dict) -> dict:
    """The version manifest npm would install, or the newest one it holds."""
    tags = packument.get("dist-tags") or {}
    versions = packument.get("versions") or {}
    latest = tags.get("latest")
    if latest and latest in versions:
        return versions[latest]
    if versions:
        return versions[sorted(versions)[-1]]
    return {}


def funding_urls(packument: dict, manifest: dict) -> list[str]:
    """Every URL declared in a `funding` field, in any of its permitted shapes."""
    found: list[str] = []
    for source in (manifest.get("funding"), packument.get("funding")):
        entries = source if isinstance(source, list) else [source]
        for entry in entries:
            if isinstance(entry, str):
                found.append(entry)
            elif isinstance(entry, dict):
                url = entry.get("url")
                if isinstance(url, str):
                    found.append(url)
    return [u for u in dict.fromkeys(found) if u]


def licence_string(manifest: dict, packument: dict) -> str:
    """The declared licence, flattened from every shape npm has ever allowed."""
    for source in (manifest.get("license"), manifest.get("licence"), packument.get("license")):
        if isinstance(source, str):
            return source
        if isinstance(source, dict) and isinstance(source.get("type"), str):
            return source["type"]
        if isinstance(source, list) and source:
            first = source[0]
            if isinstance(first, str):
                return first
            if isinstance(first, dict) and isinstance(first.get("type"), str):
                return first["type"]
    return ""


def licence_is_commercial(licence: str) -> bool:
    """True for licences that only make sense alongside a paid alternative.

    A permissive match wins, so `Apache-2.0` is never read as commercial merely
    because the string contains a substring of something else.
    """
    lowered = licence.strip().lower()
    if not lowered:
        return False
    if any(token in lowered for token in PERMISSIVE_LICENCES):
        # Dual declarations like "AGPL-3.0 OR Commercial" still count.
        return "agpl" in lowered or "commercial" in lowered or "sspl" in lowered
    return any(token in lowered for token in COMMERCIAL_LICENCES)


def scan_readme(readme: str) -> dict:
    """Commercial and donation evidence found in the package's own README."""
    if not readme:
        return {"scanned": False, "commercial_hits": [], "donation_hosts": []}
    body = _BADGE_URL_RE.sub(" ", _SPONSOR_ACK_RE.sub("", readme))
    commercial = sorted({m.group(0).strip().lower()[:60] for m in _COMMERCIAL_README_RE.finditer(body)})
    commercial += sorted({m.group(0).strip().lower()[:80] for m in _COMMERCIAL_URL_RE.finditer(body)})
    lowered = body.lower()
    donations = sorted({host for host in DONATION_HOSTS if host in lowered})
    return {
        "scanned": True,
        "commercial_hits": commercial[:12],
        "donation_hosts": donations,
    }


def classify(name: str) -> dict:
    """Resolve one package's declared monetisation route."""
    packument, readme_available, error = fetch_packument(name)
    if packument is None:
        return {"name": name, "resolved": False, "error": error, "route": None}

    manifest = latest_manifest(packument)
    funding = funding_urls(packument, manifest)
    licence = licence_string(manifest, packument)
    readme = packument.get("readme") if isinstance(packument.get("readme"), str) else ""
    readme_signals = scan_readme(readme)

    funding_donation = [u for u in funding if any(host in u.lower() for host in DONATION_HOSTS)]
    # A `funding` URL that is not a known donation host is usually the project's
    # own site, which may or may not sell anything; it counts as donation-grade
    # evidence only, never as a price.
    donation = bool(funding) or bool(readme_signals["donation_hosts"])
    commercial_licence = licence_is_commercial(licence)
    commercial = bool(readme_signals["commercial_hits"]) or commercial_licence

    if commercial:
        route = "commercial"
    elif donation:
        route = "donation"
    else:
        route = "none"

    return {
        "name": name,
        "resolved": True,
        "error": None,
        "route": route,
        "licence": licence,
        "licence_commercial": commercial_licence,
        "funding_declared": bool(funding),
        "funding_urls": funding[:6],
        "funding_donation_hosts": funding_donation[:6],
        "readme_available": readme_available and bool(readme),
        "readme_bytes": len(readme),
        "readme_commercial_hits": readme_signals["commercial_hits"],
        "readme_donation_hosts": readme_signals["donation_hosts"],
        "repository": (manifest.get("repository") or {}).get("url")
        if isinstance(manifest.get("repository"), dict)
        else manifest.get("repository"),
    }


# --------------------------------------------------------------------------
# Population
# --------------------------------------------------------------------------


def build_population(key: str, spec: dict) -> list[dict]:
    """The category's leaf listings, identically to the download study."""
    seen: dict[str, dict] = {}
    for query in spec["queries"]:
        for row in search(query):
            name = row["name"]
            if not name or name in seen:
                continue
            if is_artifact(name):
                continue
            if not is_relevant(row, spec["terms"]):
                continue
            seen[name] = row
    # Leaf listings only: downloads come from someone finding the package, not
    # from a parent pulling it in. Same filter the download study reports on.
    return [row for row in seen.values() if row["dependents"] == 0]


def split_winners(rows: list[dict]) -> tuple[list[dict], list[dict], int]:
    """Partition a category at its own top-decile download threshold."""
    ordered = sorted(rows, key=lambda r: r["monthly"], reverse=True)
    if not ordered:
        return [], [], 0
    index = max(0, int(round((WINNER_PERCENTILE / 100) * (len(ordered) - 1))))
    threshold = sorted(r["monthly"] for r in ordered)[index]
    winners = [r for r in ordered if r["monthly"] >= threshold]
    rest = [r for r in ordered if r["monthly"] < threshold]
    return winners, rest, threshold


def evenly_spaced(rows: list[dict], count: int) -> list[dict]:
    """A deterministic spread across a download-ordered list.

    Deterministic rather than random so the run reproduces exactly, and spread
    rather than top-N so the control is not just the near-winners.
    """
    if len(rows) <= count:
        return list(rows)
    step = len(rows) / count
    return [rows[int(i * step)] for i in range(count)]


def summarise(classified: list[dict]) -> dict:
    """Route shares over the packages that resolved."""
    resolved = [c for c in classified if c["resolved"]]
    total = len(resolved)
    counts = {route: sum(1 for c in resolved if c["route"] == route) for route in ("none", "donation", "commercial")}
    shares = {route: (round(100 * n / total, 1) if total else None) for route, n in counts.items()}
    return {
        "sampled": len(classified),
        "resolved": total,
        "unresolved": len(classified) - total,
        "readme_available": sum(1 for c in resolved if c.get("readme_available")),
        "counts": counts,
        "shares_pct": shares,
        "funding_declared": sum(1 for c in resolved if c.get("funding_declared")),
        "licence_commercial": sum(1 for c in resolved if c.get("licence_commercial")),
    }


def run(selected: list[str], now: datetime) -> dict:
    results: dict = {
        "measured_at": now.isoformat(),
        "registry": REGISTRY,
        "winner_percentile": WINNER_PERCENTILE,
        "control_sample": CONTROL_SAMPLE,
        "categories": {},
    }
    for key in selected:
        spec = CATEGORIES[key]
        print(f"\n=== {key} ({spec['candidate']}) ===", file=sys.stderr)
        population = build_population(key, spec)
        winners, rest, threshold = split_winners(population)
        control = evenly_spaced(rest, CONTROL_SAMPLE)
        print(
            f"  leaves={len(population)} threshold={threshold}/mo "
            f"winners={len(winners)} control={len(control)}",
            file=sys.stderr,
        )

        winner_rows = []
        for i, row in enumerate(winners, 1):
            print(f"  winner {i}/{len(winners)} {row['name']}", file=sys.stderr)
            record = classify(row["name"])
            record["monthly"] = row["monthly"]
            winner_rows.append(record)

        control_rows = []
        for i, row in enumerate(control, 1):
            print(f"  control {i}/{len(control)} {row['name']}", file=sys.stderr)
            record = classify(row["name"])
            record["monthly"] = row["monthly"]
            control_rows.append(record)

        results["categories"][key] = {
            "candidate": spec["candidate"],
            "population_leaves": len(population),
            "top_decile_threshold_monthly": threshold,
            "downloads": {
                "winners": percentiles([r["monthly"] for r in winners]),
                "control": percentiles([r["monthly"] for r in control]),
            },
            "winners": summarise(winner_rows),
            "control": summarise(control_rows),
            "rows": {"winners": winner_rows, "control": control_rows},
        }
    return results


def report(results: dict) -> None:
    print("\n" + "=" * 78)
    print("Declared monetisation route, by category and by discovery outcome")
    print("=" * 78)
    header = f"{'category':<24} {'group':<9} {'n':>4} {'none':>7} {'donation':>9} {'commercial':>11}"
    print(header)
    print("-" * len(header))
    for key, block in results["categories"].items():
        for group in ("winners", "control"):
            summary = block[group]
            shares = summary["shares_pct"]
            print(
                f"{key:<24} {group:<9} {summary['resolved']:>4} "
                f"{_pct(shares['none']):>7} {_pct(shares['donation']):>9} {_pct(shares['commercial']):>11}"
            )
    print()
    for key, block in results["categories"].items():
        print(
            f"{key}: {block['population_leaves']} leaves, "
            f"top-decile threshold {block['top_decile_threshold_monthly']:,}/mo"
        )


def _pct(value: float | None) -> str:
    return "-" if value is None else f"{value:.1f}%"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--categories", nargs="*", choices=sorted(CATEGORIES), default=sorted(CATEGORIES))
    parser.add_argument("--out", type=Path, default=None, help="write the full result JSON here")
    args = parser.parse_args()

    results = run(list(args.categories), datetime.now(timezone.utc))
    report(results)
    if args.out:
        args.out.write_text(json.dumps(results, indent=2, sort_keys=True) + "\n")
        print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
