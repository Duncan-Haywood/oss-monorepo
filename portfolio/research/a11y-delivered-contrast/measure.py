#!/usr/bin/env python3
"""Colour contrast on the pages `local-site-studio` actually delivers.

`a11y-generated-sites/` rendered the delivered `/preview/[slug]` product and
reported **0 findings from both engines**, closing: *"the product is clean
under everything both engines can statically see."* It reached that number
while calling both engines with **no stylesheet**, on a corpus that links
none — so 1.4.3 could not fire on any element, and the mutation control that
exists to tell "clean" apart from "blind" has no 1.4.3 entry to catch it with.

The engines were not silent about this. Both return a `contrast` tally
alongside their findings, and on that corpus it reads *1018 of 1018 elements
undecidable* — the engine announcing, in a structured field, that it checked
nothing. The harness read only the findings list.

This module supplies the stylesheet the delivered pages are actually served
with, re-asks the question, and checks the answer against axe-core — a
detector with no authorship in common with either in-house engine. Findings
in README.md.

Re-runnable, offline, no credentials:

    cd portfolio/research/a11y-delivered-contrast
    python3 -m unittest discover                                  # tests
    python3 measure.py --recompute-from results-2026-08-21.json   # offline
    # to regenerate, including the axe-core comparison:
    cd ../../../ventures/local-site-studio && npm ci && npm run build && cd -
    npm install axe-core@4.13.0 --no-save        # not committed
    python3 measure.py --out results.json
"""

from __future__ import annotations

import argparse
import collections
import importlib.util
import json
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OWN_SITES = ROOT / "portfolio/research/a11y-own-sites"
CORPUS = ROOT / "portfolio/research/a11y-generated-sites/corpus"
APP = ROOT / "ventures/local-site-studio"
RUN_AXE = HERE / "run_axe.mjs"

if str(OWN_SITES) not in sys.path:
    sys.path.insert(0, str(OWN_SITES))


