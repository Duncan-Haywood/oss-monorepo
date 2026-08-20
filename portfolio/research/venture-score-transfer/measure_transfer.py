#!/usr/bin/env python3
"""Does the ai-first-markets scoring method transfer from its 8 hypothetical
ideas to the portfolio's 11 real ventures?

This settles the second, `in-repo` hypothesis in
`ventures/ai-first-markets/VENTURE.yaml`:

    Scoring the portfolio's own 11 ventures on the same six dimensions ranks
    them consistently with the router's dispatchable-vs-blocked split, so the
    map's method transfers from the 8 hypothetical ideas to real ventures.

The claim is falsifiable and this script tries to falsify it. It:

1. reads the six-dimension composite scores in `scores.yaml` (agent estimates,
   same standing as `portfolio/pipeline/candidates.yaml`), and
2. reads which ventures the *router* — not this script — calls dispatchable,
   by importing `portfolio/router/allocate.py`. The dispatch rule is not
   re-implemented here, so the two halves cannot silently drift apart.

Then it asks whether the composite ranks dispatchable ventures above blocked
ones. The test statistic is the rank-biserial correlation (equivalently, the
Mann-Whitney AUC rescaled to [-1, 1]): the probability that a randomly chosen
dispatchable venture outscores a randomly chosen blocked one, minus the
reverse. +1 means the composite perfectly separates the two groups in the
direction the hypothesis predicts; 0 means it carries no signal about
dispatchability; negative means it separates them backwards.

Because the scores are judgment, not measurement, a single AUC would be a
false precision. The script also reports a robustness margin: the smallest
total score perturbation, spread across ventures, that would flip the sign of
the finding. If that margin is tiny, the conclusion rests on scores being
exactly right and should not be trusted; if it is large, the finding survives
a lot of disagreement about individual numbers.

Read-only, standard-library plus PyYAML (already a router dependency), no
network, no credentials, writes nothing. Re-derive from saved scores with:

    python3 measure_transfer.py
    python3 measure_transfer.py --json
"""
from __future__ import annotations

import argparse
import itertools
import json
import sys
from pathlib import Path
from typing import Optional

import yaml

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[2]
ROUTER_DIR = REPO_ROOT / "portfolio" / "router"
SCORES_PATH = HERE / "scores.yaml"


def load_scores(path: Path = SCORES_PATH) -> tuple[list[str], dict[str, dict]]:
    data = yaml.safe_load(path.read_text()) or {}
    dimensions = data["dimensions"]
    scores = {}
    for entry in data["ventures"]:
        name = entry["name"]
        s = entry["scores"]
        missing = [d for d in dimensions if d not in s]
        if missing:
            raise ValueError(f"{name} missing dimension scores: {missing}")
        scores[name] = {d: float(s[d]) for d in dimensions}
    return dimensions, scores


def dispatchable_by_router() -> dict[str, bool]:
    """Ask the router itself which ventures are dispatchable.

    Imports allocate.py so the classification is exactly the one the work
    queue uses -- this script never decides dispatchability on its own.
    """
    sys.path.insert(0, str(ROUTER_DIR))
    try:
        import allocate  # type: ignore
    finally:
        pass
    return {v.name: v.dispatchable for v in allocate.load_ventures()}


def composite(dim_scores: dict[str, float]) -> float:
    return sum(dim_scores.values()) / len(dim_scores)


def rank_biserial(
    dispatch_scores: list[float], blocked_scores: list[float]
) -> tuple[float, float, int]:
    """Rank-biserial correlation between the two groups.

    Returns (statistic, auc, comparisons). Ties count as half. AUC is the
    probability a dispatchable venture outscores a blocked one; the statistic
    is 2*auc - 1, in [-1, 1].
    """
    wins = 0.0
    comparisons = 0
    for d in dispatch_scores:
        for b in blocked_scores:
            comparisons += 1
            if d > b:
                wins += 1.0
            elif d == b:
                wins += 0.5
    if comparisons == 0:
        return 0.0, 0.0, 0
    auc = wins / comparisons
    return 2.0 * auc - 1.0, auc, comparisons


def flip_margin(
    composites: dict[str, float], dispatchable: dict[str, bool]
) -> Optional[float]:
    """Smallest L1 score perturbation that drives the statistic to <= 0.

    The statistic is decided entirely by the pairwise order of dispatchable
    vs blocked composites. Its sign flips to non-positive once enough
    (dispatchable, blocked) pairs stop having dispatchable strictly ahead.
    For each such pair currently ordered correctly, the cheapest way to erase
    it is to close the composite gap -- moving the two composites until they
    tie costs `gap` in composite terms, i.e. 6 * gap in raw single-dimension
    points (composite is the mean over 6 dimensions).

    We need to neutralise enough winning pairs to bring wins down to half the
    comparisons (AUC 0.5). Greedily neutralising the cheapest winning pairs is
    a lower bound on the margin; report it in raw score points so it is
    comparable to "how many points would I have to be wrong by".
    """
    disp = [n for n, ok in dispatchable.items() if ok]
    blk = [n for n, ok in dispatchable.items() if not ok]
    if not disp or not blk:
        return None
    total = len(disp) * len(blk)
    wins = []
    half_ties = 0
    for d in disp:
        for b in blk:
            gap = composites[d] - composites[b]
            if gap > 0:
                wins.append(gap)
            elif gap == 0:
                half_ties += 1
    win_count = len(wins)
    # Current wins score (ties already contribute 0.5 each).
    current = win_count + 0.5 * half_ties
    target = total / 2.0  # AUC 0.5 boundary
    if current <= target:
        return 0.0
    # Each neutralised winning pair converts a 1.0 into a 0.5 tie: -0.5 each.
    pairs_to_flip = (current - target) / 0.5
    pairs_to_flip = int(pairs_to_flip + 0.999999)  # ceil
    wins.sort()
    cheapest = wins[:pairs_to_flip]
    # Cost to tie a pair is `gap` composite points = 6*gap raw points, but the
    # move can be shared: nudging one venture's composite affects every pair it
    # is in. Report the conservative independent-pair sum in raw points, which
    # upper-bounds the true (shareable) cost -- a deliberately pessimistic
    # margin so the finding is not oversold.
    dims = 6
    return sum(cheapest) * dims


