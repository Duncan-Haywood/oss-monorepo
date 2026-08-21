"""How much of WCAG 1.4.3 is decidable from a delivered artifact?

Every accessibility pass in this portfolio has recorded contrast as *manual*.
This measures whether that is true, over the pages this portfolio actually
builds, using the resolver in
``portfolio/pipeline/probes/eaa-wcag-triage/src/wcag_triage/contrast.py``.

Two numbers come out, and the second is the one that matters:

* the **decidable share** — how many text-bearing elements the artifact settles
  on its own, and a named reason for every one it does not;
* the **scheme delta** — how many real failures a checker misses by scoring the
  light colour scheme only, which is what every single-pass checker does.

Standard library only. Reads local files, sends nothing, needs no credentials.

Usage:
    python3 measure.py --out results.json          # scan the built corpora
    python3 measure.py --recompute-from results-2026-08-21.json   # offline
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
PROBE_SRC = REPO_ROOT / "portfolio/pipeline/probes/eaa-wcag-triage/src"
sys.path.insert(0, str(PROBE_SRC))

from wcag_triage import contrast as C  # noqa: E402
from wcag_triage.css import LIGHT, SCHEMES, parse_stylesheet  # noqa: E402
from wcag_triage.parser import parse  # noqa: E402

# The ventures with a Next.js build that emits prerendered HTML. Each is scanned
# against the CSS its own build emitted, which is the point: the stylesheet is
# part of the delivered artifact, and no prior corpus in this repo included it.
VENTURES = (
    "local-site-studio",
    "ai-first-markets",
    "quick-pick-survey",
    "print-atelier",
)

# Framework-emitted fallback documents. `a11y-own-sites` established that these
# are never actionable — they are Next.js's internal error shells, reached only
# when rendering fails outright — and that including them is what put a 12%
# un-actionable rate on that pass's headline number.
FRAMEWORK_SHELLS = ("_global-error.html", "500.html")


def venture_pages(venture: str) -> list:
    root = REPO_ROOT / "ventures" / venture / ".next" / "server"
    if not root.is_dir():
        return []
    pages = []
    seen = set()
    for path in sorted(root.rglob("*.html")):
        if path.name in FRAMEWORK_SHELLS:
            continue
        raw = path.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        if digest in seen:
            # A Next.js build writes the same body under both routers, and a
            # static export writes both `x.html` and `x/index.html`.
            continue
        seen.add(digest)
        pages.append(path)
    return pages


def venture_css(venture: str) -> str:
    build = REPO_ROOT / "ventures" / venture / ".next"
    if not build.is_dir():
        return ""
    return "\n".join(path.read_text(errors="replace") for path in sorted(build.rglob("*.css")))


def scan_venture(venture: str) -> dict:
    pages = venture_pages(venture)
    css = venture_css(venture)
    both = Counter()
    light = Counter()
    reasons = Counter()
    failures = Counter()
    for path in pages:
        html = path.read_text(errors="replace")
        root = parse(html)
        sheet = parse_stylesheet(css)
        for _, result in C.evaluate_document(root, sheet, SCHEMES):
            both[result.verdict] += 1
            if result.verdict == C.UNDECIDABLE:
                reasons[result.reason] += 1
        root_light = parse(html)
        sheet_light = parse_stylesheet(css)
        for node, result in C.evaluate_document(root_light, sheet_light, (LIGHT,)):
            light[result.verdict] += 1
            if result.verdict == C.FAIL:
                failures[
                    (
                        (node.attr("class") or "").strip()[:60],
                        result.foreground,
                        " over ".join(result.backgrounds),
                        result.min_ratio,
                        result.threshold,
                    )
                ] += 1
    elements = sum(both.values())
    decided = both[C.PASS] + both[C.FAIL]
    return {
        "venture": venture,
        "pages": len(pages),
        "stylesheet_bytes": len(css),
        "elements": elements,
        "both_schemes": dict(both),
        "light_only": dict(light),
        "decidable_share": round(decided / elements, 4) if elements else None,
        "undecidable_reasons": dict(reasons),
        "light_failure_shapes": [
            {
                "classes": key[0],
                "foreground": key[1],
                "background": key[2],
                "ratio": key[3],
                "threshold": key[4],
                "count": count,
            }
            for key, count in failures.most_common()
        ],
    }


def summarise(ventures: list) -> dict:
    both = Counter()
    light = Counter()
    reasons = Counter()
    for row in ventures:
        both.update(row["both_schemes"])
        light.update(row["light_only"])
        reasons.update(row["undecidable_reasons"])
    elements = sum(both.values())
    decided = both[C.PASS] + both[C.FAIL]
    return {
        "pages": sum(row["pages"] for row in ventures),
        "elements": elements,
        "both_schemes": dict(both),
        "light_only": dict(light),
        "decidable_share": round(decided / elements, 4) if elements else None,
        "dark_only_failures": both.get(C.FAIL, 0) - light.get(C.FAIL, 0),
        "undecidable_reasons": dict(reasons),
    }


def build_results() -> dict:
    ventures = [scan_venture(name) for name in VENTURES]
    return {"ventures": ventures, "totals": summarise(ventures)}


def report(results: dict) -> str:
    lines = []
    header = f"{'venture':22s} {'pages':>5s} {'elements':>9s} {'decidable':>10s} {'fail(2)':>8s} {'fail(1)':>8s}"
    lines.append(header)
    lines.append("-" * len(header))
    for row in results["ventures"]:
        share = row["decidable_share"]
        lines.append(
            f"{row['venture']:22s} {row['pages']:5d} {row['elements']:9d} "
            f"{('%.2f%%' % (share * 100)) if share is not None else 'n/a':>10s} "
            f"{row['both_schemes'].get('fail', 0):8d} {row['light_only'].get('fail', 0):8d}"
        )
    totals = results["totals"]
    lines.append("-" * len(header))
    lines.append(
        f"{'TOTAL':22s} {totals['pages']:5d} {totals['elements']:9d} "
        f"{'%.2f%%' % (totals['decidable_share'] * 100):>10s} "
        f"{totals['both_schemes'].get('fail', 0):8d} {totals['light_only'].get('fail', 0):8d}"
    )
    lines.append("")
    lines.append(
        f"Failures visible only in dark mode: {totals['dark_only_failures']} "
        "— missed entirely by a checker that scores one colour scheme."
    )
    lines.append("")
    lines.append("Undecidable elements, by reason:")
    for reason, count in sorted(
        totals["undecidable_reasons"].items(), key=lambda item: (-item[1], item[0])
    ):
        lines.append(f"  {reason:34s} {count}")
    if not totals["undecidable_reasons"]:
        lines.append("  (none)")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, help="write results JSON here")
    parser.add_argument(
        "--recompute-from",
        type=Path,
        help="re-print the report from a saved results file, without scanning",
    )
    args = parser.parse_args()

    if args.recompute_from:
        results = json.loads(args.recompute_from.read_text())
    else:
        results = build_results()
        if not results["totals"]["elements"]:
            print(
                "No built pages found. Run `npm ci && npm run build` in each of:\n  "
                + "\n  ".join(VENTURES),
                file=sys.stderr,
            )
            return 1
    print(report(results))
    if args.out:
        args.out.write_text(json.dumps(results, indent=2, sort_keys=True) + "\n")
        print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
