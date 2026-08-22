#!/usr/bin/env python3
"""Score a model's blind classifications against the held-out hand labels.

`holdout-labels-2026-08-22.json`'s own write-up names this as the outstanding
gap: "That a model would do better. Nobody has tried. That is the next pass."
The rules classifier (`portfolio/research/mcp-tool-drift/classify_drift.py`,
imported unmodified by `drift_watch.py`) scored precision 0.40, recall
0.24-0.29 on this corpus. This script scores a second classifier -- an LLM
given only `{pkg, tool, from, to, old, new}` per change, no hand labels, no
rules output, no per-signal scores -- against the same ground truth, using the
same borderline-as-positive / borderline-as-negative scoring `build_labels.py`
uses, so the two numbers are comparable.

The prediction file is produced out-of-band (a model reads the blind corpus
and classifies each change independently) and committed here as
`model-predictions-<date>.json`: a JSON array of
`{"id": "<pkg>::<tool>::<from>", "label": "instruction-bearing" |
"not-instruction-bearing", "borderline": bool, "reason": str}`, one row per
change in the corpus, same ids as `blind_corpus.json` would produce.

Usage
-----
    python3 score_model.py model-predictions-2026-08-22.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LABELS = os.path.join(HERE, "holdout-labels-2026-08-22.json")

ALERT = "instruction-bearing"


def key(row: dict) -> tuple:
    return (row["pkg"], row["tool"], row["from"])


def load_predictions(path: str) -> dict:
    with open(path) as fh:
        preds = json.load(fh)
    out = {}
    for row in preds:
        pkg, tool, frm = row["id"].split("::", 2)
        out[(pkg, tool, frm)] = row
    return out


def score(rows: list, predictions: dict, count_borderline: bool) -> dict:
    tp = fp = fn = tn = 0
    missing = []
    for row in rows:
        k = key(row)
        pred = predictions.get(k)
        if pred is None:
            missing.append(k)
            continue
        if row["borderline"] and not count_borderline:
            truth = False
        else:
            truth = row["hand_label"] == ALERT
        flagged = pred["label"] == ALERT
        if flagged and truth:
            tp += 1
        elif flagged:
            fp += 1
        elif truth:
            fn += 1
        else:
            tn += 1
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "true_positives": tp,
        "false_positives": fp,
        "false_negatives": fn,
        "true_negatives": tn,
        "precision": round(precision, 3),
        "recall": round(recall, 3),
        "f1": round(f1, 3),
        "missing": [list(k) for k in missing],
    }


def compare_to_rules(rows: list, predictions: dict) -> dict:
    """Where model and rules agree/disagree, and who is right when they differ."""
    both_flag = model_only = rules_only = neither = 0
    model_right_rules_wrong = rules_right_model_wrong = 0
    for row in rows:
        k = key(row)
        pred = predictions.get(k)
        if pred is None:
            continue
        truth = row["hand_label"] == ALERT
        model_flag = pred["label"] == ALERT
        rules_flag = row["rules_bucket"] == ALERT
        if model_flag and rules_flag:
            both_flag += 1
        elif model_flag:
            model_only += 1
            if truth:
                model_right_rules_wrong += 1
        elif rules_flag:
            rules_only += 1
            if not truth:
                rules_right_model_wrong += 1
        else:
            neither += 1
    return {
        "both_flagged": both_flag,
        "model_only_flagged": model_only,
        "rules_only_flagged": rules_only,
        "neither_flagged": neither,
        "model_only_and_correct": model_right_rules_wrong,
        "rules_only_and_model_correctly_silent": rules_right_model_wrong,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("predictions", help="path to a model-predictions-*.json file")
    args = ap.parse_args()

    with open(LABELS) as fh:
        ground_truth = json.load(fh)
    rows = ground_truth["labels"]
    predictions = load_predictions(args.predictions)

    inclusive = score(rows, predictions, count_borderline=True)
    conservative = score(rows, predictions, count_borderline=False)
    agreement = compare_to_rules(rows, predictions)

    out = {
        "corpus": ground_truth["corpus"],
        "changes_labelled": len(rows),
        "predictions_file": os.path.basename(args.predictions),
        "changes_predicted": len(predictions),
        "rules_scores_for_comparison": ground_truth["scores"],
        "model_scores": {
            "borderline_counted_as_positive": inclusive,
            "borderline_counted_as_negative": conservative,
        },
        "model_vs_rules_agreement": agreement,
    }

    print(f"scored {len(predictions)} model predictions against {len(rows)} hand labels\n")
    print("rules classifier (for comparison):")
    for name, table in ground_truth["scores"].items():
        print(f"  {name:28s} precision={table['precision']} recall={table['recall']} f1={table['f1']}")
    print("\nmodel classifier:")
    for name, table in out["model_scores"].items():
        print(f"  {name:28s} precision={table['precision']} recall={table['recall']} f1={table['f1']}")
    print("\nmodel vs rules agreement:")
    for k, v in agreement.items():
        print(f"  {k:35s} {v}")

    if inclusive["missing"] or conservative["missing"]:
        missing = inclusive["missing"] or conservative["missing"]
        print(f"\nWARNING: {len(missing)} hand-labelled changes have no matching prediction: {missing}", file=sys.stderr)

    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
