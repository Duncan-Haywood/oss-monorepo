#!/usr/bin/env python3
"""Score the portfolio's own ventures on `ai-first-markets`' six dimensions.

The router (`portfolio/router/allocate.py`) orders ventures by whether a
session can *start* on them. That is a question about testability, not about
whether the business is any good, and nothing in this repository has ever
answered the second question for the ventures the portfolio actually owns.
This file does, using the same six equal-weight dimensions the
`ai-first-markets` venture already applies to its eight hypothetical ideas
(`ventures/ai-first-markets/src/lib/evaluation.ts`), so the two sets of
numbers are comparable.

    python3 portfolio/scoring/score_ventures.py           # merit table
    python3 portfolio/scoring/score_ventures.py --check    # CI: consistency only
    python3 portfolio/scoring/score_ventures.py --json     # machine-readable

`--check` recomputes every derived field, enforces the rubric rules stated in
README.md, and requires the scored set to be exactly the set of ventures that
have a VENTURE.yaml -- so a venture added or removed without a score is a CI
failure rather than a silently missing row.

Depends only on PyYAML, already in portfolio/router/requirements.txt.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
VENTURES_DIR = REPO_ROOT / "ventures"
SCORES_PATH = Path(__file__).with_name("venture-scores.yaml")
IDEAS_PATH = REPO_ROOT / "ventures" / "ai-first-markets" / "src" / "data" / "ideas.ts"

# The six dimensions ai-first-markets scores its ideas on, in its own order.
# Keys are snake_case to match portfolio/pipeline/candidates.yaml; the labels
# are the ones the product renders.
DIMENSIONS = [
    "ai_leverage",
    "autonomous_ops",
    "time_to_revenue",
    "gross_margin",
    "defensibility",
    "distribution",
]

# The pipeline's two extra dimensions are gates on real ventures too, but they
# are recorded as pass/fail rather than scored: folding them into the mean
# would make these numbers incomparable with ai-first-markets' six, which is
# the whole point of scoring this way. See README.md.
GATES = ["liability_containment", "ethical_robustness"]

# README.md: any dimension at or below this needs a named `floor_note`.
FLOOR_NOTE_THRESHOLD = 4


def load_doc(path: Path = SCORES_PATH) -> dict:
    return yaml.safe_load(path.read_text()) or {}


def venture_slugs(ventures_dir: Path = VENTURES_DIR) -> list[str]:
    """Slugs the portfolio allocates profit-seeking effort to, sorted.

    A `NOT-A-VENTURE` marker wins over a `VENTURE.yaml` in the same directory,
    matching portfolio/router/validate.py: the marker is how a directory opts
    out of profit-seeking allocation, so all three tools must agree on it.
    """
    return sorted(
        p.name
        for p in ventures_dir.iterdir()
        if (p / "VENTURE.yaml").is_file() and not (p / "NOT-A-VENTURE").is_file()
    )


def documented_slugs(ventures_dir: Path = VENTURES_DIR) -> list[str]:
    """Slugs of every directory carrying a VENTURE.yaml, marker or not, sorted.

    Superset of `venture_slugs()`. A score is a record *about* a business,
    not an input to allocation, so a directory that opts out of allocation may
    keep its score row: dropping the row would silently destroy the evidence
    the reclassification was decided on, and the inter-rater measurement in
    README.md that spans the full set.
    """
    return sorted(p.name for p in ventures_dir.iterdir() if (p / "VENTURE.yaml").is_file())


def composite(scores: dict) -> float:
    return round(sum(scores[d] for d in DIMENSIONS) / len(DIMENSIONS), 3)


def unscored(doc: dict, slugs: list[str]) -> list[str]:
    """Ventures with a VENTURE.yaml and no score row yet (reported, not failed)."""
    scored = {v.get("slug") for v in doc.get("ventures") or []}
    return sorted(set(slugs) - scored)


def check(doc: dict, slugs: list[str], documented: list[str] | None = None) -> list[str]:
    """Every rubric and coverage rule. Returns a list of problems, empty if clean.

    `slugs` is the allocated set (every one must be scored); `documented` is the
    set that may be scored, defaulting to `slugs` when the caller draws no
    distinction. The two differ only for a directory carrying both a
    VENTURE.yaml and a NOT-A-VENTURE marker.
    """
    if documented is None:
        documented = slugs
    problems: list[str] = []
    ventures = doc.get("ventures") or []
    if not ventures:
        return ["no ventures scored"]

    scored = [v.get("slug") for v in ventures]
    duplicates = sorted({s for s in scored if scored.count(s) > 1})
    if duplicates:
        problems.append(f"scored more than once: {duplicates}")

    # A venture with no score yet is not a defect: about 25 ventures land a
    # day and a score is a judgement, so requiring one per venture kept this
    # check red on main for days (P017/2026-10-16) and invited invented
    # numbers. The router orders unscored ventures without merit. `unscored`
    # reports them; only a row that exists has to be right.
    unknown = sorted(set(scored) - set(documented))
    if unknown:
        problems.append(f"scored but no such venture directory: {unknown}")

    for venture in ventures:
        slug = venture.get("slug", "<no slug>")
        scores = venture.get("scores") or {}

        absent = [d for d in DIMENSIONS if d not in scores]
        if absent:
            problems.append(f"{slug}: missing dimensions {absent}")
            continue
        extra = [d for d in scores if d not in DIMENSIONS]
        if extra:
            problems.append(f"{slug}: unknown dimensions {extra}")

        bad = False
        for dimension in DIMENSIONS:
            value = scores[dimension]
            if not isinstance(value, int) or not 0 <= value <= 10:
                problems.append(
                    f"{slug}: {dimension} is {value!r}, expected an integer 0-10"
                )
                bad = True
        if bad:
            continue

        expected = composite(scores)
        if round(float(venture.get("composite", -1)), 3) != expected:
            problems.append(
                f"{slug}: composite is {venture.get('composite')!r}, "
                f"mean of the six dimensions is {expected}"
            )

        values = [scores[d] for d in DIMENSIONS]
        expected_floor = min(values)
        if venture.get("floor") != expected_floor:
            problems.append(
                f"{slug}: floor is {venture.get('floor')!r}, "
                f"lowest dimension is {expected_floor}"
            )

        floor_dimensions = sorted(d for d in DIMENSIONS if scores[d] == expected_floor)
        declared = venture.get("floor_dimension")
        if declared is not None and declared not in floor_dimensions:
            problems.append(
                f"{slug}: floor_dimension is {declared!r}, but the lowest "
                f"dimension(s) are {floor_dimensions}"
            )
        if declared is None:
            problems.append(f"{slug}: floor_dimension is unset")

        if expected_floor <= FLOOR_NOTE_THRESHOLD and not str(
            venture.get("floor_note") or ""
        ).strip():
            problems.append(
                f"{slug}: floor is {expected_floor} (<= {FLOOR_NOTE_THRESHOLD}) "
                f"and needs a named floor_note"
            )

        if not str(venture.get("basis") or "").strip():
            problems.append(f"{slug}: no basis recorded for these scores")

        gates = venture.get("gates") or {}
        for gate in GATES:
            if gates.get(gate) not in ("pass", "fail"):
                problems.append(
                    f"{slug}: gate {gate} is {gates.get(gate)!r}, expected "
                    f"'pass' or 'fail'"
                )
        rater_b = venture.get("rater_b")
        if rater_b is not None and not isinstance(rater_b, (int, float)):
            problems.append(f"{slug}: rater_b is {rater_b!r}, expected a number")

        if "fail" in gates.values() and not str(venture.get("gate_note") or "").strip():
            problems.append(
                f"{slug}: a gate is failed and needs a named gate_note saying why"
            )

    return problems


def merit_ranking(doc: dict) -> list[dict]:
    """Ventures ordered by composite, highest first. Ties break by slug."""
    ventures = doc.get("ventures") or []
    return sorted(
        ventures, key=lambda v: (-composite(v["scores"]), v["slug"])
    )


def dispatchable_slugs() -> set[str]:
    """Ask the router itself which ventures a session could start on today.

    Imported rather than reimplemented: if the router's definition of
    dispatchable changes, this agreement test must move with it, not drift
    from it.
    """
    sys.path.insert(0, str(REPO_ROOT / "portfolio" / "router"))
    import allocate  # noqa: PLC0415

    return {v.name for v in allocate.load_ventures() if v.dispatchable}


def agreement(
    ranking: list[dict], dispatchable: set[str], allocated: set[str] | None = None
) -> dict:
    """Test the ai-first-markets hypothesis that merit ranking tracks the split.

    The claim on file is that scoring the real ventures on these six
    dimensions "ranks them consistently with the router's
    dispatchable-vs-blocked split". The falsifiable reading: the dispatchable
    ventures should occupy the top slots of the merit ranking. If they do
    not, the two orderings are measuring different things and the router
    cannot be replaced by a merit score (nor the reverse).
    """
    order = [v["slug"] for v in ranking]
    if allocated is not None:
        order = [slug for slug in order if slug in allocated]
    ranks = {slug: i + 1 for i, slug in enumerate(order)}
    n_dispatchable = len(dispatchable)
    top_slots = set(order[:n_dispatchable])
    dispatchable_ranks = sorted(ranks[s] for s in dispatchable if s in ranks)

    def mean(slugs: set[str]) -> float | None:
        picked = [composite(v["scores"]) for v in ranking if v["slug"] in slugs]
        return round(sum(picked) / len(picked), 3) if picked else None

    blocked = set(order) - dispatchable
    return {
        "ranked": order,
        "dispatchable": sorted(dispatchable),
        "dispatchable_merit_ranks": dispatchable_ranks,
        "occupies_top_slots": bool(dispatchable) and top_slots == dispatchable,
        "mean_composite_dispatchable": mean(dispatchable),
        "mean_composite_blocked": mean(blocked),
    }


def anchor_dimension_means(ideas_path: Path = IDEAS_PATH) -> list[list[int]] | None:
    """The eight ai-first-markets ideas' raw dimension scores, or None.

    Read out of `ideas.ts` at runtime rather than copied into this directory,
    so the comparison in README.md can be re-derived instead of trusted. The
    product is TypeScript and this is a regex, so extraction is best-effort:
    on any format change it returns None and the comparison is reported as
    unavailable rather than silently wrong. Deliberately not part of
    `--check` -- CI must not fail because someone reformatted a data file.
    """
    if not ideas_path.is_file():
        return None
    matches = re.findall(
        r"dimensions:\s*baseDimensions\(\s*\[([0-9,\s]+)\]", ideas_path.read_text()
    )
    rows = []
    for match in matches:
        values = [int(v) for v in match.replace("\n", "").split(",") if v.strip()]
        if len(values) != len(DIMENSIONS):
            return None
        rows.append(values)
    return rows or None


def rater_agreement(doc: dict) -> dict | None:
    """How closely the second rater's composites match this file's.

    Two scheduled sessions scored the same eleven ventures from the same
    repository evidence on the same day without seeing each other's work
    (see `second_rater` in venture-scores.yaml). That is an inter-rater
    reliability measurement nobody designed and it costs nothing to read, so
    it is reported rather than reconciled away. Returns None if no venture
    carries a `rater_b`.
    """
    paired = [
        (v["slug"], composite(v["scores"]), float(v["rater_b"]))
        for v in doc.get("ventures") or []
        if v.get("rater_b") is not None
    ]
    if not paired:
        return None
    deltas = [abs(a - b) for _, a, b in paired]
    by_a = [s for s, _, _ in sorted(paired, key=lambda p: (-p[1], p[0]))]
    by_b = [s for s, _, _ in sorted(paired, key=lambda p: (-p[2], p[0]))]
    return {
        "n": len(paired),
        "max_abs_delta": round(max(deltas), 3),
        "mean_abs_delta": round(sum(deltas) / len(deltas), 3),
        "same_top": by_a[0] == by_b[0],
        "same_bottom": by_a[-1] == by_b[-1],
    }


def print_comparison(doc: dict) -> None:
    anchor = anchor_dimension_means()
    print("\nAgainst the anchor — the 8 hypothetical ideas ai-first-markets scores")
    print("on this same scale. A pitch minus a position, per dimension:\n")
    if anchor is None:
        print(f"  (unavailable: could not read dimension scores from {IDEAS_PATH})")
        return
    ventures = doc["ventures"]
    print(f"{'dimension':<20}{'ideas':>7}{'ventures':>10}{'delta':>8}")
    for i, dimension in enumerate(DIMENSIONS):
        idea_mean = sum(row[i] for row in anchor) / len(anchor)
        venture_mean = sum(v["scores"][dimension] for v in ventures) / len(ventures)
        print(
            f"{dimension:<20}{idea_mean:>7.2f}{venture_mean:>10.2f}"
            f"{venture_mean - idea_mean:>8.2f}"
        )
    idea_composite = sum(sum(row) / len(row) for row in anchor) / len(anchor)
    venture_composite = sum(composite(v["scores"]) for v in ventures) / len(ventures)
    print(
        f"{'COMPOSITE':<20}{idea_composite:>7.2f}{venture_composite:>10.2f}"
        f"{venture_composite - idea_composite:>8.2f}"
    )


def print_table(doc: dict, ranking: list[dict], result: dict) -> None:
    dispatchable = set(result["dispatchable"])
    allocated = set(result["ranked"])
    print(f"Venture merit scores, {doc.get('scored', 'undated')} "
          f"({doc.get('scored_by', 'unknown')}) — "
          f"six equal-weight dimensions, 0-10 each\n")
    header = f"{'#':<3}{'venture':<32}{'comp':>6}{'floor':>7}  {'router':<14}gates"
    print(header)
    for i, venture in enumerate(ranking, 1):
        slug = venture["slug"]
        gates = venture.get("gates") or {}
        gate_text = ", ".join(
            f"{g.split('_')[0]}:{gates.get(g, '?')}" for g in GATES
        )
        if slug not in allocated:
            state = "reclassified"
        elif slug in dispatchable:
            state = "dispatchable"
        else:
            state = "blocked"
        print(
            f"{i:<3}{slug:<32}{composite(venture['scores']):>6.2f}"
            f"{venture['floor']:>7}  {state:<14}{gate_text}"
        )

    print()
    ranks = result["dispatchable_merit_ranks"]
    print(
        f"Dispatchable ventures sit at merit rank(s) {ranks} of {len(allocated)}; "
        f"the top {len(ranks)} slot(s) "
        f"{'are' if result['occupies_top_slots'] else 'are not'} exactly the "
        f"dispatchable set."
    )
    print(
        f"Mean composite — dispatchable {result['mean_composite_dispatchable']}, "
        f"blocked {result['mean_composite_blocked']}."
    )
    verdict = (
        "consistent: merit ranking and the router's split agree"
        if result["occupies_top_slots"]
        else "not consistent: the orderings measure different things "
        "(see README.md — dispatchability is testability, not merit)"
    )
    print(f"Hypothesis: {verdict}.")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="validate derived fields and coverage only; exit non-zero on problems",
    )
    parser.add_argument("--json", action="store_true", help="emit JSON")
    args = parser.parse_args(argv)

    doc = load_doc()
    allocated = venture_slugs()
    problems = check(doc, allocated, documented_slugs())
    if problems:
        print(f"{len(problems)} problem(s) in {SCORES_PATH.name}:", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1
    if args.check:
        waiting = unscored(doc, allocated)
        print(
            f"All {len(doc['ventures'])} venture scores in {SCORES_PATH.name} are "
            f"internally consistent; {len(waiting)} venture(s) have no score yet."
        )
        return 0

    ranking = merit_ranking(doc)
    result = agreement(ranking, dispatchable_slugs(), set(allocated))
    if args.json:
        print(
            json.dumps(
                {
                    # PyYAML parses an unquoted ISO date into datetime.date,
                    # which json.dumps cannot encode.
                    "scored": str(doc.get("scored")),
                    "ranking": [
                        {
                            "slug": v["slug"],
                            "composite": composite(v["scores"]),
                            "floor": v["floor"],
                            "floor_dimension": v["floor_dimension"],
                        }
                        for v in ranking
                    ],
                    "agreement": result,
                },
                indent=2,
            )
        )
    else:
        print_table(doc, ranking, result)
        print_comparison(doc)
        rater = rater_agreement(doc)
        if rater:
            print(
                f"\nIndependent second rater ({rater['n']} ventures, see "
                f"`second_rater`): largest composite disagreement "
                f"{rater['max_abs_delta']}, mean {rater['mean_abs_delta']}; "
                f"top pick {'agrees' if rater['same_top'] else 'differs'}, "
                f"bottom pick {'agrees' if rater['same_bottom'] else 'differs'}."
            )
    return 0


if __name__ == "__main__":
    sys.exit(main())
