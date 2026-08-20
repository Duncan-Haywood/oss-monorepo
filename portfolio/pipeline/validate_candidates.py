#!/usr/bin/env python3
"""Check candidates.yaml against the rubric rules stated in README.md.

Five sessions in a row deferred applying measured score changes to
candidates.yaml, and one reason each of them gave was not wanting to be the
one to get the arithmetic wrong while another edit was open against the same
lines. This script removes that excuse: it recomputes every derived field and
enforces the three rubric rules, so a score edit is a one-line change plus a
run of this file.

    python3 portfolio/pipeline/validate_candidates.py

Exits non-zero and prints every problem it found. No dependencies beyond
PyYAML (already in portfolio/router/requirements.txt).
"""

from __future__ import annotations

import sys
from pathlib import Path

import yaml

DIMENSIONS = [
    "ai_leverage",
    "autonomous_ops",
    "time_to_revenue",
    "gross_margin",
    "defensibility",
    "distribution",
    "liability_containment",
    "ethical_robustness",
]

# README.md: "Ethics and liability are gates, not weights. A candidate scoring
# below 5 on either is rejected regardless of composite."
GATE_DIMENSIONS = ["liability_containment", "ethical_robustness"]
GATE_MINIMUM = 5

# README.md: "Any dimension at 4 or below needs a named mitigation before
# graduation."
MITIGATION_THRESHOLD = 4


def check(path: Path) -> list[str]:
    doc = yaml.safe_load(path.read_text())
    problems: list[str] = []
    candidates = doc.get("candidates") or []
    if not candidates:
        return [f"{path}: no candidates found"]

    for candidate in candidates:
        slug = candidate.get("slug", "<no slug>")
        scores = candidate.get("scores") or {}

        missing = [d for d in DIMENSIONS if d not in scores]
        if missing:
            problems.append(f"{slug}: missing dimensions {missing}")
            continue
        extra = [d for d in scores if d not in DIMENSIONS]
        if extra:
            problems.append(f"{slug}: unknown dimensions {extra}")

        for dimension in DIMENSIONS:
            value = scores[dimension]
            if not isinstance(value, int) or not 0 <= value <= 10:
                problems.append(
                    f"{slug}: {dimension} is {value!r}, expected an integer 0-10"
                )

        values = [scores[d] for d in DIMENSIONS]
        expected_composite = round(sum(values) / len(values), 3)
        if round(float(candidate.get("composite", -1)), 3) != expected_composite:
            problems.append(
                f"{slug}: composite is {candidate.get('composite')!r}, "
                f"mean of the eight dimensions is {expected_composite}"
            )

        expected_floor = min(values)
        if candidate.get("floor") != expected_floor:
            problems.append(
                f"{slug}: floor is {candidate.get('floor')!r}, "
                f"lowest dimension is {expected_floor}"
            )

        floor_dimensions = sorted(d for d in DIMENSIONS if scores[d] == expected_floor)
        declared = candidate.get("floor_dimension")
        if declared is not None and declared not in floor_dimensions:
            problems.append(
                f"{slug}: floor_dimension is {declared!r}, but the lowest "
                f"dimension(s) are {floor_dimensions}"
            )
        if declared is None and len(floor_dimensions) == 1:
            problems.append(
                f"{slug}: floor_dimension is unset; it is {floor_dimensions[0]}"
            )

        verdict = str(candidate.get("verdict") or "")
        rejected = verdict.startswith("reject")

        for dimension in GATE_DIMENSIONS:
            if scores[dimension] < GATE_MINIMUM and not rejected:
                problems.append(
                    f"{slug}: {dimension} is {scores[dimension]} (< {GATE_MINIMUM}) "
                    f"but verdict is {verdict!r} — the gate rejects regardless "
                    f"of composite"
                )

        if expected_floor <= MITIGATION_THRESHOLD and not rejected:
            mitigation = candidate.get("mitigation")
            if not mitigation or not str(mitigation).strip():
                problems.append(
                    f"{slug}: floor is {expected_floor} (<= {MITIGATION_THRESHOLD}) "
                    f"and needs a named mitigation before graduation"
                )

        doc_path = candidate.get("doc")
        if doc_path and not (path.parent / doc_path).exists():
            problems.append(f"{slug}: doc {doc_path} does not exist")

    return problems


def main() -> int:
    path = Path(__file__).with_name("candidates.yaml")
    problems = check(path)
    if problems:
        print(f"{len(problems)} problem(s) in {path}:")
        for problem in problems:
            print(f"  - {problem}")
        return 1
    doc = yaml.safe_load(path.read_text())
    count = len(doc["candidates"])
    print(f"All {count} candidates in {path.name} are internally consistent.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
