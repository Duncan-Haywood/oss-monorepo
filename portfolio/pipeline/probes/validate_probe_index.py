#!/usr/bin/env python3
"""Check that the probe index's per-probe figures still match what the probes measure.

Why this exists
---------------
`probes/README.md` is a routing table, not a summary. `CLAUDE.md` sends the
recurring "research new business projects" brief straight at it -- "the useful
moves are, in order: advance a probe that is already specified in
`portfolio/pipeline/`" -- so a next step named in a cell here is what a session
with no target of its own goes and does.

That makes one specific kind of drift expensive: a cell that names work as
outstanding after the work has landed. A probe's own README is updated by the
pass that does the work; this index is updated by whoever remembers. When they
diverge, the index keeps advertising a step that is already closed, and the
sessions that read it are routed at nothing.

It has already happened, repeatedly, and the repository has paid for it:

  * `npm-reachability-triage` carried a "the next pass should buy a pnpm hand
    review" pointer after the review had been done. Four independent sessions
    converged on that one sentence before #677 and #681 closed it -- two pull
    requests spent on a pointer rather than on a probe.

  * `eaa-wcag-triage`'s cell ended at the SC 2.5.3 pass with "17 reasoned about
    / 9 deferred to a human / 2 disclosed as decidable but unbuilt". SC 1.3.4
    landed later the same day. The true split is 18 / 9 / 1, and the one row
    left (`1.2.1`) is the only row in the catalog whose own note says the
    criterion is *not* decidable from the artifact. The cell advertised two
    buildable rules; zero existed.

  * `mcp-drift-watch`'s cell said corpus 3's model question "costs one run".
    That run was committed the same day, as `model-pass-c3-2026-08-22.json`,
    and it is the second held-out corpus on which the model beats the rules --
    the evidence that most matters for that candidate's `ai_leverage`. The
    index named it as pending and omitted the result.

Both were found and fixed on 2026-08-23 by reading each probe's own README
against its index cell by hand. This script is what makes the next one fail the
build instead of waiting for that.

What it checks, and what it deliberately does not
-------------------------------------------------
Every check below re-derives a number from the probe's own committed artifacts
-- its coverage catalog, its scorer, its labels -- and then asserts the index
states that number. Nothing here reads a figure out of one document and
compares it to another document's copy of the same figure; the artifact is
always the source and the prose is always the thing checked. That is the
`eaa-wcag-triage/tests/test_accuracy_citations.py` pattern, which this
directory's own README already recommends ("a figure printed at a customer must
not be able to go stale ... copy that when you add a figure to a probe here"),
applied one level up to the table that routes sessions to the probes.

It cannot check prose. A cell that is merely out of date in its narration, or
that names a next step no artifact contradicts, passes here and always will.
The claim is narrower: a figure in this index that a committed artifact can
recompute will not silently disagree with it.

Adding a check: append to CHECKS. Each entry names the probe, the artifact the
number comes from, and a callable returning (derived_description, [required
substrings]). Keep the required substrings short and specific -- a whole
sentence is brittle against ordinary editing, and a bare number is too weak to
mean anything.

The second thing this checks: the tables still render
-----------------------------------------------------
A figure can also be lost without going stale, by never reaching the reader at
all. GitHub-flavoured Markdown splits a table cell on every unescaped `|`
*including inside a backtick span*, so quoting a regex that contains an
alternation silently adds columns to that row, and the row renders mangled --
in a table whose whole job is to route a session to the right probe.

That is not hypothetical. Both routing documents `CLAUDE.md` sends generic
sessions to had exactly this defect, from the same quoted pattern:
`probes/README.md`'s `mcp-drift-watch` row and `research/README.md`'s
`mcp-tool-drift/` row each carried four unescaped pipes inside
``` `\b( … |important:| … |\.env\b| … )\b` ```, rendering as 8-column rows in
3-column tables. The probes one was spotted and recorded as "out of scope"
rather than fixed; the research one nobody had noticed at all.

`check_table_rows_render` therefore asserts that every table row in those
documents has the column count its own delimiter row declares. It is a
rendering check, not a figure check, so it is deliberately *not* in CHECKS --
it derives nothing from an artifact and would not fit that contract.

Reads only the working tree. Writes nothing, fetches nothing, needs no
credentials, and imports probe code without running any network call.

Usage: python3 portfolio/pipeline/probes/validate_probe_index.py
Exit status: 0 if every derived figure appears in README.md and every routing
table renders, 1 otherwise.
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(HERE, "README.md")

# Documents `CLAUDE.md` routes a session with no target of its own at. A table
# that renders wrong here misroutes the session that reads it, which is the
# same cost as a cell that has gone stale.
PORTFOLIO = os.path.dirname(os.path.dirname(HERE))
ROUTING_DOCS = [
    INDEX,
    os.path.join(PORTFOLIO, "research", "README.md"),
]

# The en dash the index and the probe READMEs use in numeric spans.
DASH = "–"


def _load_module(name: str, path: str):
    """Import a standalone script from an explicit path.

    Only for probe entry points that are scripts rather than package members;
    a module using relative imports must go through `_load_package_module`.
    """
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:  # pragma: no cover - unreachable in tree
        raise ImportError(f"cannot load {name} from {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def _load_package_module(src_dir: str, dotted: str):
    """Import `dotted` with `src_dir` on the path, so relative imports resolve.

    `wcag_triage.rules` imports its siblings relatively, so loading the file
    directly raises ImportError. Restores `sys.path` but leaves the imported
    package in `sys.modules`, which is what makes a second call cheap.
    """
    src_dir = os.path.abspath(src_dir)
    inserted = src_dir not in sys.path
    if inserted:
        sys.path.insert(0, src_dir)
    try:
        return importlib.import_module(dotted)
    finally:
        if inserted and src_dir in sys.path:
            sys.path.remove(src_dir)


def check_wcag_coverage_split():
    """Derive the eaa-wcag-triage coverage split from its own catalog.

    `rules.COVERAGE` is the catalog the probe ships and prints at a customer.
    Three buckets matter to a session reading the index: what the engine
    reasons about at all (`automated` + `partial`), what it hands to a human
    (`manual`), and what it discloses as unbuilt (`unimplemented`). The last
    is the one that routes work, so it is the one that must not go stale.
    """
    rules = _load_package_module(
        os.path.join(HERE, "eaa-wcag-triage", "src"), "wcag_triage.rules"
    )

    counts = {"automated": 0, "partial": 0, "manual": 0, "unimplemented": 0}
    for criterion in rules.COVERAGE:
        counts[criterion.coverage] = counts.get(criterion.coverage, 0) + 1

    reasoned = counts["automated"] + counts["partial"]
    deferred = counts["manual"]
    unbuilt = counts["unimplemented"]

    described = (
        f"{reasoned} reasoned about ({counts['automated']} automated + "
        f"{counts['partial']} partial) / {deferred} deferred / {unbuilt} unbuilt"
    )
    required = [
        f"{reasoned} reasoned about / {deferred} deferred to a human / "
        f"{unbuilt} disclosed as unbuilt",
    ]
    return described, required


def check_wcag_unbuilt_rows_are_undecidable():
    """Every remaining `unimplemented` row must be named in the index.

    A row disclosed as unbuilt is either a next step or a declared limit, and
    the index has to say which. Requiring the criterion number to appear is the
    weakest check that still catches the failure that happened: a row leaving
    `unimplemented` while the index goes on counting it as buildable work.
    """
    rules = _load_package_module(
        os.path.join(HERE, "eaa-wcag-triage", "src"), "wcag_triage.rules"
    )

    unbuilt = [c.criterion for c in rules.COVERAGE if c.coverage == "unimplemented"]
    described = "unimplemented rows: " + (", ".join(unbuilt) if unbuilt else "(none)")
    return described, [f"`{c}`" for c in unbuilt]


def _f1_span(scorer, model_path: str, labels_path: str) -> tuple:
    """Return (low, high) F1 across the scorer's two borderline conventions."""
    model_rows = json.load(open(model_path))["labels"]
    hand_rows = json.load(open(labels_path))["labels"]
    hand_by_key = {scorer.key(row): row for row in hand_rows}

    scores = [
        scorer.score(model_rows, hand_by_key, count_borderline=True),
        scorer.score(model_rows, hand_by_key, count_borderline=False),
    ]
    f1s = [s["f1"] for s in scores]
    return min(f1s), max(f1s)


