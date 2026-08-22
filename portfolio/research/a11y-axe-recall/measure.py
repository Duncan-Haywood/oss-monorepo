#!/usr/bin/env python3
"""Out-of-sample recall: does axe-core corroborate what our two engines catch?

`portfolio/research/a11y-external-coverage-reference/` measured out-of-sample
**precision** (0.821-0.881, `a11y-own-sites/`) and named the asymmetry its own
README closes on:

    out-of-sample recall is not measured anywhere. The only recall number in
    the repository is 1.0, against the three-page fixture set written
    alongside the engine [...] That asymmetry is itself the liability shape:
    the error direction that costs a refund has been measured, and the
    direction that costs a lawsuit has not. The cheapest honest next step is
    to run axe-core itself over the 118-page corpus and diff [...] It needs a
    headless browser, which is why it is named here rather than done.

This module is that step. It reuses the same 118-page corpus
`a11y-own-sites/` built (each venture's own `npm run build` output — nothing
fetched), runs `axe-core` 4.13.0 against every page through a real DOM
(Playwright + Chromium, both already provisioned in this environment), and
asks one question per (page, criterion) pair: when axe-core flags a criterion
our engines *claim to check* (`COVERAGE`/`CHECKS`, `automated`/`partial`), do
we also flag it on that same page?

axe-core is a reference, not ground truth — `a11y-external-coverage-reference/`
says so and the same caveat applies here: it is one vendor's automatable
subset, so this measures agreement with an independent detector, not the true
false-negative rate against a human-verified WCAG audit. It is still the first
number in this repository's history that is not self-referential — the two
in-house engines share an author, and the fixture set was written to exercise
their own rules.

Reproducing the corpus (the builds are not committed; the results are)::

    cd ventures/<name> && npm ci && npm run build     # per venture, all 7 apps
    cd portfolio/research/a11y-axe-recall
    npm install axe-core@4.13.0 playwright@1.56.1 --no-save   # not committed
    python3 measure.py --repo-root ../../.. --out results.json

Offline re-derivation of every number in the README, with no build, no
browser, no network::

    python3 measure.py --recompute-from results-2026-08-22.json

Reads local files and the committed `axe-rules-4.13.0.json` catalog; writes
only `--out`. The only network step is `npm install` above, against
`registry.npmjs.org` (already measured reachable — `egress-reachability/`).
"""

from __future__ import annotations

import argparse
import collections
import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OWN_SITES = ROOT / "portfolio/research/a11y-own-sites"
EXT_COVERAGE = ROOT / "portfolio/research/a11y-external-coverage-reference"
AXE_CATALOG = EXT_COVERAGE / "axe-rules-4.13.0.json"
RUN_AXE = HERE / "run_axe.mjs"

for _path in (str(OWN_SITES),):
    if _path not in sys.path:
        sys.path.insert(0, _path)


