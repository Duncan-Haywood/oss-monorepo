#!/usr/bin/env python3
"""Score the named-tool-relation rule on both held-out corpora.

What this answers
-----------------
The corpus-3 pass named one gap and one next step:

    35 of the 44 missed positives are one mechanism ... a server naming another
    of its own tools and saying when to reach for it ... What would be worth it
    is a rule for the class below, measured on a fourth corpus.

`relation.py` is the rule. A fourth corpus turned out not to be what it needed:
the eligible population was already exhausted by corpora 2 and 3 (164 packages,
60 + 103 attempted), and more to the point **corpus 2 is already held out for
this rule** -- it was collected and hand-labelled on 2026-08-22, it shares no
package with corpus 3, and it was not read while the rule was written. Corpus 3
named the class, so corpus 3 is in sample. That is the same split
`rule_variants.py` had, one corpus later.

Four rule sets, on each corpus:

    shipped            classify_drift.py, unmodified
    variant            + the three edits corpus 2 named (rule_variants.py)
    shipped+relation   classify_drift.py, upgraded by relation.py
    variant+relation   both

The comparison that matters is **variant -> variant+relation on corpus 2**: the
marginal value of the new rule, on a corpus that did not suggest it, on top of
the best rules already measured.

Usage
-----
    python3 score_relation.py            # print the table
    python3 score_relation.py --write    # also write relation-scores-2026-08-23.json
"""

from __future__ import annotations

import argparse
import json
import os

import build_labels
import build_labels_c3
import relation
import rule_variants
from build_labels import by_signal, score

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "relation-scores-2026-08-23.json")

CORPORA = {
    "corpus 2 (held out for this rule)": {
        "path": os.path.join(HERE, "results-holdout-2026-08-22.json"),
        "positives": build_labels.TRUE_INSTRUCTION_BEARING,
        "borderline": build_labels.BORDERLINE,
        "negatives": build_labels.EXAMINED_AND_NEGATIVE,
    },
    "corpus 3 (in sample: it named the class)": {
        "path": os.path.join(HERE, "results-holdout-c3-2026-08-22.json"),
        "positives": build_labels_c3.TRUE_INSTRUCTION_BEARING,
        "borderline": build_labels_c3.BORDERLINE,
        "negatives": build_labels_c3.EXAMINED_AND_NEGATIVE,
    },
}


def rule_sets() -> dict:
    """name -> (variant signal table or None, apply the relation rule?)."""
    return {
        "shipped": (None, False),
        "variant": (rule_variants.variant_signals(), False),
        "shipped+relation": (None, True),
        "variant+relation": (rule_variants.variant_signals(), True),
    }


def labelled(corpus: dict, table, with_relation: bool) -> dict:
    """A corpus copy whose `label` is what the named rule set produces."""
    if with_relation:
        return {"changes": relation.label_with_relation(corpus, table=table)}
    if table is None:
        changes = [
            dict(c, label=relation.classify_drift.classify(c["old"], c["new"], strict=True))
            for c in corpus["changes"]
        ]
    else:
        changes = [
            dict(c, label=rule_variants.classify_variant(c["old"], c["new"], table=table))
            for c in corpus["changes"]
        ]
    return {"changes": changes}


def evaluate(spec: dict) -> dict:
    with open(spec["path"]) as fh:
        corpus = json.load(fh)

    results = {}
    rows_by_set = {}
    for name, (table, with_relation) in rule_sets().items():
        relabelled = labelled(corpus, table, with_relation)
        rows = build_labels.label_corpus(
            relabelled,
            positives=spec["positives"],
            borderline=spec["borderline"],
            negatives=spec["negatives"],
        )
        rows_by_set[name] = rows
        alerts = sum(1 for r in rows if r["rules_bucket"] == build_labels.ALERT)
        results[name] = {
            "alerting_share_pct": round(alerts / len(rows) * 100, 1),
            "borderline_counted_as_positive": score(rows, count_borderline=True),
            "borderline_counted_as_negative": score(rows, count_borderline=False),
            "precision_by_signal": by_signal(rows),
        }

    # What the relation rule alone did to the best prior rule set: every change
    # it moved, and whether the hand label agrees. This is the part a reader
    # should be able to check one row at a time.
    moved = []
    base = {key_of(r): r for r in rows_by_set["variant"]}
    for row in rows_by_set["variant+relation"]:
        before = base[key_of(row)]
        if before["rules_bucket"] != row["rules_bucket"]:
            moved.append(
                {
                    "pkg": row["pkg"],
                    "tool": row["tool"],
                    "from": row["from"],
                    "was": before["rules_bucket"],
                    "now": row["rules_bucket"],
                    "hand_label": row["hand_label"],
                    "borderline": row["borderline"],
                    "correct": row["hand_label"] == build_labels.ALERT,
                }
            )

    return {
        "corpus": os.path.basename(spec["path"]),
        "changes": len(corpus["changes"]),
        "rule_sets": results,
        "relation_rule_moved": moved,
        "per_package": per_package(rows_by_set, spec["positives"]),
        "coverage_gap": relation.coverage_gap(corpus),
    }


