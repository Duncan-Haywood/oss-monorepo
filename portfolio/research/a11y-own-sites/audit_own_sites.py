#!/usr/bin/env python3
"""Run this portfolio's accessibility engines over this portfolio's own pages.

Both engines were built to sell an accessibility evidence record
(`portfolio/pipeline/candidates/eaa-remediation-pipeline.md`, the pipeline's
highest-composite candidate, whose verdict is to build it as a
`local-site-studio` product line). Neither had ever been pointed at a page this
portfolio ships. That leaves two questions unanswered at once:

1. **Do the ventures' own shipped pages pass?** A portfolio that intends to sell
   accessibility evidence cannot ship the defects it plans to charge to find.
2. **Does the engine hold up out of sample?** `eaa-wcag-triage`'s only
   validation is a three-page fixture set written alongside the engine, and
   `a11y-engine-agreement/` reconciled the two engines on that same three-page
   set. Agreement on markup written to exercise the rules is a weak test.

The corpus is the HTML each venture's own build emits — prerendered App Router
pages under `.next/server/app/`, Pages Router fallbacks under
`.next/server/pages/`, and static exports under `out/`. Nothing is fetched.

Reproducing the corpus (the builds are not committed; the results are)::

    cd ventures/<name> && npm ci && npm run build     # per venture
    python3 audit_own_sites.py --repo-root ../../..  --out results.json

Offline re-derivation of every number in the README, with no build and no
network::

    python3 audit_own_sites.py --recompute-from results-2026-08-21.json

Standard library only. Reads local files, writes only its ``--out`` path, takes
no credentials, publishes nothing, spends nothing.
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
AUDIT_DIR = ROOT / "portfolio/research/a11y-evidence-record"
PROBE_SRC = ROOT / "portfolio/pipeline/probes/eaa-wcag-triage/src"

for _path in (str(AUDIT_DIR), str(PROBE_SRC)):
    if _path not in sys.path:
        sys.path.insert(0, _path)

# Where a Next.js build leaves HTML, relative to an app directory.
BUILD_DIRS = (".next/server/app", ".next/server/pages", "out", "dist")


# ---------------------------------------------------------------------------
# Corpus
# ---------------------------------------------------------------------------

def discover(repo_root: pathlib.Path) -> list:
    """Every built HTML page under `ventures/`, tagged with the app that built it.

    An "app" is the nearest ancestor directory holding a `package.json`, so
    `ventures/photo-editing/docs-site` counts separately from its parent
    venture. Returns ``[(app_label, path), ...]`` sorted by label then path.
    """
    ventures = repo_root / "ventures"
    found = []
    for app_dir in sorted(p.parent for p in ventures.glob("*/**/package.json")
                          if "node_modules" not in p.parts):
        for build_dir in BUILD_DIRS:
            base = app_dir / build_dir
            if not base.is_dir():
                continue
            for page in sorted(base.rglob("*.html")):
                found.append((str(app_dir.relative_to(repo_root)), page))
    return sorted(found, key=lambda r: (r[0], str(r[1])))


def dedupe(pages: list) -> tuple:
    """Drop byte-identical pages, keeping the first.

    A Next.js build emits the same 404 body under both routers, and a static
    export writes `x.html` and `x/index.html`. Counting those twice would
    inflate both the defect total and the agreement denominator without adding
    a single distinct page.
    """
    seen = {}
    unique, duplicates = [], []
    for label, path in pages:
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest in seen:
            duplicates.append((label, path.name, seen[digest]))
        else:
            seen[digest] = f"{label}/{path.name}"
            unique.append((label, path))
    return unique, duplicates


# ---------------------------------------------------------------------------
# Engine adapters
# ---------------------------------------------------------------------------

def _number(criterion: str) -> str:
    """'1.2.2 Captions (Prerecorded)' -> '1.2.2'."""
    return criterion.split()[0]


def probe_findings(html: str) -> list:
    from wcag_triage.engine import audit_html

    return [
        {
            "criterion": f.criterion,
            "impact": f.impact,
            "element": f.element,
            "message": f.message,
        }
        for f in audit_html(html).findings
    ]


def audit_py_criteria(html: str) -> list:
    import audit

    result = audit.audit_source(html, "page.html")
    return sorted(_number(f["success_criterion"]) for f in result["findings"])


# ---------------------------------------------------------------------------
# Measurement
# ---------------------------------------------------------------------------

def measure(repo_root: pathlib.Path) -> dict:
    pages, duplicates = dedupe(discover(repo_root))
    per_page = []
    for label, path in pages:
        html = path.read_text(encoding="utf-8", errors="replace")
        findings = probe_findings(html)
        probe_counts = collections.Counter(f["criterion"] for f in findings)
        audit_counts = collections.Counter(audit_py_criteria(html))
        per_page.append({
            "app": label,
            "page": path.name,
            "findings": findings,
            "probe_criteria": dict(sorted(probe_counts.items())),
            "audit_py_criteria": dict(sorted(audit_counts.items())),
            "only_probe": dict(sorted((probe_counts - audit_counts).items())),
            "only_audit_py": dict(sorted((audit_counts - probe_counts).items())),
            "engines_agree": probe_counts == audit_counts,
        })
    return {
        "corpus": {
            "apps": sorted({r["app"] for r in per_page}),
            "pages_built": len(pages) + len(duplicates),
            "pages_unique": len(pages),
            "duplicates_dropped": len(duplicates),
        },
        "per_page": per_page,
    }


def defects_by_app(data: dict) -> dict:
    table = collections.defaultdict(collections.Counter)
    for row in data["per_page"]:
        for finding in row["findings"]:
            table[row["app"]][(finding["criterion"], finding["impact"])] += 1
    return {app: {f"{c} ({i})": n for (c, i), n in sorted(counts.items())}
            for app, counts in sorted(table.items())}


def agreement(data: dict) -> dict:
    rows = data["per_page"]
    disagreeing = [r for r in rows if not r["engines_agree"]]
    swaps = collections.Counter()
    for row in disagreeing:
        swaps[(tuple(sorted(row["only_audit_py"])), tuple(sorted(row["only_probe"])))] += 1
    return {
        "pages": len(rows),
        "agreeing": len(rows) - len(disagreeing),
        "disagreeing": len(disagreeing),
        # Every disagreement observed so far is a pure relabelling: the two
        # engines find the same defect and cite a different criterion. If a
        # page ever appears here where one engine finds a defect the other
        # does not, that is a detection gap and a different problem.
        "pure_relabellings": sum(
            n for (a, b), n in swaps.items() if len(a) == len(b) and a and b
        ),
        "swaps": [{"only_audit_py": list(a), "only_probe": list(b), "pages": n}
                  for (a, b), n in sorted(swaps.items(), key=lambda kv: -kv[1])],
    }


# ---------------------------------------------------------------------------

def summarise(data: dict) -> str:
    corpus, out = data["corpus"], []
    out.append(f"Corpus: {corpus['pages_unique']} unique pages from "
               f"{len(corpus['apps'])} built apps "
               f"({corpus['duplicates_dropped']} byte-identical duplicates dropped)")
    out.append("")
    out.append("Defects found on this portfolio's own pages (eaa-wcag-triage)")
    table = defects_by_app(data)
    for app, counts in table.items():
        cells = ", ".join(f"{k} x{v}" for k, v in counts.items())
        out.append(f"  {app}: {cells or 'none'}")
    clean = [a for a in corpus["apps"] if a not in table]
    out.append(f"  apps with no findings: {clean or 'none'}")
    out.append("")
    agree = agreement(data)
    out.append(f"Engine agreement out of sample: {agree['agreeing']}/{agree['pages']} "
               f"pages produce an identical criterion multiset "
               f"({agree['disagreeing']} disagree, "
               f"{agree['pure_relabellings']} of them pure relabellings)")
    for swap in agree["swaps"]:
        out.append(f"  audit.py {swap['only_audit_py']} vs probe "
                   f"{swap['only_probe']}: {swap['pages']} page(s)")
    return "\n".join(out)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--repo-root", type=pathlib.Path, default=ROOT,
                    help="repository root holding ventures/ with builds already run")
    ap.add_argument("--out", type=pathlib.Path, help="write the full result set here")
    ap.add_argument("--recompute-from", type=pathlib.Path,
                    help="re-derive the summary from a saved results file, offline")
    args = ap.parse_args(argv)

    if args.recompute_from:
        data = json.loads(args.recompute_from.read_text())
    else:
        data = measure(args.repo_root.resolve())
        if not data["per_page"]:
            print("No built HTML found. Build the ventures first — see the "
                  "module docstring.", file=sys.stderr)
            return 1

    print(summarise(data))
    if args.out:
        args.out.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")
        print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