def _load_module(name: str, path: pathlib.Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


aos = _load_module("_a11y_own_sites", OWN_SITES / "audit_own_sites.py")
extcov = _load_module("_a11y_external_coverage", EXT_COVERAGE / "measure.py")

# `aos`'s import already put both engines' packages on `sys.path` as a side
# effect (see its module-level `sys.path.insert` calls), so these resolve.
import audit as audit_py  # noqa: E402
from wcag_triage.engine import audit_html  # noqa: E402


# ---------------------------------------------------------------------------
# The external stylesheet neither adapter in `a11y-own-sites/` passes
#
# Both engines' contrast rule (1.4.3) takes an optional *parsed, linked* CSS
# argument and is explicit that with none, "the colour rules simply find
# nothing to decide" (`wcag_triage.engine.audit_html`'s own docstring) —
# `audit.audit_source` says the same. `a11y-own-sites/audit_own_sites.py`'s
# adapters call both with no stylesheet at all, on a corpus that is 100%
# Next.js output with zero inline `<style>` — so across all 118 pages, 1.4.3
# was never actually evaluated against real CSS by either engine. This
# module reads the same build-emitted CSS `a11y-contrast-decidability/`
# already established is 98.76% decidable, and feeds it to both engines, so
# a page that both this module and axe-core see the same stylesheet for is
# the only fair recall comparison. (`a11y-own-sites/`'s own precision/
# agreement numbers are unaffected by false positives from this — 1.4.3
# simply produced zero findings there, an undercount rather than an
# overcount — but it is a real gap in that directory worth its own fix.)
# ---------------------------------------------------------------------------

def css_for_app(app_dir: pathlib.Path) -> str:
    sources = []
    for build_dir in (".next", "out", "dist"):
        base = app_dir / build_dir
        if base.is_dir():
            sources.extend(sorted(base.rglob("*.css")))
    return "\n".join(p.read_text(errors="replace") for p in sources)


def stylesheet_for_app(app_dir: pathlib.Path):
    css = css_for_app(app_dir)
    if not css.strip():
        return None
    return audit_py.merge_stylesheets([css])


def probe_criteria_with_css(html: str, sheet) -> set:
    return {f.criterion for f in audit_html(html, stylesheet=sheet).findings}


def audit_py_criteria_with_css(html: str, sheet) -> set:
    result = audit_py.audit_source(html, "page.html", stylesheet=sheet)
    return {f["success_criterion"].split()[0] for f in result["findings"]}


# ---------------------------------------------------------------------------
# axe-core rule -> success-criterion mapping, from the committed catalog
# ---------------------------------------------------------------------------

def axe_rule_criteria() -> dict:
    """axe rule id -> set of WCAG success-criterion numbers it tests.

    Unfiltered by level: the criteria this module cares about (the checked
    set below) are already restricted to A/AA by `COVERAGE`/`CHECKS`
    themselves, so filtering the axe side again would only drop rules on
    criteria this measurement never queries.
    """
    raw = json.loads(AXE_CATALOG.read_text(encoding="utf-8"))
    return {rule["id"]: set(rule["sc"]) for rule in raw["rules"] if rule.get("sc")}


def checked_criteria() -> set:
    """Union of what either in-house engine claims to detect (not just disclose)."""
    probe = extcov.probe_catalog()
    audit = extcov.audit_catalog()
    return probe["checked"] | audit["checked"]


# ---------------------------------------------------------------------------
# Running axe-core over the corpus
# ---------------------------------------------------------------------------

def run_axe_on_pages(pages: list, repo_root: pathlib.Path) -> dict:
    """pages: [(app_label, path), ...] -> path (str) -> [{"id", "nodes"}, ...]."""
    lines = [
        json.dumps({
            "path": str(path.resolve()),
            "appDir": str((repo_root / app_label).resolve()),
        })
        for app_label, path in pages
    ]
    proc = subprocess.run(
        ["node", str(RUN_AXE)],
        input="\n".join(lines) + "\n",
        capture_output=True,
        text=True,
        cwd=str(HERE),
    )
    if proc.returncode != 0:
        raise RuntimeError(f"run_axe.mjs failed:\n{proc.stderr}")
    out = {}
    for line in proc.stdout.splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        if row.get("error"):
            raise RuntimeError(f"axe error on {row['path']}: {row['error']}")
        out[row["path"]] = row["violations"]
    return out


# ---------------------------------------------------------------------------
# Measurement
# ---------------------------------------------------------------------------

def measure(repo_root: pathlib.Path) -> dict:
    pages, duplicates = aos.dedupe(aos.discover(repo_root))
    rule_criteria = axe_rule_criteria()
    checked = checked_criteria()

    axe_results = run_axe_on_pages(pages, repo_root)

    sheets = {}  # app_label -> parsed Stylesheet | None, built once per app

    per_page = []
    for label, path in pages:
        if label not in sheets:
            sheets[label] = stylesheet_for_app(repo_root / label)
        sheet = sheets[label]

        html = path.read_text(encoding="utf-8", errors="replace")
        probe_criteria = probe_criteria_with_css(html, sheet)
        audit_criteria = audit_py_criteria_with_css(html, sheet)
        inhouse_found = probe_criteria | audit_criteria

        violations = axe_results.get(str(path.resolve()), [])
        axe_all_criteria = set()
        axe_checked_hits = collections.defaultdict(list)  # criterion -> [example nodes]
        for v in violations:
            for criterion in rule_criteria.get(v["id"], ()):
                axe_all_criteria.add(criterion)
                if criterion in checked:
                    axe_checked_hits[criterion].append({
                        "rule": v["id"],
                        "target": v["nodes"][0]["target"] if v["nodes"] else None,
                        "html": v["nodes"][0]["html"] if v["nodes"] else None,
                    })

        axe_checked_criteria = set(axe_checked_hits)
        matched = axe_checked_criteria & inhouse_found
        missed = axe_checked_criteria - inhouse_found

        per_page.append({
            "app": label,
            "page": path.name,
            "path": str(path.relative_to(repo_root)),
            "probe_criteria": sorted(probe_criteria),
            "audit_py_criteria": sorted(audit_criteria),
            "axe_all_criteria": sorted(axe_all_criteria),
            "axe_checked_criteria": sorted(axe_checked_criteria),
            "matched": sorted(matched),
            "missed": sorted(missed),
            "missed_examples": {c: axe_checked_hits[c][0] for c in sorted(missed)},
        })

    return {
        "axe_core_version": json.loads(AXE_CATALOG.read_text())["axe_core_version"],
        "checked_criteria": sorted(checked),
        "corpus": {
            "apps": sorted({r["app"] for r in per_page}),
            "pages_built": len(pages) + len(duplicates),
            "pages_unique": len(pages),
            "duplicates_dropped": len(duplicates),
        },
        "per_page": per_page,
    }


def summarise(data: dict) -> str:
    rows = data["per_page"]
    total_axe_checked_instances = sum(len(r["axe_checked_criteria"]) for r in rows)
    total_matched = sum(len(r["matched"]) for r in rows)
    total_missed = sum(len(r["missed"]) for r in rows)
    total_axe_uncorroborated = sum(  # axe flags a criterion neither engine checks at all
        len(set(r["axe_all_criteria"]) - set(data["checked_criteria"])) for r in rows
    )

    recall = (total_matched / total_axe_checked_instances) if total_axe_checked_instances else None

    out = []
    out.append(f"Corpus: {data['corpus']['pages_unique']} unique pages, "
                f"{len(data['corpus']['apps'])} apps, axe-core {data['axe_core_version']}")
    out.append(f"Checked-criteria universe (either engine, automated/partial): "
               f"{len(data['checked_criteria'])} -> {data['checked_criteria']}")
    out.append("")
    out.append(f"axe-flagged (page, checked-criterion) instances: {total_axe_checked_instances}")
    out.append(f"  matched by at least one in-house engine: {total_matched}")
    out.append(f"  missed by both in-house engines:         {total_missed}")
    if recall is not None:
        out.append(f"  recall = {recall:.3f}")
    out.append(f"axe-flagged instances outside the checked-criteria universe "
               f"(known coverage gap, not a miss): {total_axe_uncorroborated}")
    out.append("")

    miss_by_criterion = collections.Counter()
    for r in rows:
        for c in r["missed"]:
            miss_by_criterion[c] += 1
    if miss_by_criterion:
        out.append("Misses by criterion:")
        for c, n in sorted(miss_by_criterion.items(), key=lambda kv: -kv[1]):
            out.append(f"  {c}: {n} page(s)")
    return "\n".join(out)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--repo-root", type=pathlib.Path, default=ROOT)
    ap.add_argument("--out", type=pathlib.Path)
    ap.add_argument("--recompute-from", type=pathlib.Path)
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
