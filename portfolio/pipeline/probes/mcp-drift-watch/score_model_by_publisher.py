#!/usr/bin/env python3
"""Split the *model's* accuracy by publisher, on both held-out corpora.

What this answers
-----------------
The fifth pass (`score_by_publisher.py`, 2026-08-23) took the fourth pass's
charge -- that every accuracy figure this probe publishes is an aggregate over
publishers who behave nothing alike -- and measured it on the shipped rules.
Its finding was that the aggregate hides something worse than it advertises:

    There is no population of well-watched publishers. Every publisher the
    watch caught *everything* on had exactly one qualifying change -- a coin
    flip that landed, not a rate -- and on every publisher with more than one,
    it never caught more than a third.

That was measured on `classify_drift.classify`. It was **not** measured on the
model, and the model's pooled figures are the ones `mcp-supply-chain-watch`'s
`ai_leverage` score actually rests on: the 6 -> 7 move cited the corpus-2 model
pass, and the third pass cited the corpus-3 one. So the fifth pass repeated,
one level up, the exact error it was written to correct -- it indicted "every
accuracy figure this probe has published", split the ones the *record* quotes,
and left the ones the *score* rests on pooled.

This splits them. Same instrument, different classifier: the corpora, the hand
labels, the borderline calls and `score_by_publisher.summarise` are reused
unmodified, and only the label column changes -- from the shipped rules'
bucket to the committed model pass's blind label. Nothing here re-runs a model
or reaches the network; both model passes are committed as data
(`model-pass-2026-08-22.json`, `model-pass-c3-2026-08-22.json`), which is why
this costs one local run rather than one paid run.

Why reuse rather than re-derive
-------------------------------
A separate per-publisher scorer written for the model would make the two
tables incomparable in exactly the way this probe keeps catching itself on: the
difference between 0.00 and 1.00 median recall has to be a difference in the
classifier, not in how each was counted. So the model's labels are attached to
the *same* rows `score_by_publisher.py` builds, and summarised by the *same*
function. The one thing not inherited is the borderline convention: the fifth
pass reported only `count_borderline=True`, and this probe reports spans
everywhere else, so the conservative reading is computed too -- by demoting
borderline rows' hand label rather than by adding a parameter to the fifth
pass's code, so that code stays byte-identical and its committed figures stay
reproducible.

Usage
-----
    python3 score_model_by_publisher.py            # print the table
    python3 score_model_by_publisher.py --write    # also write the split file

Standard library only, offline, from the committed corpora and model passes.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics

import build_labels
from score_by_publisher import CORPORA, shipped_rows, summarise

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "model-publisher-split-2026-08-23.json")

ALERT = build_labels.ALERT
NOT_ALERT = "not-" + ALERT

MODEL_PASSES = {
    "corpus 2": os.path.join(HERE, "model-pass-2026-08-22.json"),
    "corpus 3": os.path.join(HERE, "model-pass-c3-2026-08-22.json"),
}


def hand_rows(spec: dict) -> list:
    """The corpus's rows with hand labels attached, exactly as the fifth pass builds them."""
    with open(spec["path"]) as fh:
        corpus = json.load(fh)
    return build_labels.label_corpus(
        corpus,
        positives=spec["positives"],
        borderline=spec["borderline"],
        negatives=spec["negatives"],
    )


def model_rows(name: str, spec: dict) -> list:
    """The same rows, with the classifier column replaced by the model's blind label.

    `score` reads whatever is in `rules_bucket` as "what the classifier said".
    The field keeps its name so the summariser is reused rather than forked;
    it does not mean the rules produced these labels.
    """
    rows = hand_rows(spec)
    with open(MODEL_PASSES[name]) as fh:
        model = json.load(fh)
    by_key = {(r["pkg"], r["tool"], r["from"]): r for r in model["labels"]}

    out = []
    for row in rows:
        k = (row["pkg"], row["tool"], row["from"])
        if k not in by_key:
            raise SystemExit(f"{name}: no model label for {k}")
        out.append(dict(row, rules_bucket=by_key[k]["label"]))

    unmatched = set(by_key) - {(r["pkg"], r["tool"], r["from"]) for r in rows}
    if unmatched:
        raise SystemExit(f"{name}: {len(unmatched)} model labels match no corpus row")
    return out


