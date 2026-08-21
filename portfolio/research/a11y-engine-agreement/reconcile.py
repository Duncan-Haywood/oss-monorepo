#!/usr/bin/env python3
"""Do this portfolio's two accessibility engines agree, and where they differ,
is the difference disclosed?

`portfolio/research/README.md` records that
`portfolio/research/a11y-evidence-record/audit.py` and
`portfolio/pipeline/probes/eaa-wcag-triage/` are two independent audit engines
built for the same candidate, with overlapping check IDs, and that until that
note neither referenced the other. Nobody had run them on the same input.

This script does. It answers three questions, none of which needs a network:

1. **Silent coverage gap.** A criterion one engine checks, that the other
   neither checks nor lists in its own coverage statement. This is the
   dangerous class: a record's reader can only distinguish "checked and
   passed" from "never looked at" by the two lists the record carries, so a
   criterion in neither is invisible to the customer.
2. **Corpus disagreement.** Run both over the same pages and diff the
   findings.
3. **Attribution divergence.** The same defect reported by both engines
   under *different* success criteria. Not a coverage gap, but a
   reproducibility problem for a document whose selling point is that it can
   be handed to procurement or to counsel.

Standard library only. Reads local files, writes only its `--out` path,
takes no credentials, publishes nothing, spends nothing.

    python3 reconcile.py                                   # run and summarise
    python3 reconcile.py --recompute-from results-2026-08-21.json   # offline
    python3 reconcile.py --out results.json
"""

from __future__ import annotations

import argparse
import collections
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
AUDIT_DIR = ROOT / "portfolio/research/a11y-evidence-record"
PROBE_SRC = ROOT / "portfolio/pipeline/probes/eaa-wcag-triage/src"
DEFAULT_CORPUS = ROOT / "portfolio/pipeline/probes/eaa-wcag-triage/fixtures"

for path in (str(AUDIT_DIR), str(PROBE_SRC)):
    if path not in sys.path:
        sys.path.insert(0, path)


# Defect classes both engines can detect, and what each calls them. Used for
# the attribution comparison: same defect, possibly different criterion.
# (audit.py check id, probe rule function name).
SHARED_DEFECTS = {
    "image with no alt": ("img-alt-missing", "rule_img_alt"),
    "page with no lang": ("html-lang-missing", "rule_html_lang"),
    "page with no title": ("title-missing", "rule_page_title"),
    "form control with no label": ("control-no-label", "rule_control_names"),
    "link with no accessible name": ("link-no-accessible-name", "rule_link_text"),
    "button with no accessible name": ("button-no-accessible-name", "rule_button_names"),
    "focusable control hidden from AT": ("interactive-aria-hidden", "rule_interactive_aria_hidden"),
    "video with no captions track": ("media-no-captions", "rule_video_captions"),
    "autoplaying media with sound": ("autoplay-unmuted", "rule_autoplay_unmuted"),
    "viewport that blocks zoom": ("viewport-scaling-blocked", "rule_viewport_scaling"),
    "skipped heading level": ("heading-level-skipped", "rule_heading_order"),
    "data table with no headers": ("data-table-no-header", "rule_data_table_headers"),
}

# Markup that provokes exactly one defect class, so the criterion each engine
# attributes it to can be read off directly.
PROBES = {
    "image with no alt": '<img src="x.png">',
    "page with no lang": None,  # document-level; handled by the wrapper
    "page with no title": None,
    "form control with no label": '<input type="text" name="q">',
    "link with no accessible name": '<a href="/x"></a>',
    "button with no accessible name": "<button></button>",
    "focusable control hidden from AT":
        '<input type="text" aria-label="q" aria-hidden="true">',
    "video with no captions track": '<video src="v.mp4"></video>',
    "autoplaying media with sound":
        '<video autoplay src="v.mp4"><track kind="captions" src="c.vtt"></video>',
    "viewport that blocks zoom": '<meta name="viewport" content="user-scalable=no">',
    "skipped heading level": "<h1>A</h1><h3>B</h3>",
    "data table with no headers":
        "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>",
}

_WRAPPER = '<html lang="en"><head><title>t</title></head><body>{}</body></html>'


def _number(criterion: str) -> str:
    """'1.2.2 Captions (Prerecorded)' -> '1.2.2'."""
    return criterion.split()[0]


# ---------------------------------------------------------------------------
# Engine adapters
# ---------------------------------------------------------------------------

def audit_catalog() -> dict:
    import audit

    checked = {_number(sc) for sc, _ in audit.CHECKS.values()}
    declared = {_number(c) for c, _ in audit.NOT_TESTED if re.match(r"^\d", c)}
    return {"checked": checked, "declared_untested": declared}


def probe_catalog() -> dict:
    from wcag_triage.rules import COVERAGE

    checked = {c.criterion for c in COVERAGE if c.coverage != "manual"}
    declared = {c.criterion for c in COVERAGE if c.coverage == "manual"}
    return {"checked": checked, "declared_untested": declared}