def _load_module(name: str, path: pathlib.Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# Importing this puts both engines' packages on `sys.path` as a side effect,
# the same way `a11y-axe-recall/measure.py` reaches them.
_load_module("_a11y_own_sites", OWN_SITES / "audit_own_sites.py")

import audit as audit_py  # noqa: E402
from wcag_triage.engine import audit_html  # noqa: E402


# ---------------------------------------------------------------------------
# Corpus and stylesheet
# ---------------------------------------------------------------------------

def corpus_pages() -> list:
    """(name, html) for every delivered page, in a stable order."""
    return [(p.name, p.read_text(errors="replace")) for p in sorted(CORPUS.glob("*.html"))]


def css_path() -> pathlib.Path | None:
    """The stylesheet the delivered pages are served with.

    The preview route is server-rendered per request from the same Next.js
    build as the marketing site, so the build's emitted CSS is the sheet a
    visitor's browser applies to it. Tailwind generates one sheet for the whole
    app by scanning source, so the preview components' classes are in it — the
    tests assert that rather than assuming it.
    """
    found = sorted((APP / ".next").rglob("*.css"))
    return found[0] if found else None


def css_text() -> str:
    return "\n".join(p.read_text(errors="replace") for p in sorted((APP / ".next").rglob("*.css")))


def stylesheet(extra_css: str = ""):
    css = css_text()
    if not css.strip():
        return None
    return audit_py.merge_stylesheets([css + extra_css])


# ---------------------------------------------------------------------------
# The in-house engines
# ---------------------------------------------------------------------------

def contrast_tally(pages: list, sheet) -> dict:
    """Aggregate `audit_html`'s own contrast tally across the corpus."""
    total = collections.Counter()
    reasons = collections.Counter()
    for _name, html in pages:
        tally = audit_html(html, stylesheet=sheet).contrast
        for key in ("pass", "fail", "undecidable", "elements"):
            total[key] += tally[key]
        reasons.update(tally["reasons"])
    elements = total["elements"]
    return {
        "pass": total["pass"],
        "fail": total["fail"],
        "undecidable": total["undecidable"],
        "elements": elements,
        "decidable_share": (elements - total["undecidable"]) / elements if elements else 0.0,
        "reasons": dict(sorted(reasons.items())),
    }


def criteria_found(pages: list, sheet) -> dict:
    """Which criteria each engine reports across the corpus, with counts."""
    probe = collections.Counter()
    sibling = collections.Counter()
    for _name, html in pages:
        probe.update(f.criterion for f in audit_html(html, stylesheet=sheet).findings)
        result = audit_py.audit_source(html, "page.html", stylesheet=sheet)
        sibling.update(f["success_criterion"].split()[0] for f in result["findings"])
    return {"probe": dict(sorted(probe.items())), "audit_py": dict(sorted(sibling.items()))}


# ---------------------------------------------------------------------------
# Positive controls
#
# A zero has two explanations and they are opposite — the corpus is clean, or
# the check never ran. `a11y-generated-sites/` makes that argument and answers
# it with mutations, and its answer is what this directory found to be
# incomplete: every one of its mutations edits *markup*, so none of them can
# reach a rule that needs CSS. These controls edit the stylesheet instead.
#
# Each names a class the corpus really uses and recolours it to near-white on
# the page's light background. The check is not "did something fail" but "did
# exactly as many elements fail as carry that class" — an off-by-any margin
# means the engine is reaching a different element set than the corpus has.
# ---------------------------------------------------------------------------

CONTROLS = (
    ("text-zinc-500", "#fdfdfd"),
    ("text-amber-800", "#fdfdfd"),
)


def class_occurrences(pages: list, class_name: str) -> int:
    """How many elements carry `class_name`, counted from the markup itself."""
    pattern = re.compile(r'class="([^"]*)"')
    count = 0
    for _name, html in pages:
        for attr in pattern.findall(html):
            if class_name in attr.split():
                count += 1
    return count


def run_controls(pages: list) -> list:
    rows = []
    for class_name, colour in CONTROLS:
        expected = class_occurrences(pages, class_name)
        sheet = stylesheet(f"\n.{class_name}{{color:{colour}}}")
        tally = contrast_tally(pages, sheet)
        rows.append(
            {
                "class": class_name,
                "recoloured_to": colour,
                "elements_carrying_class": expected,
                "failures": tally["fail"],
                "matches": tally["fail"] == expected and expected > 0,
            }
        )
    return rows


# ---------------------------------------------------------------------------
# axe-core, the independent detector
# ---------------------------------------------------------------------------

def run_axe(pages: list, extra_css: str = "", label: str = "baseline") -> list:
    """Run `run_axe.mjs` over the corpus. Returns one row per page."""
    sheet = css_path()
    if sheet is None:
        raise RuntimeError("no built stylesheet — run `npm run build` in local-site-studio")
    request = "\n".join(
        json.dumps(
            {
                "path": str(CORPUS / name),
                "css": str(sheet),
                "label": label,
                "extraCss": extra_css,
            }
        )
        for name, _html in pages
    )
    proc = subprocess.run(
        ["node", str(RUN_AXE)],
        input=request,
        capture_output=True,
        text=True,
        cwd=str(HERE),
    )
    if proc.returncode != 0:
        raise RuntimeError(f"run_axe.mjs failed: {proc.stderr[-2000:]}")
    return [json.loads(line) for line in proc.stdout.splitlines() if line.strip().startswith("{")]


def summarise_axe(rows: list) -> dict:
    """Violations, and — the part that matters — what axe declined and why."""
    violations = collections.Counter()
    incomplete = collections.Counter()
    reasons = collections.Counter()
    passes = collections.Counter()
    errors = []
    for row in rows:
        if row.get("error"):
            errors.append({"path": row["path"], "error": row["error"]})
        for entry in row.get("violations", []):
            violations[entry["id"]] += len(entry["nodes"])
        for entry in row.get("incomplete", []):
            incomplete[entry["id"]] += len(entry["nodes"])
            for node in entry["nodes"]:
                for message in node.get("messages", []):
                    reasons[(entry["id"], message)] += 1
        for rule, count in (row.get("passes") or {}).items():
            passes[rule] += count
    contrast_decided = passes["color-contrast"]
    contrast_declined = incomplete["color-contrast"]
    total = contrast_decided + contrast_declined + violations["color-contrast"]
    return {
        "pages": len(rows),
        "errors": errors,
        "violations": dict(sorted(violations.items())),
        "incomplete": dict(sorted(incomplete.items())),
        "incomplete_reasons": {f"{k[0]}: {k[1]}": v for k, v in sorted(reasons.items())},
        "rules_run": len(passes),
        "color_contrast": {
            "violations": violations["color-contrast"],
            "passes": contrast_decided,
            "incomplete": contrast_declined,
            "checks": total,
            "declined_share": contrast_declined / total if total else 0.0,
        },
    }


# ---------------------------------------------------------------------------
# Results
# ---------------------------------------------------------------------------

def build_results(with_axe: bool = True) -> dict:
    pages = corpus_pages()
    sheet = stylesheet()
    if sheet is None:
        raise RuntimeError("no built stylesheet — run `npm run build` in local-site-studio")

    results = {
        "pages": len(pages),
        "stylesheet_bytes": len(css_text()),
        # What the merged directory does: both engines, no stylesheet.
        "without_stylesheet": contrast_tally(pages, None),
        # The same corpus, served as it is served.
        "with_stylesheet": contrast_tally(pages, sheet),
        "criteria": criteria_found(pages, sheet),
        "controls": run_controls(pages),
    }
    if with_axe:
        results["axe_baseline"] = summarise_axe(run_axe(pages))
        # axe's own positive control, so a 0 from it means as much as a 0 here.
        control_class, colour = CONTROLS[0]
        results["axe_control"] = summarise_axe(
            run_axe(pages, extra_css=f".{control_class}{{color:{colour} !important}}", label="control")
        )
        results["axe_control_class"] = control_class
    return results


def report(results: dict) -> str:
    out = []
    without = results["without_stylesheet"]
    with_css = results["with_stylesheet"]
    out.append(f"Delivered pages: {results['pages']}   stylesheet: {results['stylesheet_bytes']} bytes")
    out.append("")
    out.append("Contrast (SC 1.4.3), by whether the engine was given the stylesheet")
    out.append("                       elements     pass     fail  undecidable  decidable")
    for label, tally in (("no stylesheet", without), ("with stylesheet", with_css)):
        out.append(
            f"  {label:<20s} {tally['elements']:8d} {tally['pass']:8d} {tally['fail']:8d}"
            f" {tally['undecidable']:12d}  {tally['decidable_share'] * 100:8.2f}%"
        )
    if with_css["reasons"]:
        out.append("")
        out.append("  undecidable, by reason (with stylesheet):")
        for reason, count in with_css["reasons"].items():
            out.append(f"    {reason:<34s} {count}")
    out.append("")
    out.append("Positive controls — recolour a class the corpus uses, expect exactly its elements to fail")
    for row in results["controls"]:
        verdict = "ok" if row["matches"] else "MISMATCH"
        out.append(
            f"  .{row['class']:<16s} -> {row['recoloured_to']}   carried by"
            f" {row['elements_carrying_class']:4d}   failures {row['failures']:4d}   {verdict}"
        )
    if "axe_baseline" in results:
        axe = results["axe_baseline"]
        contrast = axe["color_contrast"]
        out.append("")
        out.append(f"axe-core over the same pages, with the same stylesheet ({axe['rules_run']} rules run)")
        out.append(f"  violations, all rules: {axe['violations'] or '{}'}")
        out.append(
            f"  color-contrast: {contrast['passes']} decided,"
            f" {contrast['violations']} violations,"
            f" {contrast['incomplete']} declined"
            f" ({contrast['declined_share'] * 100:.1f}% of {contrast['checks']} checks)"
        )
        for reason, count in sorted(axe["incomplete_reasons"].items(), key=lambda kv: -kv[1])[:4]:
            out.append(f"    {count:5d}  {reason[:96]}")
        if "axe_control" in results:
            control = results["axe_control"]["color_contrast"]
            out.append(
                f"  positive control (.{results['axe_control_class']} recoloured):"
                f" {control['violations']} violations — axe can fire on this corpus"
            )
    return "\n".join(out)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=pathlib.Path, help="write results JSON here")
    parser.add_argument(
        "--recompute-from",
        type=pathlib.Path,
        help="re-print the report from a saved results file, without scanning",
    )
    parser.add_argument(
        "--no-axe",
        action="store_true",
        help="skip the axe-core comparison (no node_modules needed)",
    )
    args = parser.parse_args()

    if args.recompute_from:
        results = json.loads(args.recompute_from.read_text())
    else:
        results = build_results(with_axe=not args.no_axe)
    print(report(results))
    if args.out:
        args.out.write_text(json.dumps(results, indent=2, sort_keys=True) + "\n")
        print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
