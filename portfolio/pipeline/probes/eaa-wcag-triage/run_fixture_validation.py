"""Regenerate ``validation-<date>.json`` from the fixture set.

Run the engine over every fixture page, compare against the hand labels in
``fixtures/labels.json``, and write per-page and aggregate precision/recall.
The date is passed in so the output is reproducible (no clock read):

    python3 run_fixture_validation.py 2026-08-20
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from wcag_triage.engine import audit_html  # noqa: E402

HERE = Path(__file__).resolve().parent
FIXTURES = HERE / "fixtures"


def main(date: str) -> None:
    labels = {
        k: v
        for k, v in json.loads((FIXTURES / "labels.json").read_text()).items()
        if not k.startswith("_")
    }
    pages = []
    agg_tp = agg_fp = agg_fn = 0
    for page, entries in labels.items():
        expected = Counter((c, i) for c, i in entries)
        actual = Counter(
            (f.criterion, f.impact) for f in audit_html((FIXTURES / page).read_text()).findings
        )
        tp = sum((expected & actual).values())
        fp = sum((actual - expected).values())
        fn = sum((expected - actual).values())
        agg_tp += tp
        agg_fp += fp
        agg_fn += fn
        pages.append(
            {
                "page": page,
                "expected": sum(expected.values()),
                "reported": sum(actual.values()),
                "true_positives": tp,
                "false_positives": fp,
                "false_negatives": fn,
            }
        )
    out = {
        "generated": date,
        "note": (
            "Validation against a hand-labeled fixture set in this repo, not "
            "against real shop pages. A perfect score here is a regression "
            "guard on the rules, not evidence about production sites."
        ),
        "aggregate": {
            "true_positives": agg_tp,
            "false_positives": agg_fp,
            "false_negatives": agg_fn,
            "precision": None if agg_tp + agg_fp == 0 else round(agg_tp / (agg_tp + agg_fp), 4),
            "recall": None if agg_tp + agg_fn == 0 else round(agg_tp / (agg_tp + agg_fn), 4),
        },
        "pages": pages,
    }
    dest = HERE / f"validation-{date}.json"
    dest.write_text(json.dumps(out, indent=2) + "\n")
    print(f"wrote {dest.name}: precision={out['aggregate']['precision']} recall={out['aggregate']['recall']}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "unknown")
