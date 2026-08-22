#!/usr/bin/env python3
"""Score `model-pass-c3-2026-08-22.json` against the committed corpus-3 hand labels.

Answers the question the corpus-3 section of `README.md` leaves open: the
corpus-2 model pass (`model-pass-2026-08-22.json`, scored by
`score_model_pass.py`) has not been asked the same question on the corpus that
the rule edits were measured out of sample against. This scores one blind
model pass over corpus 3 -- see `model-pass-c3-2026-08-22.json`'s own `method`
field for exactly what the model was and was not shown -- the same way
`score_model_pass.py` scores the corpus-2 pass, so the two are comparable.

Usage
-----
    python3 score_model_pass_c3.py             # print the score table
    python3 score_model_pass_c3.py --disagree  # also list every model/hand split
"""

from __future__ import annotations

import argparse
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
LABELS = os.path.join(HERE, "holdout-labels-c3-2026-08-22.json")
MODEL = os.path.join(HERE, "model-pass-c3-2026-08-22.json")

ALERT = "instruction-bearing"


def key(row: dict) -> tuple:
    return (row["pkg"], row["tool"], row["from"])


def score(model_rows: list, hand_by_key: dict, count_borderline: bool = True) -> dict:
    tp = fp = fn = tn = 0
    for row in model_rows:
        hand = hand_by_key[key(row)]
        if hand["borderline"] and not count_borderline:
            truth = False
        else:
            truth = hand["hand_label"] == ALERT
        flagged = row["label"] == ALERT
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
    }


def disagreements(model_rows: list, hand_by_key: dict) -> list:
    out = []
    for row in model_rows:
        hand = hand_by_key[key(row)]
        truth = hand["hand_label"] == ALERT
        flagged = row["label"] == ALERT
        if flagged != truth:
            out.append(
                {
                    "key": list(key(row)),
                    "model_label": row["label"],
                    "hand_label": hand["hand_label"],
                    "borderline": hand["borderline"],
                    "model_reason": row["reason"],
                    "hand_note": hand.get("note"),
                }
            )
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--disagree", action="store_true", help="list every disagreement")
    args = ap.parse_args()

    with open(LABELS) as fh:
        hand = json.load(fh)
    with open(MODEL) as fh:
        model = json.load(fh)

    hand_by_key = {key(r): r for r in hand["labels"]}
    model_rows = model["labels"]

    missing = [key(r) for r in model_rows if key(r) not in hand_by_key]
    extra = [k for k in hand_by_key if k not in {key(r) for r in model_rows}]
    if missing or extra:
        print(f"WARNING: {len(missing)} model rows unmatched, {len(extra)} hand rows unmatched")

    inclusive = score(model_rows, hand_by_key, count_borderline=True)
    conservative = score(model_rows, hand_by_key, count_borderline=False)
    diffs = disagreements(model_rows, hand_by_key)

    print(f"scored {len(model_rows)} model labels against {LABELS and os.path.basename(LABELS)}")
    for name, table in (("borderline_counted_as_positive", inclusive), ("borderline_counted_as_negative", conservative)):
        print(f"\n{name}:")
        for k, v in table.items():
            print(f"  {k:18s} {v}")

    print(f"\ndisagreements: {len(diffs)} -- see README.md for the qualitative breakdown (run --disagree for the raw list)")

    if args.disagree:
        for d in diffs:
            print(f"\n- {d['key']} | model={d['model_label']} hand={d['hand_label']} borderline={d['borderline']}")
            print(f"    model: {d['model_reason']}")
            if d["hand_note"]:
                print(f"    hand:  {d['hand_note']}")

    return 1 if (missing or extra) else 0


if __name__ == "__main__":
    raise SystemExit(main())