def conservative(rows: list) -> list:
    """Borderline hand calls demoted to negatives.

    `build_labels.score(count_borderline=False)` does this by branching inside
    the loop; doing it to the rows instead means `summarise` -- which does not
    take the flag -- reports the conservative reading without being edited.
    """
    return [dict(r, hand_label=NOT_ALERT) if r["borderline"] else r for r in rows]


def both_readings(rows: list) -> dict:
    return {
        "borderline_counted_as_positive": summarise(rows),
        "borderline_counted_as_negative": summarise(conservative(rows)),
    }


def comparison(model: dict, rules: dict) -> dict:
    """The figures the fifth pass printed for the rules, beside the model's.

    Restricted to publishers with more than one qualifying change wherever a
    cutoff would otherwise be needed -- the fifth pass withdrew a
    "recall above a third" claim for being cutoff-dependent, and this table
    inherits that discipline rather than re-introducing the cutoff to make a
    cleaner-looking row.
    """
    return {
        "median_per_publisher_recall": {
            "rules": rules["median_per_publisher_recall"],
            "model": model["median_per_publisher_recall"],
        },
        "publishers_with_a_qualifying_change": rules["publishers_with_a_qualifying_change"],
        "publishers_caught_nothing": {
            "rules": len(rules["publishers_caught_nothing"]),
            "model": len(model["publishers_caught_nothing"]),
        },
        "best_recall_where_more_than_one_qualifying_change": {
            "rules": rules["best_recall_where_more_than_one_qualifying_change"],
            "model": model["best_recall_where_more_than_one_qualifying_change"],
        },
        "largest_publisher": {
            "pkg": rules["largest_publisher"]["pkg"],
            "qualifying_changes": rules["largest_publisher"]["qualifying_changes"],
            "share_of_corpus_positives": rules["largest_publisher"]["share_of_corpus_positives"],
            "rules_recall": rules["largest_publisher"]["recall"],
            "model_recall": model["largest_publisher"]["recall"],
        },
        "false_alerts": {
            "rules": {
                "total": rules["false_alerts"]["total"],
                "publishers": len(rules["false_alerts"]["publishers_producing_one"]),
                "largest_source": rules["false_alerts"]["largest_source"],
            },
            "model": {
                "total": model["false_alerts"]["total"],
                "publishers": len(model["false_alerts"]["publishers_producing_one"]),
                "largest_source": model["false_alerts"]["largest_source"],
            },
        },
    }


def multi_positive_recalls(summary: dict) -> dict:
    """Every publisher with more than one qualifying change, and its recall.

    This is the only per-publisher view in this file that is not a single
    number, and it exists because it is the one the small-denominator caveat
    does *not* dissolve: a median over publishers with one qualifying change
    each is a median over coin flips.
    """
    return {
        pkg: row["recall"]
        for pkg, row in summary["per_publisher"].items()
        if row["qualifying_changes"] > 1
    }


def measure() -> dict:
    corpora = {}
    for name, spec in CORPORA.items():
        model = both_readings(model_rows(name, spec))
        rules = both_readings(shipped_rows(spec))
        corpora[name] = {
            "model": model,
            "rules": rules,
            "comparison": {
                reading: comparison(model[reading], rules[reading]) for reading in model
            },
            "multi_positive_recalls": {
                reading: {
                    "model": multi_positive_recalls(model[reading]),
                    "rules": multi_positive_recalls(rules[reading]),
                }
                for reading in model
            },
        }
    return {
        "model": "the committed blind passes, unmodified -- what `ai_leverage` rests on",
        "rules": "classify_drift.classify(strict=True), unmodified -- what the record quotes",
        "corpora": corpora,
        "pooled": pooled(corpora),
    }