def check_mcp_corpus3_model_f1():
    """Derive the corpus-3 model F1 span from the committed pass and its labels.

    This is the figure the index omitted entirely while calling the run
    pending. Re-deriving it from `score_model_pass_c3.py` -- the same scorer
    the probe's own README quotes -- means the index cannot state a number the
    scorer would not produce, and cannot go on omitting it either.
    """
    probe = os.path.join(HERE, "mcp-drift-watch")
    scorer = _load_module("_vpi_c3_scorer", os.path.join(probe, "score_model_pass_c3.py"))
    low, high = _f1_span(scorer, scorer.MODEL, scorer.LABELS)

    described = f"corpus-3 model F1 span {low:.2f}{DASH}{high:.2f}"
    return described, [f"{low:.2f}{DASH}{high:.2f}"]


def _cell_count(row: str) -> int:
    """Columns a GFM table row declares: unescaped `|` minus the two rails.

    A backslash-escaped pipe is content, everywhere, including inside a
    backtick span -- which is exactly the case that keeps being got wrong.
    """
    return len(re.findall(r"(?<!\\)\|", row)) - 1


def _is_delimiter(row: str) -> bool:
    """True for a `|---|---|` row, which is what fixes a GFM table's width."""
    return set(row.replace("|", "").replace(":", "").strip()) == {"-"}


