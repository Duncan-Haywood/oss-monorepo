#!/usr/bin/env python3
"""Inventory + match: the first two steps of cra-evidence-desk's own first experiment.

Reads npm lockfiles directly (no install), builds a component inventory with a
dev/prod flag, and matches it against the npm registry's bulk advisory endpoint
(the same feed `npm audit` uses, and one of the few reachable from this
environment). Emits per-finding records so version-range-only matching can be
compared against manual review.
"""
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
BULK = "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk"


def inventory(lockfile):
    """Return {name: {"versions": set, "dev": bool}} from a v2/v3 package-lock."""
    data = json.loads(lockfile.read_text())
    pkgs = data.get("packages")
    if not pkgs:
        return {}
    comps = {}
    for path, meta in pkgs.items():
        if not path.startswith("node_modules/"):
            continue
        name = path.split("node_modules/")[-1]
        ver = meta.get("version")
        if not ver:
            continue
        rec = comps.setdefault(name, {"versions": set(), "dev": True})
        rec["versions"].add(ver)
        # a component is prod if ANY path to it is non-dev
        if not (meta.get("dev") or meta.get("devOptional")):
            rec["dev"] = False
    return comps


def bulk_query(comps):
    payload = {n: sorted(r["versions"]) for n, r in comps.items()}
    out = subprocess.run(
        ["curl", "-sS", "--max-time", "60", "-X", "POST", BULK,
         "-H", "Content-Type: application/json", "-d", json.dumps(payload)],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        raise RuntimeError(out.stderr[:300])
    return json.loads(out.stdout or "{}")


def main():
    locks = sorted(
        p for p in REPO.glob("ventures/**/package-lock.json")
        if "node_modules" not in p.parts
    )
    findings = []
    summary = []
    for lock in locks:
        comps = inventory(lock)
        if not comps:
            continue
        advisories = bulk_query(comps)
        n_find = 0
        for name, advs in advisories.items():
            for a in advs:
                n_find += 1
                findings.append({
                    "product": str(lock.parent.relative_to(REPO)),
                    "package": name,
                    "installed": sorted(comps[name]["versions"]),
                    "dev_only": comps[name]["dev"],
                    "severity": a.get("severity"),
                    "title": a.get("title"),
                    "vulnerable_versions": a.get("vulnerable_versions"),
                    "url": a.get("url"),
                })
        summary.append({
            "product": str(lock.parent.relative_to(REPO)),
            "components": len(comps),
            "findings": n_find,
        })
        print(f"{str(lock.parent.relative_to(REPO)):55s} components={len(comps):5d} findings={n_find}", file=sys.stderr)

    Path(sys.argv[1]).write_text(json.dumps(
        {"summary": summary, "findings": findings}, indent=2))
    tot_c = sum(s["components"] for s in summary)
    tot_f = sum(s["findings"] for s in summary)
    print(f"\nTOTAL: {len(summary)} products, {tot_c} components, {tot_f} findings", file=sys.stderr)


if __name__ == "__main__":
    main()
