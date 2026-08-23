#!/usr/bin/env python3
"""Split the shipped watch's accuracy by publisher, on both held-out corpora.

What this answers
-----------------
The fourth pass (`relation.py`, 2026-08-23) found that the class its rule
detects is a property of *which publisher* you watch, and closed by naming a
consequence it did not act on:

    A portfolio-wide recall figure is a weighted average over two populations,
    and the weights are whichever servers a subscriber happens to watch. [...]
    Every accuracy figure this probe has published so far -- including the
    0.40-0.62 span the subscriber record prints -- is an aggregate of exactly
    this kind.

That was argued from the *relation* rule's per-publisher table. The figures a
customer is actually shown come from the **shipped** classifier, which that
table does not score, so the consequence was stated but never measured on the
thing it indicts. This script measures it: `classify_drift.classify` unmodified,
scored per publisher, on the two committed held-out corpora.

The result does not reproduce the shape the fourth pass assumed, and the
difference matters commercially. There is no population of well-watched
publishers. Every publisher the watch caught *everything* on had exactly one
qualifying change -- a coin flip that landed, not a rate -- and on every
publisher with more than one, it never caught more than a third. The aggregate
is not a blend of good and bad coverage; it is a blend of near-zero coverage and
small-sample noise.

Why the split is by publisher and not by anything else
------------------------------------------------------
A subscriber does not buy a corpus. They connect some servers, and what they
experience is the per-server rate on those servers. An aggregate recall is
change-weighted: it answers "of all qualifying changes anywhere, what share did
we catch", which is the question a vendor asks. Both are printed, because the
gap between them is the disclosure.

Every figure this prints is a count, a median, a max, or a pooled rate over an
explicitly named set. **No cutoff is picked after seeing the table**, which is
the error this probe's own corpus-3 section is named for: a first draft of this
script reported "publishers with recall above a third", and that claim turned
out to flip between a cutoff of 0.25 and one of 0.33 -- both defensible, chosen
from the same table they described. The two figures that replaced it say the
same thing without a cutoff at all: which publishers the watch caught
*everything* on, and the *best* recall on any publisher with more than one
qualifying change.

Usage
-----
    python3 score_by_publisher.py            # print the table
    python3 score_by_publisher.py --write    # also write publisher-split-2026-08-23.json

Standard library only, offline, from the committed corpora.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys

import build_labels
import build_labels_c3
from build_labels import label_corpus, score

HERE = os.path.dirname(os.path.abspath(__file__))

# The shipped classifier, imported the way every entry point in this probe
# imports it. Stated explicitly rather than inherited from whichever module
# happened to be imported first.
sys.path.insert(0, os.path.join(HERE, "..", "..", "..", "research", "mcp-tool-drift"))

import classify_drift  # noqa: E402

OUT = os.path.join(HERE, "publisher-split-2026-08-23.json")

CORPORA = {
    "corpus 2": {
        "path": os.path.join(HERE, "results-holdout-2026-08-22.json"),
        "positives": build_labels.TRUE_INSTRUCTION_BEARING,
        "borderline": build_labels.BORDERLINE,
        "negatives": build_labels.EXAMINED_AND_NEGATIVE,
    },
    "corpus 3": {
        "path": os.path.join(HERE, "results-holdout-c3-2026-08-22.json"),
        "positives": build_labels_c3.TRUE_INSTRUCTION_BEARING,
        "borderline": build_labels_c3.BORDERLINE,
        "negatives": build_labels_c3.EXAMINED_AND_NEGATIVE,
    },
}


def shipped_rows(spec: dict) -> list:
    """Label a committed corpus with the shipped classifier, unmodified."""
    with open(spec["path"]) as fh:
        corpus = json.load(fh)
    changes = [
        dict(c, label=classify_drift.classify(c["old"], c["new"], strict=True))
        for c in corpus["changes"]
    ]
    return label_corpus(
        {"changes": changes},
        positives=spec["positives"],
        borderline=spec["borderline"],
        negatives=spec["negatives"],
    )


def per_publisher(rows: list) -> dict:
    """publisher -> its own confusion matrix under the shipped rules."""
    grouped: dict[str, list] = {}
    for row in rows:
        grouped.setdefault(row["pkg"], []).append(row)
    return {pkg: score(group) for pkg, group in grouped.items()}


def summarise(rows: list) -> dict:
    """Every figure this probe would print, derived from one corpus's rows."""
    by_pkg = per_publisher(rows)

    # Only publishers where something qualifying actually happened can have a
    # recall at all; a publisher with no hand positive has no denominator, and
    # counting it as 0.0 or as 1.0 are both fabrications.
    with_positives = {
        pkg: s for pkg, s in by_pkg.items() if s["true_positives"] + s["false_negatives"]
    }
    recalls = {
        pkg: s["true_positives"] / (s["true_positives"] + s["false_negatives"])
        for pkg, s in with_positives.items()
    }
    positives = {
        pkg: s["true_positives"] + s["false_negatives"] for pkg, s in with_positives.items()
    }
    total_positives = sum(positives.values())

    ranked = sorted(positives.items(), key=lambda kv: -kv[1])
    largest_pkg, largest_n = ranked[0]

    return {
        "changes": len(rows),
        "publishers": len(by_pkg),
        "publishers_with_a_qualifying_change": len(with_positives),
        # The figure the record prints today, for contrast: change-weighted.
        "aggregate": score(rows),
        # What a subscriber watching one server experiences instead.
        "median_per_publisher_recall": round(statistics.median(recalls.values()), 3),
        "publishers_caught_nothing": sorted(pkg for pkg, r in recalls.items() if r == 0.0),
        # Two cutoff-free readings of the same thing. The first is the only
        # natural boundary a recall has; the second is a max over an explicitly
        # named set, and between them they say what a cutoff was being used to
        # say -- that no per-publisher figure worth calling a rate is high.
        "publishers_catching_everything": {
            pkg: positives[pkg] for pkg, r in sorted(recalls.items()) if r == 1.0
        },
        "best_recall_where_more_than_one_qualifying_change": max(
            (
                {"pkg": pkg, "qualifying_changes": positives[pkg], "recall": round(r, 3)}
                for pkg, r in recalls.items()
                if positives[pkg] > 1
            ),
            key=lambda row: row["recall"],
            default={"pkg": None, "qualifying_changes": 0, "recall": None},
        ),
        "largest_publisher": {
            "pkg": largest_pkg,
            "qualifying_changes": largest_n,
            "share_of_corpus_positives": round(largest_n / total_positives, 3),
            "recall": round(recalls[largest_pkg], 3),
        },
        "total_qualifying_changes": total_positives,
        # The other direction, split the same way. A subscriber's false-alert
        # load is not a rate they pay uniformly either: it arrives from
        # particular servers, because a false alert here is a phrase a
        # particular publisher writes.
        "false_alerts": {
            "total": sum(s["false_positives"] for s in by_pkg.values()),
            "publishers_producing_one": sorted(
                pkg for pkg, s in by_pkg.items() if s["false_positives"]
            ),
            "largest_source": max(
                (
                    {"pkg": pkg, "false_alerts": s["false_positives"]}
                    for pkg, s in by_pkg.items()
                    if s["false_positives"]
                ),
                key=lambda row: row["false_alerts"],
                default={"pkg": None, "false_alerts": 0},
            ),
        },
        "per_publisher": {
            pkg: {
                "changes": s["true_positives"]
                + s["false_positives"]
                + s["false_negatives"]
                + s["true_negatives"],
                "qualifying_changes": positives.get(pkg, 0),
                "caught": s["true_positives"],
                "flagged": s["true_positives"] + s["false_positives"],
                "false_alerts": s["false_positives"],
                "recall": round(recalls[pkg], 3) if pkg in recalls else None,
            }
            for pkg, s in sorted(
                by_pkg.items(), key=lambda kv: -(kv[1]["true_positives"] + kv[1]["false_negatives"])
            )
        },
    }


