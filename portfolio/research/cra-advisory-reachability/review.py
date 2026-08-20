#!/usr/bin/env python3
"""Manual-review pass: classify each version-range finding as reachable or not.

Two independent over-report causes are separated:
  (A) multi-version trees  - the package name matches, but the *path* carrying
      the vulnerable version is dev-only or absent from the shipped artifact
  (B) feature reachability - the advisory describes a server runtime feature
      that a statically-exported build does not ship at all
"""
import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
FIND = json.load(open(
    str(Path(__file__).with_name("results-2026-08-20-findings.json"))))

# products whose next.config sets output:"export" (verified by reading the files)
STATIC_EXPORT = {
    "ventures/real-estate-agent-photo-app/docs-site",
    "ventures/real-estate-agent-photo-app/research",
}

# advisory text -> requires a running Next.js server (absent in a static export).
# Adjudicated by reading all 21 distinct `next` advisories that matched the two
# statically-exported products, not by keyword guessing: every one of them
# describes request handling, and both products also set images.unoptimized.
SERVER_FEATURE = re.compile(
    r"server action|middleware|proxy|image optimi|rewrites|"
    r"cache poisoning|cache confusion|request smuggling|"
    r"request deserialization|server function|server component|"
    r"denial of service|beforeInteractive|websocket|next/image",
    re.I,
)

# The single genuinely arguable case: CSP nonces are generated per request, so a
# static export cannot use the vulnerable code path either -- but neither product
# configures CSP at all, so this rests on configuration rather than on the export
# mode. Counted both ways below to give a range instead of a false point estimate.
ARGUABLE = re.compile(r"CSP nonces", re.I)


def paths_for(product, pkg):
    """Every lockfile path that installs pkg, with its version and dev flag."""
    lock = json.loads((REPO / product / "package-lock.json").read_text())
    out = []
    for path, meta in lock.get("packages", {}).items():
        if path.startswith("node_modules/") and path.split("node_modules/")[-1] == pkg:
            out.append({
                "path": path,
                "version": meta.get("version"),
                "dev": bool(meta.get("dev") or meta.get("devOptional")),
            })
    return out


def in_range(ver, spec):
    """Minimal semver range check covering the operators npm's bulk feed emits."""
    def parse(v):
        m = re.match(r"(\d+)\.(\d+)\.(\d+)", v or "0.0.0")
        return tuple(int(x) for x in m.groups()) if m else (0, 0, 0)
    v = parse(ver)
    for clause in spec.split():
        m = re.match(r"(<=|>=|<|>|=)?\s*v?([\d.]+)", clause.strip())
        if not m:
            continue
        op, bound = m.group(1) or "=", parse(m.group(2))
        if op == "<" and not v < bound:
            return False
        if op == "<=" and not v <= bound:
            return False
        if op == ">" and not v > bound:
            return False
        if op == ">=" and not v >= bound:
            return False
        if op == "=" and v != bound:
            return False
    return True


rows = []
for f in FIND["findings"]:
    prod, pkg = f["product"], f["package"]
    paths = paths_for(prod, pkg)
    vuln_paths = [p for p in paths if in_range(p["version"], f["vulnerable_versions"])]
    shipped_vuln = [p for p in vuln_paths if not p["dev"]]

    if not vuln_paths:
        verdict, cause = "false_positive", "A: no installed version actually in range"
    elif not shipped_vuln:
        verdict, cause = "false_positive", "A: vulnerable version only on a dev-only path"
    elif prod in STATIC_EXPORT and pkg == "next" and ARGUABLE.search(f["title"]):
        verdict, cause = "arguable", "B?: needs per-request nonces, but rests on CSP config"
    elif prod in STATIC_EXPORT and pkg == "next" and SERVER_FEATURE.search(f["title"]):
        verdict, cause = "false_positive", "B: server-runtime feature, product is a static export"
    elif prod in STATIC_EXPORT and pkg in ("postcss", "nanoid"):
        verdict, cause = "false_positive", "B: build-time only, not in the static artifact"
    else:
        verdict, cause = "true_positive", "reachable in the shipped artifact"

    rows.append({**f, "verdict": verdict, "cause": cause,
                 "vuln_paths": [p["path"] for p in vuln_paths][:3],
                 "shipped_vuln_paths": len(shipped_vuln)})

json.dump(rows, open(
    str(Path(__file__).with_name("results-2026-08-20-reviewed.json")),
    "w"), indent=2)

import collections
print("verdicts:", collections.Counter(r["verdict"] for r in rows))
print("\ncauses:")
for c, n in collections.Counter(r["cause"] for r in rows).most_common():
    print(f"  {n:4d}  {c}")
tp = sum(1 for r in rows if r["verdict"] == "true_positive")
fp = sum(1 for r in rows if r["verdict"] == "false_positive")
arg = sum(1 for r in rows if r["verdict"] == "arguable")
n = len(rows)
print(f"\nfalse-positive rate: {fp/n:.1%} to {(fp+arg)/n:.1%}  ({fp}-{fp+arg} of {n}; {arg} arguable)")
print("\nper product:")
for p in sorted({r['product'] for r in rows}):
    sub = [r for r in rows if r["product"] == p]
    t = sum(1 for r in sub if r["verdict"] == "true_positive")
    a = sum(1 for r in sub if r["verdict"] == "arguable")
    print(f"  {p:50s} {len(sub):3d} findings -> {t:3d} true, {len(sub)-t-a:3d} false, {a:2d} arguable")