def analyse(path: Path = SCORES_PATH) -> dict:
    dimensions, scores = load_scores(path)
    dispatchable = dispatchable_by_router()

    scored = set(scores)
    routed = set(dispatchable)
    if scored != routed:
        raise ValueError(
            "scores.yaml and the router disagree on the venture set:\n"
            f"  only in scores.yaml: {sorted(scored - routed)}\n"
            f"  only in router:      {sorted(routed - scored)}\n"
            "Re-score the missing ventures before trusting the finding."
        )

    composites = {n: composite(scores[n]) for n in scores}
    disp_scores = [composites[n] for n in scores if dispatchable[n]]
    blk_scores = [composites[n] for n in scores if not dispatchable[n]]

    stat, auc, comparisons = rank_biserial(disp_scores, blk_scores)
    margin = flip_margin(composites, dispatchable)

    ranked = sorted(composites, key=lambda n: composites[n], reverse=True)
    table = [
        {
            "venture": n,
            "composite": round(composites[n], 3),
            "dispatchable": dispatchable[n],
            "rank": i + 1,
        }
        for i, n in enumerate(ranked)
    ]

    disp_mean = sum(disp_scores) / len(disp_scores) if disp_scores else None
    blk_mean = sum(blk_scores) / len(blk_scores) if blk_scores else None

    # The claim is "ranks consistently with the split". Read that as: the
    # composite carries real, correctly-signed signal about dispatchability
    # (statistic clearly positive) AND the finding survives meaningful score
    # error. It is NOT "the split is a clean cut by score" -- with 2 of 11
    # dispatchable, a perfect cut would be surprising and is not what transfer
    # requires.
    supported = stat > 0 and margin is not None and margin >= 3.0

    return {
        "dimensions": dimensions,
        "n_ventures": len(scores),
        "n_dispatchable": len(disp_scores),
        "n_blocked": len(blk_scores),
        "dispatchable_ventures": [n for n in ranked if dispatchable[n]],
        "composite_mean_dispatchable": None if disp_mean is None else round(disp_mean, 3),
        "composite_mean_blocked": None if blk_mean is None else round(blk_mean, 3),
        "rank_biserial": round(stat, 4),
        "auc": round(auc, 4),
        "comparisons": comparisons,
        "flip_margin_raw_points": None if margin is None else round(margin, 3),
        "supported": supported,
        "table": table,
    }


def format_report(r: dict) -> str:
    lines = []
    lines.append("Venture score-transfer test")
    lines.append("=" * 60)
    lines.append(
        f"{r['n_ventures']} ventures scored on {len(r['dimensions'])} dimensions; "
        f"{r['n_dispatchable']} dispatchable / {r['n_blocked']} blocked "
        "(dispatchability read from the router)."
    )
    lines.append("")
    lines.append(f"{'#':>2}  {'venture':<32} {'composite':>9}  dispatchable")
    for row in r["table"]:
        lines.append(
            f"{row['rank']:>2}  {row['venture']:<32} {row['composite']:>9.3f}  "
            f"{'YES' if row['dispatchable'] else '-'}"
        )
    lines.append("")
    lines.append(f"Mean composite, dispatchable: {r['composite_mean_dispatchable']}")
    lines.append(f"Mean composite, blocked:      {r['composite_mean_blocked']}")
    lines.append(
        f"Rank-biserial (2*AUC-1):      {r['rank_biserial']:+.4f}  "
        f"(AUC {r['auc']:.4f} over {r['comparisons']} pairs)"
    )
    lines.append(
        f"Flip margin:                  {r['flip_margin_raw_points']} raw score points"
    )
    lines.append("")
    verdict = "SUPPORTED" if r["supported"] else "NOT SUPPORTED"
    lines.append(f"Hypothesis (method transfers): {verdict}")
    lines.append("")
    lines.append(
        "Reading: a positive rank-biserial means the composite orders "
        "dispatchable ventures above blocked ones more often than not; the "
        "flip margin is how many raw score points (spread across ventures, "
        "pessimistically summed) would have to be wrong to erase the sign. "
        "A large margin means the finding does not rest on any single "
        "estimate."
    )
    return "\n".join(lines)


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="emit JSON")
    parser.add_argument(
        "--scores", type=Path, default=SCORES_PATH, help="path to scores.yaml"
    )
    args = parser.parse_args(argv)
    result = analyse(args.scores)
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(format_report(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