def pooled_across_corpora(summaries: dict) -> dict:
    """The two figures that need both corpora at once.

    Pooling is over publishers, not over corpora-as-units: the corpora share no
    package, so a publisher appears in exactly one of them and the union is a
    well-formed set of 16 publishers rather than a re-weighting of two numbers.
    """
    caught = nothing = with_positives = 0
    recalls = []
    publishers = 0
    false_alerts = 0
    publishers_with_a_false_alert = 0
    for summary in summaries.values():
        publishers += summary["publishers"]
        false_alerts += summary["false_alerts"]["total"]
        publishers_with_a_false_alert += len(summary["false_alerts"]["publishers_producing_one"])
        for pkg, row in summary["per_publisher"].items():
            if not row["qualifying_changes"]:
                continue
            with_positives += 1
            caught += row["caught"]
            recalls.append(row["recall"])
            if row["recall"] == 0.0:
                nothing += 1
    return {
        "publishers": publishers,
        "publishers_with_a_qualifying_change": with_positives,
        "publishers_caught_nothing": nothing,
        "median_per_publisher_recall": round(statistics.median(recalls), 3),
        "qualifying_changes": sum(s["total_qualifying_changes"] for s in summaries.values()),
        "caught": caught,
        "false_alerts": false_alerts,
        "publishers_with_a_false_alert": publishers_with_a_false_alert,
    }


