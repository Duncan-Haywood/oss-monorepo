#!/usr/bin/env python3
"""The three rule edits corpus 2 argued for, applied without forking the engine.

Why this exists
---------------
The held-out run on 2026-08-22 (`results-holdout-2026-08-22.json`, 136 changes,
23 packages) measured the shipped classifier at precision 0.40 and recall
0.24-0.29, and localised almost all of the error to three named mechanisms:

  1. `secret_or_credential` raised 6 of 10 alerts and 0 of the true positives,
     on two independent corpora.
  2. `tool_routing` recognises "prefer this tool" but not a preference expressed
     *toward a named other tool* ("**Prefer `naumu_ask`**"), which is how every
     instance in that corpus was written. That gap carried 5 of 10 clear misses.
  3. `imperative_priority` requires `important:` with a colon, and missed
     "IMPORTANT - login is user-level, not account-level:" on punctuation.

That write-up then deliberately declined to make the edits, because the numbers
they produce would be measured on the corpus that suggested them:

    "dropping `secret_or_credential` alone takes precision from 0.40 to 1.00
     with no true positive lost. That number would be in sample, and quoting it
     as accuracy is precisely the error this pass exists to correct. Anyone
     taking those fixes needs a **third** corpus."

This module is the edits. `results-holdout-c3-2026-08-22.json` is the third
corpus. Neither was read while the other was being written: the corpus was
collected by `collect_holdout.py --exclude-from results-holdout-2026-08-22.json`
before any variant here was defined, and the variants encode the three
mechanisms the earlier write-up had already named in prose -- nothing was added
after looking at corpus 3.

How it avoids forking the classifier
------------------------------------
`portfolio/research/a11y-engine-agreement/` found two engines in this
repository silently drifting apart on the same input. The probe answered that by
importing `classify_drift.classify` rather than copying it, and the same rule
applies to a variant: the only difference between shipped and variant here is
the **signal table**, swapped in for the duration of one call. Every other
step -- `added_text`, the span-must-be-new rule, capability verbs, schema
widening, bucket precedence -- is the shipped code, running unmodified. A
variant that reimplemented `classify` would be measuring the reimplementation.

Usage
-----
    python3 rule_variants.py --corpus results-holdout-c3-2026-08-22.json
"""

from __future__ import annotations

import argparse
import contextlib
import copy
import json
import os
import re
import sys

sys.path.insert(
    0,
    os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "research", "mcp-tool-drift"
    ),
)

import classify_drift  # noqa: E402
from classify_drift import INSTRUCTION_SIGNALS  # noqa: E402

# --- edit 2 -----------------------------------------------------------------
# A preference expressed toward a named other tool. Deliberately requires a
# tool-shaped name (snake_case with at least one underscore, or a backticked
# identifier) rather than any word after "prefer", so that ordinary prose --
# "prefer the paginated form", "we recommend batching" -- does not match. The
# alternation mirrors the three surface forms corpus 2 actually contained:
# "**Prefer `naumu_ask`**", "consider `naumu_ask` instead", and
# "prefer `prepare_product_images` (single call)".
NAMED_TOOL_PREFERENCE = (
    r"\b(?:prefer|prefers|preferred|consider|recommended?)\s+(?:using\s+|calling\s+)?"
    r"[`'\"]?[a-z][a-z0-9]*_[a-z0-9_]{2,}[`'\"]?"
)

# --- edit 3 -----------------------------------------------------------------
# `important:` with the colon relaxed to the separators a writer actually uses.
# The em dash is the one corpus 2 missed; the en dash is the same choice made
# with a different key. The plain hyphen is deliberately **excluded**: it is the
# one separator that also occurs inside ordinary words ("important-looking"),
# and buying one more surface form at the cost of a whole false-positive class
# is the trade this edit exists to avoid.
#
# The trailing lookahead matters. The signal table's patterns end in `\b`, and a
# match ending on a dash followed by a space has no word boundary after it -- so
# a naive `important\s*[:–—]` compiles, reads correctly, and never fires. That
# is the same shape as the bug being fixed: a rule defeated by punctuation.
IMPORTANT_SEPARATORS = r"important\s*[:–—]\s*(?=\w)"


def _with_named_tool_preference(pattern: re.Pattern) -> re.Pattern:
    """Append the routing alternative to `tool_routing`'s existing alternation."""
    source = pattern.pattern
    assert source.endswith(")"), "tool_routing is expected to end in a group"
    return re.compile(source[:-1] + "|" + NAMED_TOOL_PREFERENCE + ")", pattern.flags)


def _with_relaxed_important(pattern: re.Pattern) -> re.Pattern:
    assert "important:" in pattern.pattern, "imperative_priority is expected to carry `important:`"
    return re.compile(pattern.pattern.replace("important:", IMPORTANT_SEPARATORS), pattern.flags)


def variant_signals(
    drop_credential: bool = True,
    widen_routing: bool = True,
    relax_important: bool = True,
) -> dict:
    """The signal table the variant classifier runs with."""
    table = copy.copy(INSTRUCTION_SIGNALS)
    if drop_credential:
        table.pop("secret_or_credential", None)
    if widen_routing:
        table["tool_routing"] = _with_named_tool_preference(table["tool_routing"])
    if relax_important:
        table["imperative_priority"] = _with_relaxed_important(table["imperative_priority"])
    return table


@contextlib.contextmanager
def signal_table(table: dict):
    """Run the shipped `classify` against a different signal table, then restore.

    Restoration is in a `finally` so a raising classify cannot leave the shipped
    engine mutated for the rest of the process -- which would silently move the
    "shipped" column of every later comparison.
    """
    original = classify_drift.INSTRUCTION_SIGNALS
    classify_drift.INSTRUCTION_SIGNALS = table
    try:
        yield
    finally:
        classify_drift.INSTRUCTION_SIGNALS = original


def classify_variant(old: str, new: str, table: dict | None = None, strict: bool = True) -> dict:
    with signal_table(table if table is not None else variant_signals()):
        return classify_drift.classify(old, new, strict=strict)


def relabel(corpus: dict, table: dict | None = None) -> dict:
    """A copy of the corpus with `label` recomputed by the variant classifier."""
    out = copy.deepcopy(corpus)
    table = table if table is not None else variant_signals()
    with signal_table(table):
        for change in out["changes"]:
            change["label"] = classify_drift.classify(change["old"], change["new"], strict=True)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--corpus", required=True, help="corpus JSON to relabel")
    ap.add_argument("--out", default=None, help="write the relabelled corpus")
    args = ap.parse_args()

    with open(args.corpus) as fh:
        corpus = json.load(fh)
    relabelled = relabel(corpus)

    def buckets(c):
        counts: dict[str, int] = {}
        for change in c["changes"]:
            counts[change["label"]["bucket"]] = counts.get(change["label"]["bucket"], 0) + 1
        return counts

    print(f"{os.path.basename(args.corpus)}: {len(corpus['changes'])} changes")
    print(f"  shipped rules: {buckets(corpus)}")
    print(f"  variant rules: {buckets(relabelled)}")

    if args.out:
        with open(args.out, "w") as fh:
            json.dump(relabelled, fh, indent=1)
        print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
