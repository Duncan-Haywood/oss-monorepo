#!/usr/bin/env python3
"""Kill-test for the one candidate this environment's reachable data suggests:
do independent advisory sources actually disagree about the same vulnerability?

Why this exists
---------------
`probe_rails_and_sources.py` found that the whole public vulnerability corpus is
reachable from here by routes PR #126 did not probe -- the OSV mirror on
`storage.googleapis.com`, the GitHub Advisory Database and the CVE Project's
`cvelistV5`, both as git repositories on `raw.githubusercontent.com`. That makes
a *cross-source advisory reconciliation* product operable from this environment,
where nothing else in the candidate pipeline is except `mcp-supply-chain-watch`.

Operable is not the same as worth building. The product's entire premise is that
sources disagree often enough that a developer's scanner verdict depends on which
database it happens to consult. If they agree, there is nothing to sell.

Following the pattern PR #103 and PR #111 set in this repo, the candidate is
measured against its own premise before it is written up, and the measurement is
allowed to kill it.

Method
------
OSV's npm feed is a *federation*: one ecosystem, many upstream databases (GHSA
from GitHub, EEF from the Erlang Ecosystem Foundation, PYSEC, RUSTSEC, and CVE
records themselves). When two of those independently describe the same
underlying vulnerability, they carry each other's ids in `aliases`.

So the comparison needs no cross-referencing heuristics and no second network
source: group records by the CVE they alias, keep the groups with two or more
*distinct-prefix* records, and compare what those records actually claim.

Three claims are compared, in increasing order of how much a false answer costs
a user:

  package    -- do the sources even name the same affected package(s)?
  ranges     -- do they name the same affected version ranges? This is the one
                that decides whether a given installed version is flagged.
  withdrawn  -- has one source withdrawn the advisory while another has not?
                A withdrawn advisory that a scanner still enforces is a build
                broken over a vulnerability that no longer officially exists.

Severity is deliberately *not* counted as a disagreement. CVSS vectors are
assigned by different parties under different rules and differing is expected
rather than anomalous; counting it would inflate the headline with something no
reasonable buyer would call an error.

Read-only. Stdlib only. No credentials. One download, cached on disk, then all
computation is local -- `--recompute-from` re-derives every published number
from the saved JSON without touching the network.
"""

from __future__ import annotations

import argparse
import collections
import io
import json
import os
import statistics
import sys
import urllib.request
import zipfile

OSV_MIRROR = "https://storage.googleapis.com/osv-vulnerabilities/{ecosystem}/all.zip"

USER_AGENT = os.environ.get(
    "ADVISORY_PROBE_UA",
    "monorepo-projects-advisory-disagreement/1.0 (portfolio research; read-only)",
)


def fetch_zip(ecosystem: str, cache: str | None) -> zipfile.ZipFile:
    """Download the ecosystem's full OSV export, using a disk cache if given."""
    if cache and os.path.exists(cache):
        print(f"using cached {cache}", file=sys.stderr)
        return zipfile.ZipFile(cache)
    url = OSV_MIRROR.format(ecosystem=ecosystem)
    print(f"downloading {url}", file=sys.stderr)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=300) as resp:
        blob = resp.read()
    print(f"  {len(blob):,} bytes", file=sys.stderr)
    if cache:
        with open(cache, "wb") as fh:
            fh.write(blob)
        return zipfile.ZipFile(cache)
    return zipfile.ZipFile(io.BytesIO(blob))


def source_prefix(osv_id: str) -> str:
    """'GHSA-xxxx-yyyy' -> 'GHSA'. The publishing database."""
    return osv_id.split("-", 1)[0].upper()


def cve_aliases(rec: dict) -> list[str]:
    return sorted({a for a in rec.get("aliases", []) if a.upper().startswith("CVE-")})


def normalised_packages(rec: dict) -> set[str]:
    out = set()
    for aff in rec.get("affected", []) or []:
        pkg = (aff.get("package") or {}).get("name")
        if pkg:
            out.add(pkg.lower())
    return out


def normalised_ranges(rec: dict) -> set[tuple]:
    """A comparable summary of 'which versions are affected'.

    Both the explicit `ranges` (introduced/fixed/last_affected events) and the
    enumerated `versions` list are folded in, because different databases use
    different ones to say the same thing and comparing only one form would
    manufacture disagreements that are purely notational.
    """
    out: set[tuple] = set()
    for aff in rec.get("affected", []) or []:
        pkg = ((aff.get("package") or {}).get("name") or "").lower()
        for rng in aff.get("ranges", []) or []:
            for ev in rng.get("events", []) or []:
                for key in ("introduced", "fixed", "last_affected", "limit"):
                    if key in ev:
                        val = str(ev[key])
                        # "introduced: 0" is the universal default and carries no
                        # information; including it would make sparse records
                        # look like they agree with everything.
                        if key == "introduced" and val == "0":
                            continue
                        out.add((pkg, key, val))
    return out


def enumerated_versions(rec: dict) -> set[tuple]:
    out: set[tuple] = set()
    for aff in rec.get("affected", []) or []:
        pkg = ((aff.get("package") or {}).get("name") or "").lower()
        for v in aff.get("versions", []) or []:
            out.add((pkg, str(v)))
    return out


