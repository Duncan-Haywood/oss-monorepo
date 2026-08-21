#!/usr/bin/env python3
"""Audit the pages `local-site-studio` delivers to a paying customer.

`portfolio/research/a11y-own-sites/` ran both of this portfolio's WCAG engines
over 118 pages of built venture output and closed by naming the one corpus it
could not reach::

    "`local-site-studio`'s delivered product is not in this corpus. Its own
     marketing and docs pages are, and they are clean. The customer sites it
     generates are rendered per slug from customer data and never appear in a
     build. That is the corpus worth auditing next, and it is the one that
     carries the actual liability — every defect in a generated theme ships to
     every customer who buys one."

`render_corpus.mjs` produces that corpus by rendering the real component tree.
This script measures it, and — because the result is that both engines find
nothing — it also measures whether the engines could have found anything.

## Why a clean result needs a control

A scan that reports zero has two explanations, and they are opposite: the pages
are clean, or the scan is blind to them. Every prior corpus in this portfolio
had defects, so the question never came up; this one is the first where the
distinction decides what may be claimed. A qualification audit that returns "no
findings" because its parser silently dropped the markup is worse than no audit,
because it is handed to a customer as evidence.

So each automated or partial criterion in the probe's own ``COVERAGE`` catalog
gets a **mutation**: a specific edit to the delivered pages that should make
that criterion fire. Two kinds, and the difference is the whole point:

- **Removal** mutations delete something the corpus actually contains — the
  `lang` attribute, a `<title>`, a button's `aria-label`. When one fires, it
  proves the engine parsed *this page's own markup* and reached the element.
  These are the ones that make the clean result mean something.
- **Injection** mutations add markup the corpus does not contain — an
  autoplaying `<audio>`, a zoom-blocking viewport meta. When one fires it
  proves only that the rule works; it says nothing about this corpus. They are
  reported separately and never counted as coverage of the delivered pages.

A criterion whose removal mutation is a **no-op** — nothing on the page to
remove — is reported as unexercised rather than as passing. That is the honest
reading: the delivered pages contain no `<img>`, so 1.1.1 is untested here, not
satisfied here.

Usage::

    python3 audit_generated_sites.py                          # audit + control
    python3 audit_generated_sites.py --out results.json
    python3 audit_generated_sites.py --recompute-from results-2026-08-21.json

Standard library only. Reads local files, writes only its ``--out`` path, takes
no credentials, publishes nothing, spends nothing.
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
AUDIT_DIR = ROOT / "portfolio/research/a11y-evidence-record"
PROBE_SRC = ROOT / "portfolio/pipeline/probes/eaa-wcag-triage/src"

for _path in (str(AUDIT_DIR), str(PROBE_SRC)):
    if _path not in sys.path:
        sys.path.insert(0, _path)


# ---------------------------------------------------------------------------
# Engine adapters (same shape as a11y-own-sites, so results are comparable)
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
# Mutations
# ---------------------------------------------------------------------------

def _sub(pattern: str, repl: str, flags: int = 0):
    """A mutation that rewrites at most one match, so the edit stays minimal."""
    def apply(html: str) -> str:
        return re.sub(pattern, repl, html, count=1, flags=flags)
    return apply


def _sub_all(pattern: str, repl: str, flags: int = 0):
    def apply(html: str) -> str:
        return re.sub(pattern, repl, html, flags=flags)
    return apply


def _inject_head(fragment: str):
    return _sub(r"<head>", "<head>" + fragment)


# (criterion, kind, description, mutation)
MUTATIONS: tuple = (
    ("3.1.1", "removal", "drop lang from the <html> element",
     _sub(r'(<html\b[^>]*?)\s+lang="[^"]*"', r"\1")),
    ("2.4.2", "removal", "drop the <title> element",
     _sub(r"<title>.*?</title>", "", re.S)),
    ("4.1.2", "removal", "strip aria-label from every <button>",
     _sub_all(r'(<button\b[^>]*?)\s+aria-label="[^"]*"', r"\1")),
    ("1.3.1", "removal", "strip aria-label from every <input>/<select>/<textarea>",
     _sub_all(r'(<(?:input|select|textarea)\b[^>]*?)\s+aria-label="[^"]*"', r"\1")),
    ("1.3.1", "removal", "unhook every <label for=...> from its control",
     _sub_all(r'(<label\b[^>]*?)\s+for="[^"]*"', r"\1")),
    # The delivered form labels its controls by wrapping them, not by `for=`,
    # so the two mutations above are no-ops here and the ones that follow are
    # what actually reach this corpus. Emptying the wrapper's text leaves the
    # control inside a nameless label — the failure a `for=` audit would miss.
    ("1.3.1", "removal", "empty the text of every wrapping <label>",
     _sub_all(r"(<label\b[^>]*>)(?:\s*<span\b[^>]*>[^<]*</span>|[^<]+)", r"\1")),
    ("4.1.2", "removal", "empty the text of the first <button>",
     _sub(r"(<button\b[^>]*>).*?(</button>)", r"\1\2", re.S)),
    ("4.1.2", "removal", "drop title from every <iframe>",
     _sub_all(r'(<iframe\b[^>]*?)\s+title="[^"]*"', r"\1")),
    ("2.4.6", "removal", "demote the first <h2> to <h4>, skipping a level",
     _sub(r"<h2\b", "<h4", 0)),
    ("2.4.4", "removal", "empty the text of the first <a href>",
     _sub(r'(<a\b[^>]*href="[^"]*"[^>]*>).*?(</a>)', r"\1\2", re.S)),
    ("1.1.1", "removal", "drop alt from every <img>",
     _sub_all(r'(<img\b[^>]*?)\s+alt="[^"]*"', r"\1")),
    ("1.4.4", "injection", "add a viewport meta that blocks zoom",
     _inject_head('<meta name="viewport" content="width=device-width,'
                  ' maximum-scale=1, user-scalable=no"/>')),
    ("1.4.2", "injection", "add an autoplaying <audio> with no controls",
     _sub(r"<body([^>]*)>", r'<body\1><audio autoplay src="a.mp3"></audio>')),
    ("1.2.2", "injection", "add a <video> with no captions track",
     _sub(r"<body([^>]*)>", r'<body\1><video src="v.mp4"></video>')),
)


def run_control(pages: list) -> list:
    """Apply every mutation to every page; record where each criterion fires."""
    rows = []
    for criterion, kind, description, mutate in MUTATIONS:
        changed, fired, fired_here, detected = 0, 0, 0, 0
        probe_cites, audit_cites = collections.Counter(), collections.Counter()
        for _name, html in pages:
            mutated = mutate(html)
            if mutated == html:
                continue
            changed += 1

            probe_new = ({_number(f["criterion"]) for f in probe_findings(mutated)}
                         - {_number(f["criterion"]) for f in probe_findings(html)})
            audit_new = set(audit_py_criteria(mutated)) - set(audit_py_criteria(html))
            probe_cites.update(probe_new)
            audit_cites.update(audit_new)

            if criterion in probe_new:
                fired += 1
            if criterion in audit_new:
                fired_here += 1
            # Detection and attribution are different questions. An engine
            # that reports the defect under a different success criterion has
            # still found it; one that reports nothing has not. Conflating the
            # two is what made the divergence in `a11y-own-sites` look like a
            # detection gap when it was a relabelling — and what would have
            # hidden the real detection gap this corpus did find.
            if probe_new and audit_new:
                detected += 1
        rows.append({
            "criterion": criterion,
            "kind": kind,
            "mutation": description,
            "pages_changed": changed,
            "probe_fired": fired,
            "audit_py_fired": fired_here,
            "both_detected": detected,
            "probe_cites": dict(sorted(probe_cites.items())),
            "audit_py_cites": dict(sorted(audit_cites.items())),
            # A removal mutation that changed nothing means the corpus has no
            # such markup: the criterion is untested here, not satisfied here.
            "exercised": changed > 0,
        })
    return rows


# ---------------------------------------------------------------------------
# Measurement
# ---------------------------------------------------------------------------

def load_corpus(corpus_dir: pathlib.Path) -> tuple:
    """Every rendered page, byte-identical duplicates dropped."""
    seen, unique, duplicates = {}, [], []
    for path in sorted(corpus_dir.glob("*.html")):
        raw = path.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        if digest in seen:
            duplicates.append({"page": path.stem, "same_as": seen[digest]})
            continue
        seen[digest] = path.stem
        unique.append((path.stem, raw.decode("utf-8", errors="replace")))
    return unique, duplicates


def measure(corpus_dir: pathlib.Path) -> dict:
    pages, duplicates = load_corpus(corpus_dir)
    per_page = []
    for name, html in pages:
        findings = probe_findings(html)
        probe_counts = collections.Counter(_number(f["criterion"]) for f in findings)
        audit_counts = collections.Counter(audit_py_criteria(html))
        per_page.append({
            "page": name,
            "findings": findings,
            "probe_criteria": dict(sorted(probe_counts.items())),
            "audit_py_criteria": dict(sorted(audit_counts.items())),
            "only_probe": dict(sorted((probe_counts - audit_counts).items())),
            "only_audit_py": dict(sorted((audit_counts - probe_counts).items())),
            "engines_agree": probe_counts == audit_counts,
        })
    return {
        "corpus": {
            "pages_rendered": len(pages) + len(duplicates),
            "pages_unique": len(pages),
            "duplicates_dropped": duplicates,
        },
        "per_page": per_page,
        "control": run_control(pages),
    }


# ---------------------------------------------------------------------------

def summarise(data: dict) -> str:
    corpus, out = data["corpus"], []
    out.append(f"Corpus: {corpus['pages_unique']} unique delivered pages "
               f"({len(corpus['duplicates_dropped'])} byte-identical dropped)")
    for dupe in corpus["duplicates_dropped"]:
        out.append(f"  {dupe['page']} is byte-identical to {dupe['same_as']}")
    out.append("")

    total = sum(len(r["findings"]) for r in data["per_page"])
    disagreeing = [r for r in data["per_page"] if not r["engines_agree"]]
    out.append(f"Findings across the corpus: {total}")
    for row in data["per_page"]:
        for finding in row["findings"]:
            out.append(f"  {row['page']}: [{finding['impact']}] "
                       f"{finding['criterion']} — {finding['element']}")
    out.append(f"Engine agreement: "
               f"{len(data['per_page']) - len(disagreeing)}/{len(data['per_page'])} "
               f"pages produce an identical criterion multiset")
    for row in disagreeing:
        out.append(f"  {row['page']}: audit.py {sorted(row['only_audit_py'])} "
                   f"vs probe {sorted(row['only_probe'])}")
    out.append("")

    out.append("Positive control — does a defect in these pages get caught?")
    removals = [r for r in data["control"] if r["kind"] == "removal"]
    exercised = [r for r in removals if r["exercised"]]
    caught = [r for r in exercised if r["probe_fired"] > 0]
    for row in data["control"]:
        if not row["exercised"]:
            status = "NOT EXERCISED — no such markup in the corpus"
        elif row["probe_fired"] == row["pages_changed"]:
            status = f"caught on {row['probe_fired']}/{row['pages_changed']}"
        else:
            status = (f"CAUGHT ON ONLY {row['probe_fired']}/{row['pages_changed']}")
        out.append(f"  {row['criterion']:<7} {row['kind']:<10} "
                   f"{row['mutation']:<58} {status}")
    out.append("")
    out.append(f"  removal mutations exercised by this corpus: "
               f"{len(exercised)}/{len(removals)}; "
               f"caught by the probe: {len(caught)}/{len(exercised)}")
    out.append("")

    out.append("Attribution — which criterion each engine cites for a known defect")
    for row in data["control"]:
        if not row["exercised"]:
            continue
        probe = sorted(row["probe_cites"])
        other = sorted(row["audit_py_cites"])
        note = "agree" if probe == other else "RELABELLING"
        if not other:
            note = "DETECTION GAP in audit.py"
        if not probe:
            note = "DETECTION GAP in the probe"
        out.append(f"  {row['mutation']:<58} probe {str(probe):<11} "
                   f"audit.py {str(other):<11} {note}")
    return "\n".join(out)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--corpus", type=pathlib.Path, default=HERE / "corpus",
                    help="directory of rendered pages (see render_corpus.mjs)")
    ap.add_argument("--out", type=pathlib.Path, help="write the full result set here")
    ap.add_argument("--recompute-from", type=pathlib.Path,
                    help="re-derive the summary from a saved results file, offline")
    args = ap.parse_args(argv)

    if args.recompute_from:
        data = json.loads(args.recompute_from.read_text())
    else:
        if not args.corpus.is_dir():
            print(f"No corpus at {args.corpus}. Render it first — see "
                  "render_corpus.mjs.", file=sys.stderr)
            return 1
        data = measure(args.corpus)
        if not data["per_page"]:
            print(f"No pages found in {args.corpus}.", file=sys.stderr)
            return 1

    print(summarise(data))
    if args.out:
        args.out.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")
        print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
