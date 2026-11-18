"""T<1 on a point means it survives every halving cut under any tie-break, so halving returns y <= y(p) (milestone 96)."""
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "experiments" / "theory"))
from verified_dse import bound  # noqa: E402
from pilot_rho import ratio  # noqa: E402

RES = ROOT / "experiments" / "theory" / "pilot_cert_guarantee_results.txt"


def test_random_instances_with_ties():
    rng = random.Random(7)
    for _ in range(300):
        n = rng.randint(6, 30)
        s = {g: [rng.randint(0, 4) for _ in range(n)] for g in ("a", "b")}   # many ties
        y = [rng.random() + 0.1 for _ in range(n)]
        kp = [max(1, n // 3), max(1, n // 9)]
        for p in range(n):
            if ratio(s, ("a", "b"), kp, p, n) < 1:
                for _ in range(10):
                    assert bound.halve([s["a"], s["b"]], y, kp, rng) <= y[p] + 1e-12


def test_committed_results():
    rows = [l.split(" | ") for l in RES.read_text().splitlines()[1:]]
    assert [r[0] for r in rows] == ["8", "16", "24"]
    assert all(int(r[3]) == 0 for r in rows)