def analyse(records: list[dict]) -> dict:
    """Group by CVE, compare multi-source groups, return the full report."""
    by_cve: dict[str, list[dict]] = collections.defaultdict(list)
    for rec in records:
        for cve in cve_aliases(rec):
            by_cve[cve].append(rec)

    groups = []
    for cve, recs in by_cve.items():
        prefixes = {source_prefix(r["id"]) for r in recs}
        if len(prefixes) < 2:
            continue  # one publishing database; nothing to reconcile

        pkgs = {r["id"]: normalised_packages(r) for r in recs}
        rngs = {r["id"]: normalised_ranges(r) for r in recs}
        vers = {r["id"]: enumerated_versions(r) for r in recs}
        withdrawn = {r["id"]: bool(r.get("withdrawn")) for r in recs}

        pkg_sets = list(pkgs.values())
        rng_sets = [rngs[i] | vers[i] for i in rngs]

        pkg_disagree = any(s != pkg_sets[0] for s in pkg_sets[1:])
        # A record with no version information at all is not disagreeing, it is
        # silent. Counting silence as disagreement would be the easiest way to
        # inflate this number, so empty sets are excluded from the comparison.
        nonempty = [s for s in rng_sets if s]
        rng_disagree = len(nonempty) >= 2 and any(s != nonempty[0] for s in nonempty[1:])
        rng_silent = len(nonempty) < len(rng_sets)
        withdrawn_split = len(set(withdrawn.values())) > 1

        groups.append({
            "cve": cve,
            "ids": sorted(r["id"] for r in recs),
            "sources": sorted(prefixes),
            "package_disagreement": pkg_disagree,
            "range_disagreement": rng_disagree,
            "range_silent_in_some_source": rng_silent,
            "withdrawn_split": withdrawn_split,
            "any_disagreement": pkg_disagree or rng_disagree or withdrawn_split,
        })

    n = len(groups)
    def rate(key: str) -> float | None:
        return round(sum(1 for g in groups if g[key]) / n, 4) if n else None

    return {
        "n_records": len(records),
        "n_records_with_cve_alias": sum(1 for r in records if cve_aliases(r)),
        "n_cves_seen": len(by_cve),
        "n_multi_source_cves": n,
        "multi_source_share_of_cves": round(n / len(by_cve), 4) if by_cve else None,
        "rates_within_multi_source_groups": {
            "package_disagreement": rate("package_disagreement"),
            "range_disagreement": rate("range_disagreement"),
            "range_silent_in_some_source": rate("range_silent_in_some_source"),
            "withdrawn_split": rate("withdrawn_split"),
            "any_disagreement": rate("any_disagreement"),
        },
        "source_pairs": dict(collections.Counter(
            " + ".join(g["sources"]) for g in groups).most_common(12)),
        "groups": groups,
    }


def report(a: dict) -> str:
    r = a["rates_within_multi_source_groups"]
    lines = [
        f"records in feed:                    {a['n_records']:,}",
        f"  carrying a CVE alias:             {a['n_records_with_cve_alias']:,}",
        f"distinct CVEs referenced:           {a['n_cves_seen']:,}",
        f"CVEs described by >1 database:      {a['n_multi_source_cves']:,} "
        f"({a['multi_source_share_of_cves']:.2%} of CVEs seen)"
        if a["multi_source_share_of_cves"] is not None else "",
        "",
        "within those multi-source groups:",
        f"  disagree on affected package:     {r['package_disagreement']}",
        f"  disagree on affected versions:    {r['range_disagreement']}",
        f"  one source silent on versions:    {r['range_silent_in_some_source']}",
        f"  withdrawn in one but not another: {r['withdrawn_split']}",
        f"  ANY of the above:                 {r['any_disagreement']}",
    ]
    return "\n".join(x for x in lines if x != "")


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ecosystem", default="npm",
                    help="OSV ecosystem to export (npm, PyPI, crates.io, ...)")
    ap.add_argument("--cache", help="path to cache the downloaded zip")
    ap.add_argument("--out", help="write the report JSON here")
    ap.add_argument("--recompute-from", metavar="JSON",
                    help="re-derive every headline number from a saved run, offline")
    args = ap.parse_args()

    if args.recompute_from:
        with open(args.recompute_from) as fh:
            saved = json.load(fh)
        redone = {
            "n_multi_source_cves": len(saved["groups"]),
            "rates": {
                k: round(sum(1 for g in saved["groups"] if g[k]) / len(saved["groups"]), 4)
                for k in ("package_disagreement", "range_disagreement",
                          "range_silent_in_some_source", "withdrawn_split",
                          "any_disagreement")
            } if saved["groups"] else {},
        }
        print(json.dumps(redone, indent=2, sort_keys=True))
        return 0

    zf = fetch_zip(args.ecosystem, args.cache)
    records = []
    for name in zf.namelist():
        if not name.endswith(".json"):
            continue
        try:
            records.append(json.loads(zf.read(name)))
        except Exception:  # noqa: BLE001 - one malformed record must not abort
            continue
    print(f"parsed {len(records):,} records", file=sys.stderr)

    analysis = analyse(records)
    analysis["ecosystem"] = args.ecosystem
    analysis["generated_by"] = (
        "portfolio/research/monetization-reachability/measure_advisory_disagreement.py")

    print("\n" + report(analysis), file=sys.stderr)

    if args.out:
        with open(args.out, "w") as fh:
            fh.write(json.dumps(analysis, indent=2, sort_keys=False) + "\n")
        print(f"\nwrote {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