def audit_criteria_for(html: str) -> list:
    import audit

    result = audit.audit_source(html, "probe.html")
    return sorted(_number(f["success_criterion"]) for f in result["findings"])


def probe_criteria_for(html: str) -> list:
    from wcag_triage.engine import audit_html

    return sorted(f.criterion for f in audit_html(html).findings)


# ---------------------------------------------------------------------------
# The three comparisons
# ---------------------------------------------------------------------------

def silent_gaps(a: dict, b: dict) -> list:
    """Criteria `b` checks that `a` neither checks nor declares untested."""
    return sorted(b["checked"] - a["checked"] - a["declared_untested"])


def attribution_table() -> list:
    """For each shared defect class, the criterion each engine cites."""
    rows = []
    for defect in sorted(SHARED_DEFECTS):
        markup = PROBES[defect]
        if markup is None:
            if defect == "page with no lang":
                html = "<html><head><title>t</title></head><body></body></html>"
            else:
                html = '<html lang="en"><head></head><body></body></html>'
            baseline_a, baseline_b = [], []
        else:
            html = _WRAPPER.format(markup)
            baseline_a = audit_criteria_for(_WRAPPER.format(""))
            baseline_b = probe_criteria_for(_WRAPPER.format(""))

        a = [c for c in audit_criteria_for(html) if c not in baseline_a]
        b = [c for c in probe_criteria_for(html) if c not in baseline_b]
        rows.append({
            "defect": defect,
            "audit_py": sorted(set(a)),
            "probe": sorted(set(b)),
            "agree": sorted(set(a)) == sorted(set(b)),
        })
    return rows


def _label(path: pathlib.Path) -> str:
    """Repo-relative name where possible, absolute otherwise.

    `--corpus` accepts any directory, and the interesting corpora are the ones
    outside the repo — a build output tree, a downloaded theme. Naming them
    unconditionally relative to `ROOT` made every such run crash before the
    first comparison was reported.
    """
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def corpus_agreement(corpus: pathlib.Path) -> dict:
    files = sorted(p for p in corpus.rglob("*.html"))
    per_file = []
    for path in files:
        html = path.read_text(encoding="utf-8", errors="replace")
        a = collections.Counter(audit_criteria_for(html))
        b = collections.Counter(probe_criteria_for(html))
        per_file.append({
            "file": _label(path),
            "audit_py": dict(sorted(a.items())),
            "probe": dict(sorted(b.items())),
            "only_audit_py": dict(sorted((a - b).items())),
            "only_probe": dict(sorted((b - a).items())),
            "agree": a == b,
        })
    return {"files": len(files), "per_file": per_file,
            "files_agreeing": sum(1 for r in per_file if r["agree"])}


def measure(corpus: pathlib.Path) -> dict:
    a, b = audit_catalog(), probe_catalog()
    return {
        "catalogs": {
            "audit_py": {k: sorted(v) for k, v in a.items()},
            "probe": {k: sorted(v) for k, v in b.items()},
        },
        "silent_gaps": {
            "in_audit_py": silent_gaps(a, b),
            "in_probe": silent_gaps(b, a),
        },
        "attribution": attribution_table(),
        "corpus": corpus_agreement(corpus),
    }


# ---------------------------------------------------------------------------

def summarise(data: dict) -> str:
    out = []
    gaps = data["silent_gaps"]
    out.append("Silent coverage gaps (checked by one engine, neither checked "
               "nor disclosed by the other)")
    out.append(f"  audit.py : {gaps['in_audit_py'] or 'none'}")
    out.append(f"  probe    : {gaps['in_probe'] or 'none'}")
    out.append("")

    diverging = [r for r in data["attribution"] if not r["agree"]]
    out.append(f"Attribution: {len(data['attribution']) - len(diverging)} of "
               f"{len(data['attribution'])} shared defect classes cite the same criterion")
    for row in diverging:
        out.append(f"  {row['defect']}: audit.py {row['audit_py']} vs probe {row['probe']}")
    out.append("")

    corpus = data["corpus"]
    out.append(f"Corpus: {corpus['files_agreeing']}/{corpus['files']} files produce "
               "an identical criterion multiset")
    for row in corpus["per_file"]:
        if not row["agree"]:
            out.append(f"  {row['file']}: only-audit={row['only_audit_py']} "
                       f"only-probe={row['only_probe']}")
    return "\n".join(out)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--corpus", type=pathlib.Path, default=DEFAULT_CORPUS,
                    help="directory of .html files to run both engines over")
    ap.add_argument("--out", type=pathlib.Path, help="write the full result set here")
    ap.add_argument("--recompute-from", type=pathlib.Path,
                    help="re-derive the summary from a saved results file, offline")
    args = ap.parse_args(argv)

    if args.recompute_from:
        data = json.loads(args.recompute_from.read_text())
    else:
        data = measure(args.corpus)

    print(summarise(data))
    if args.out:
        args.out.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")
        print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
