"""Skip-r1 schedule at smaller pools (milestone 107)."""
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "theory"


def test_poolsize_summary():
    t = (EXP / "pilot_cert_sched_poolsize_results.txt").read_text()
    assert "20 | 0.45 | 0.73 | 3.39 | 6" in t
    assert "(1) skip-r1 minus 105-style <= 0.3 at every N: True" in t
    assert "(2) skip-r1 regret N=20 above N=40: False" in t
    assert "(3) skip-r1 beats random 8 at every N: True" in t
