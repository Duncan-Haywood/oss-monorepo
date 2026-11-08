"""The ceiling min y over certified pilot points holds under any tie-break (milestone 97)."""
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "experiments" / "theory"))
from verified_dse import bound  # noqa: E402
from pilot_rho import ratio  # noqa: E402

RES = ROOT / "experiments" / "theory" / "pilot_cert_anypoint_results.txt"


def test_random_instances_with_ties():
    rng = random.Random(11)
    for _ in range(300):
        n = rng.randint(6, 30)
        s = {g: [rng.randint(0, 4) for _ in range(n)] for g in ("a", "b")}
        y = [rng.random() + 0.1 for _ in range(n)]
        kp = [max(1, n // 3), max(1, n // 9)]
        pts = rng.sample(range(n), min(n, 6))
        cert = [i for i in pts if ratio(s, ("a", "b"), kp, i, n) < 1]
        if cert:
            c = min(y[i] for i in cert)
            for _ in range(10):
                assert bound.halve([s["a"], s["b"]], y, kp, rng) <= c + 1e-12


def test_committed_results():
    rows = [l.split(" | ") for l in RES.read_text().splitlines()[1:]]
    assert [r[0] for r in rows] == ["8", "16", "24"]
    assert all(int(r[4]) == 0 for r in rows)