def pooled(corpora: dict) -> dict:
    """The figures that need both corpora at once, for each reading.

    Pooled over publishers rather than over corpora-as-units, for the reason
    the fifth pass gives: the corpora share no package, so a publisher appears
    in exactly one of them and the union is a well-formed set.
    """
    out = {}
    for reading in ("borderline_counted_as_positive", "borderline_counted_as_negative"):
        row = {}
        for side in ("model", "rules"):
            recalls = []
            nothing = 0
            caught = 0
            qualifying = 0
            false_alerts = 0
            publishers_with_a_false_alert = 0
            for corpus in corpora.values():
                summary = corpus[side][reading]
                false_alerts += summary["false_alerts"]["total"]
                publishers_with_a_false_alert += len(
                    summary["false_alerts"]["publishers_producing_one"]
                )
                for pkg_row in summary["per_publisher"].values():
                    if not pkg_row["qualifying_changes"]:
                        continue
                    recalls.append(pkg_row["recall"])
                    caught += pkg_row["caught"]
                    qualifying += pkg_row["qualifying_changes"]
                    if pkg_row["recall"] == 0.0:
                        nothing += 1
            row[side] = {
                "publishers_with_a_qualifying_change": len(recalls),
                "publishers_caught_nothing": nothing,
                "median_per_publisher_recall": round(statistics.median(recalls), 3),
                "caught": caught,
                "qualifying_changes": qualifying,
                "false_alerts": false_alerts,
                "publishers_with_a_false_alert": publishers_with_a_false_alert,
            }
        out[reading] = row
    return out


def render(result: dict) -> None:
    for name, corpus in result["corpora"].items():
        print(f"\n=== {name} ===")
        for reading, cmp in corpus["comparison"].items():
            print(f"\n  [{reading}]")
            med = cmp["median_per_publisher_recall"]
            print(
                f"  median per-publisher recall        rules {med['rules']:<8} "
                f"model {med['model']}"
            )
            nothing = cmp["publishers_caught_nothing"]
            n = cmp["publishers_with_a_qualifying_change"]
            print(
                f"  publishers it caught nothing on    rules {nothing['rules']}/{n:<6} "
                f"model {nothing['model']}/{n}"
            )
            best = cmp["best_recall_where_more_than_one_qualifying_change"]
            print(
                f"  best recall, >1 qualifying change  rules {best['rules']['recall']:<8} "
                f"model {best['model']['recall']}"
            )
            largest = cmp["largest_publisher"]
            print(
                f"  largest publisher ({largest['pkg']}, {largest['qualifying_changes']} "
                f"= {largest['share_of_corpus_positives']:.0%} of positives): "
                f"rules {largest['rules_recall']}  model {largest['model_recall']}"
            )
            fa = cmp["false_alerts"]
            print(
                f"  false alerts                       rules {fa['rules']['total']} from "
                f"{fa['rules']['publishers']} publisher(s)   "
                f"model {fa['model']['total']} from {fa['model']['publishers']} publisher(s)"
            )
            multi = corpus["multi_positive_recalls"][reading]
            print("  publishers with more than one qualifying change:")
            for pkg in sorted(multi["model"], key=lambda p: -multi["model"][p]):
                print(
                    f"    {pkg:<44} rules {multi['rules'].get(pkg)!s:<8} "
                    f"model {multi['model'][pkg]}"
                )

    for reading, row in result["pooled"].items():
        print(f"\n=== pooled over both corpora [{reading}] ===")
        for side in ("rules", "model"):
            s = row[side]
            print(
                f"  {side:<6} caught nothing on {s['publishers_caught_nothing']}/"
                f"{s['publishers_with_a_qualifying_change']} publishers, "
                f"median per-publisher recall {s['median_per_publisher_recall']}, "
                f"change-weighted {s['caught']}/{s['qualifying_changes']}, "
                f"{s['false_alerts']} false alerts from "
                f"{s['publishers_with_a_false_alert']} publisher(s)"
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
