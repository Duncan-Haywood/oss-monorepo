"""Lemma behind milestone 90: at most k_last candidates have rank-displacement ratio below 1, so a pilot certificate
T < 1 can be false only if the pilot hits that set (random instances, ties included)."""
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "experiments" / "theory"))
from pilot_rho import ratio  # noqa: E402


def test_few_candidates_have_ratio_below_one():
    rng = random.Random(7)
    for _ in range(300):
        n = rng.randint(6, 60)
        ties = rng.choice([2, 5, n])
        s = {g: [rng.randrange(ties) for _ in range(n)] for g in ("r1", "r2", "r3")}
        keep = [max(1, n // 3), max(1, n // 9), max(1, n // 27)]
        for rungs, kp in ((("r1", "r2", "r3"), keep), (("r2", "r3"), keep[:2])):
            G = [i for i in range(n) if ratio(s, rungs, kp, i, n) < 1]
            assert len(G) <= kp[-1]
