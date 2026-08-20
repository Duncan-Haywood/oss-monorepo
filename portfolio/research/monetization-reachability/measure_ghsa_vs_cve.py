#!/usr/bin/env python3
"""Second half of the kill test: compare npm advisories against the CVE Project's
own records, which are a genuinely independent corpus.

Why a second script
-------------------
`measure_advisory_disagreement.py` grouped OSV's npm feed by CVE alias and found
only 11 CVEs out of 5,771 described by more than one publishing database. Taken
at face value that kills the reconciliation candidate outright.

It should not be taken at face value, because it is largely an artifact of the
method. **OSV deduplicates.** For npm, GitHub's GHSA records essentially *are*
the feed; a CVE record covering the same flaw is folded in as an alias rather
than carried alongside as a second opinion. So an intra-OSV comparison cannot
observe most of the disagreement it is looking for, by construction.

The independent corpus is `CVEProject/cvelistV5` -- every CVE record as
published by its assigning CNA, distributed as a git repository and therefore
reachable from this environment over `raw.githubusercontent.com`. Comparing
GHSA against that is a real cross-source comparison.

What is compared, and what deliberately is not
----------------------------------------------
Comparing version *ranges* across the two schemas requires normalising CVE's
free-text `versions[]` against OSV's event ranges, and that normalisation is
where a motivated analyst manufactures whatever disagreement rate they wanted.
It is not attempted here.

Three things are compared instead, each of which is a direct read of a field
rather than an interpretation of one:

  missing      the CVE id is aliased by a live GHSA advisory but has no record
               in cvelistV5 at all.
  rejected     the CVE record's state is REJECTED, while the GHSA advisory
               citing it is not withdrawn. This is the crisp one: a scanner
               consulting GHSA fails a build over a CVE its own authority has
               since retracted.
  no_versions  the CVE record carries no machine-readable affected-version
               bound (every `versions[]` entry is absent, "n/a", or unspecified),
               so the record cannot be used to decide whether an installed
               version is affected.

`rejected` is the product premise. `no_versions` is context: it measures how
much of the CVE corpus is unusable for gating regardless of agreement.

Sampling is seeded and the sample is written into the output, so the run is
reproducible and `--recompute-from` re-derives every rate offline.

Read-only. Stdlib only. No credentials. Paced.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request
import zipfile

RAW = ("https://raw.githubusercontent.com/CVEProject/cvelistV5/main/cves/"
       "{year}/{bucket}xxx/{cve}.json")

USER_AGENT = os.environ.get(
    "ADVISORY_PROBE_UA",
    "monorepo-projects-advisory-disagreement/1.0 (portfolio research; read-only)",
)


def cve_url(cve: str) -> str | None:
    """cvelistV5 shards by year and by the CVE's numeric id with the last three
    digits replaced by 'xxx' (CVE-2024-0001 -> cves/2024/0xxx/CVE-2024-0001.json)."""
    parts = cve.split("-")
    if len(parts) != 3:
        return None
    _, year, num = parts
    if not year.isdigit() or not num.isdigit():
        return None
    bucket = num[:-3] if len(num) > 3 else "0"
    return RAW.format(year=year, bucket=bucket, cve=cve)


def fetch_json(url: str, timeout: float = 25.0) -> tuple[dict | None, str]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read()), "ok"
    except urllib.error.HTTPError as exc:
        return None, f"http_{exc.code}"
    except Exception as exc:  # noqa: BLE001 - one failure must not abort the run
        return None, f"error_{type(exc).__name__}"


def cve_state(rec: dict) -> str:
    return (rec.get("cveMetadata") or {}).get("state", "UNKNOWN").upper()


def cve_has_version_bound(rec: dict) -> bool:
    """True if any CNA-listed affected product carries a usable version bound."""
    cna = (rec.get("containers") or {}).get("cna") or {}
    for aff in cna.get("affected", []) or []:
        for v in aff.get("versions", []) or []:
            if v.get("status", "").lower() == "unaffected":
                continue
            for key in ("lessThan", "lessThanOrEqual"):
                if v.get(key) and str(v[key]).lower() not in ("n/a", "unspecified", ""):
                    return True
            ver = str(v.get("version", "")).strip().lower()
            if ver and ver not in ("n/a", "unspecified", "*", "-"):
                return True
        if aff.get("defaultStatus", "").lower() == "affected" and aff.get("versions"):
            return True
    return False


def load_npm_ghsa_cves(cache: str) -> list[dict]:
    """From the cached OSV npm export, every live GHSA advisory with a CVE alias."""
    out = []
    with zipfile.ZipFile(cache) as zf:
        for name in zf.namelist():
            if not name.endswith(".json"):
                continue
            try:
                rec = json.loads(zf.read(name))
            except Exception:  # noqa: BLE001
                continue
            if not rec.get("id", "").upper().startswith("GHSA-"):
                continue
            cves = sorted({a for a in rec.get("aliases", [])
                           if a.upper().startswith("CVE-")})
            if not cves:
                continue
            out.append({
                "ghsa": rec["id"],
                "cve": cves[0],
                "ghsa_withdrawn": bool(rec.get("withdrawn")),
            })
    return out


def summarise(rows: list[dict]) -> dict:
    n = len(rows)
    fetched = [r for r in rows if r["fetch"] == "ok"]
    live = [r for r in fetched if not r["ghsa_withdrawn"]]

    def share(sub: list[dict], pred) -> float | None:
        return round(sum(1 for r in sub if pred(r)) / len(sub), 4) if sub else None

    return {
        "n_sampled": n,
        "n_cve_record_found": len(fetched),
        "missing_from_cvelist": share(rows, lambda r: r["fetch"] != "ok"),
        "n_live_ghsa_with_cve_record": len(live),
        "rejected_while_ghsa_live": share(live, lambda r: r["cve_state"] == "REJECTED"),
        "cve_record_has_no_version_bound": share(fetched, lambda r: not r["has_version_bound"]),
        "states": dict(sorted(
            {s: sum(1 for r in fetched if r["cve_state"] == s)
             for s in {r["cve_state"] for r in fetched}}.items(),
            key=lambda kv: -kv[1])),
    }


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", required=False,
                    help="cached OSV npm all.zip (from measure_advisory_disagreement.py)")
    ap.add_argument("--sample", type=int, default=300)
    ap.add_argument("--seed", type=int, default=20260819)
    ap.add_argument("--pace", type=float, default=0.15)
    ap.add_argument("--out")
    ap.add_argument("--recompute-from", metavar="JSON",
                    help="re-derive every rate from a saved run, offline")
    args = ap.parse_args()

    if args.recompute_from:
        with open(args.recompute_from) as fh:
            saved = json.load(fh)
        print(json.dumps(summarise(saved["rows"]), indent=2, sort_keys=True))
        return 0

    if not args.cache:
        print("--cache is required (run measure_advisory_disagreement.py first)",
              file=sys.stderr)
        return 2

    pop = load_npm_ghsa_cves(args.cache)
    print(f"population: {len(pop):,} npm GHSA advisories carrying a CVE alias",
          file=sys.stderr)

    rng = random.Random(args.seed)
    sample = rng.sample(pop, min(args.sample, len(pop)))

    rows = []
    for i, item in enumerate(sample, 1):
        url = cve_url(item["cve"])
        row = dict(item, url=url)
        if url is None:
            row.update(fetch="error_badid", cve_state="UNKNOWN", has_version_bound=False)
        else:
            rec, status = fetch_json(url)
            row.update(
                fetch=status,
                cve_state=cve_state(rec) if rec else "UNKNOWN",
                has_version_bound=cve_has_version_bound(rec) if rec else False,
            )
        rows.append(row)
        if i % 25 == 0 or i == len(sample):
            print(f"  [{i}/{len(sample)}]", file=sys.stderr)
        time.sleep(args.pace)

    summary = summarise(rows)
    payload = {
        "generated_by": "portfolio/research/monetization-reachability/measure_ghsa_vs_cve.py",
        "population_size": len(pop),
        "seed": args.seed,
        "summary": summary,
        "rows": rows,
    }
    print("\n" + json.dumps(summary, indent=2, sort_keys=True), file=sys.stderr)

    if args.out:
        with open(args.out, "w") as fh:
            fh.write(json.dumps(payload, indent=2, sort_keys=False) + "\n")
        print(f"\nwrote {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
