"""The committed results of experiments/theory/pilot_cert_regret.py are well formed and say a certificate lowers mean regret."""
from pathlib import Path

RES = Path(__file__).resolve().parents[1] / "experiments" / "theory" / "pilot_cert_regret_results.txt"


def test_rows():
    rows = [l.split(" | ") for l in RES.read_text().splitlines()[1:]]
    assert [r[0] for r in rows] == ["8", "16", "24"]
    for r in rows:
        assert float(r[4]) > float(r[5])   # P(regret 0 | certified) > P(regret 0 | not)
        assert float(r[6]) < float(r[7])   # mean regret certified < not certified