def measure() -> dict:
    summaries = {name: summarise(shipped_rows(spec)) for name, spec in CORPORA.items()}
    return {
        "rules": "classify_drift.classify(strict=True), unmodified -- what the record quotes",
        "corpora": summaries,
        "pooled": pooled_across_corpora(summaries),
    }


def render(result: dict) -> None:
    for name, summary in result["corpora"].items():
        agg = summary["aggregate"]
        print(f"\n=== {name}: {summary['changes']} changes, {summary['publishers']} publishers ===")
        print(
            f"aggregate (change-weighted, what the record prints): "
            f"P {agg['precision']} R {agg['recall']}"
        )
        print(f"median per-publisher recall:                        {summary['median_per_publisher_recall']}")
        print(
            f"publishers with a qualifying change:                "
            f"{summary['publishers_with_a_qualifying_change']}, of which "
            f"{len(summary['publishers_caught_nothing'])} caught nothing"
        )
        largest = summary["largest_publisher"]
        print(
            f"largest publisher: {largest['pkg']} holds {largest['qualifying_changes']} "
            f"({largest['share_of_corpus_positives']:.0%}) of this corpus's qualifying "
            f"changes; recall on it {largest['recall']}"
        )
        fa = summary["false_alerts"]
        print(
            f"false alerts: {fa['total']} across "
            f"{len(fa['publishers_producing_one'])} publisher(s); largest single source "
            f"{fa['largest_source']['pkg']} with {fa['largest_source']['false_alerts']}"
        )
        print(f"\n  {'publisher':<42}{'chg':>5}{'qual':>6}{'caught':>8}{'recall':>8}{'false':>7}")
        for pkg, row in summary["per_publisher"].items():
            if not row["qualifying_changes"] and not row["false_alerts"]:
                continue
            recall = "--" if row["recall"] is None else row["recall"]
            print(
                f"  {pkg:<42}{row['changes']:>5}{row['qualifying_changes']:>6}"
                f"{row['caught']:>8}{recall:>8}{row['false_alerts']:>7}"
            )

    pooled = result["pooled"]
    print(
        f"\n=== pooled over both corpora ({pooled['publishers_with_a_qualifying_change']} "
        f"publishers with a qualifying change) ==="
    )
    print(
        f"caught nothing at all:        {pooled['publishers_caught_nothing']}/"
        f"{pooled['publishers_with_a_qualifying_change']} publishers"
    )
    print(f"median per-publisher recall:  {pooled['median_per_publisher_recall']}")
    print(f"change-weighted recall:       {pooled['caught']}/{pooled['qualifying_changes']}")
    print(
        f"false alerts:                 {pooled['false_alerts']} from "
        f"{pooled['publishers_with_a_false_alert']}/{pooled['publishers']} publishers watched"
    )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--write", action="store_true", help="write the split file")
    args = ap.parse_args()

    result = measure()
    render(result)
    if args.write:
        with open(OUT, "w") as fh:
            json.dump(result, fh, indent=1)
        print(f"\nwrote {os.path.basename(OUT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