def per_package(rows_by_set: dict, positives: dict) -> dict:
    """Recall per publisher, which is where the aggregate figure hides the result.

    Both prior passes noted that a handful of publishers carry most of a
    corpus's positives, and treated it as a caveat on the denominator. Split
    this way it is the finding: the class this rule detects is a property of how
    a particular server writes its descriptions, so recall is near-total on the
    servers that write cross-tool routing and unmoved on the ones that do not. A
    single portfolio-wide recall is a weighted average over two populations, and
    the weights are whichever servers a subscriber happens to watch.
    """
    out: dict[str, dict] = {}
    for rule_set in ("variant", "variant+relation"):
        for row in rows_by_set[rule_set]:
            entry = out.setdefault(
                row["pkg"], {"changes": 0, "hand_positives": 0, "variant": 0, "variant+relation": 0}
            )
            if rule_set == "variant":
                entry["changes"] += 1
                if key_of(row) in positives:
                    entry["hand_positives"] += 1
            if key_of(row) in positives and row["rules_bucket"] == build_labels.ALERT:
                entry[rule_set] += 1
    return {pkg: v for pkg, v in out.items() if v["hand_positives"]}


def key_of(row: dict) -> tuple:
    return (row["pkg"], row["tool"], row["from"])


def render(name: str, result: dict) -> None:
    print(f"\n=== {name} -- {result['corpus']}, {result['changes']} changes ===")
    header = f"{'rule set':<20}{'flagged%':>9}{'P':>7}{'R':>7}{'F1':>7}"
    print(header)
    print("-" * len(header))
    for rule_set, scores in result["rule_sets"].items():
        inclusive = scores["borderline_counted_as_positive"]
        print(
            f"{rule_set:<20}{scores['alerting_share_pct']:>9}"
            f"{inclusive['precision']:>7}{inclusive['recall']:>7}{inclusive['f1']:>7}"
        )
    moved = result["relation_rule_moved"]
    correct = sum(1 for m in moved if m["correct"])
    print(f"\nrelation rule moved {len(moved)} change(s) off `variant`; {correct} agree with the hand label")
    for m in moved:
        mark = "OK " if m["correct"] else "FP "
        note = " (borderline)" if m["borderline"] else ""
        print(f"  {mark}{m['pkg']} :: {m['tool']} {m['from']} [{m['was']} -> {m['now']}]{note}")
    print("\nrecall per publisher (hand positives caught):")
    for pkg, row in sorted(
        result["per_package"].items(), key=lambda kv: -kv[1]["hand_positives"]
    ):
        print(
            f"  {pkg:<40}{row['variant']:>3}/{row['hand_positives']:<3} -> "
            f"{row['variant+relation']:>3}/{row['hand_positives']}"
        )
    gap = result["coverage_gap"]
    print(
        f"\ncoverage gap: {gap['single_word_tool_names']} single-word tool names across "
        f"{gap['packages_with_single_word_tool_names']}/{gap['packages']} packages; "
        f"{gap['changes_on_those_packages']} change(s) on "
        f"{gap['packages_with_one_tool_in_corpus']} package(s) with no sibling in the corpus"
    )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--write", action="store_true", help="write the scores file")
    args = ap.parse_args()

    out = {}
    for name, spec in CORPORA.items():
        result = evaluate(spec)
        out[name] = result
        render(name, result)

    if args.write:
        with open(OUT, "w") as fh:
            json.dump(out, fh, indent=1)
        print(f"\nwrote {os.path.basename(OUT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