def _table_blocks(text: str):
    """Yield each contiguous run of table rows as a list of (line_number, row).

    Runs, not individual rows: a document holds several tables, and each one's
    own delimiter row sets its width. Anything inside a fenced code block is
    skipped -- sample output and diffs can look like tables and render as none.
    """
    fenced = False
    block = []
    for number, line in enumerate(text.split("\n") + [""], 1):
        if line.lstrip().startswith("```"):
            fenced = not fenced
            line = ""
        stripped = "" if fenced else line.strip()
        if stripped.startswith("|") and stripped.endswith("|") and len(stripped) > 1:
            block.append((number, stripped))
            continue
        if block:
            yield block
            block = []


def check_table_rows_render(paths=None) -> list:
    """Every table row must have the column count its delimiter row declares.

    The delimiter row (`|---|---|---|`) is the authority rather than the header
    or the majority: it is what GFM itself uses to fix the table's width, so a
    row disagreeing with it is precisely a row that renders wrong.
    """
    failures = []
    for path in paths if paths is not None else ROUTING_DOCS:
        with open(path, encoding="utf-8") as handle:
            blocks = list(_table_blocks(handle.read()))

        for block in blocks:
            delimiters = [row for _, row in block if _is_delimiter(row)]
            if not delimiters:
                continue  # a run of pipe-led lines that is not a table
            expected = _cell_count(delimiters[0])
            for number, row in block:
                if _is_delimiter(row):
                    continue
                found = _cell_count(row)
                if found != expected:
                    failures.append(
                        f"{os.path.relpath(path, PORTFOLIO)}:{number}: table row has "
                        f"{found} cells, but its delimiter row declares {expected}. "
                        f"An unescaped '|' -- even inside a backtick span -- splits a "
                        f"GFM cell; write it as '\\|'."
                    )
    return failures


CHECKS = [
    (
        "eaa-wcag-triage",
        "src/wcag_triage/rules.py (COVERAGE)",
        check_wcag_coverage_split,
    ),
    (
        "eaa-wcag-triage",
        "src/wcag_triage/rules.py (unimplemented rows)",
        check_wcag_unbuilt_rows_are_undecidable,
    ),
    (
        "mcp-drift-watch",
        "score_model_pass_c3.py + committed labels",
        check_mcp_corpus3_model_f1,
    ),
]


def run(index_text: str | None = None) -> list:
    """Run every check. Returns a list of failure strings; empty means pass."""
    if index_text is None:
        with open(INDEX, encoding="utf-8") as handle:
            index_text = handle.read()

    failures = []
    for probe, artifact, check in CHECKS:
        described, required = check()
        missing = [needle for needle in required if needle not in index_text]
        status = "ok" if not missing else "MISSING"
        print(f"  [{status:>7}] {probe}: {described}")
        print(f"            derived from {artifact}")
        for needle in missing:
            failures.append(
                f"{probe}: README.md does not state {needle!r}, "
                f"which {artifact} currently derives."
            )
    return failures


def main() -> int:
    print("Checking probes/README.md against the probes' own artifacts\n")
    stale = run()
    print()

    print("Checking that the routing tables still render\n")
    broken = check_table_rows_render()
    for path in ROUTING_DOCS:
        relative = os.path.relpath(path, PORTFOLIO)
        hits = [f for f in broken if f.startswith(f"{relative}:")]
        print(f"  [{'MISSING' if hits else 'ok':>7}] {relative}: "
              f"{len(hits)} malformed table row(s)")
    print()

    if stale:
        print(f"{len(stale)} stale figure(s) in probes/README.md:\n")
        for failure in stale:
            print(f"  - {failure}")
        print(
            "\nThe artifact is the source of truth. Update the index cell to the "
            "derived figure\nrather than editing the artifact to match the prose."
        )
    if broken:
        print(f"{len(broken)} malformed table row(s) in the routing documents:\n")
        for failure in broken:
            print(f"  - {failure}")
    if stale or broken:
        return 1

    print(f"All {len(CHECKS)} derived figures in probes/README.md match their artifacts,")
    print(f"and every table row in {len(ROUTING_DOCS)} routing document(s) renders.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
