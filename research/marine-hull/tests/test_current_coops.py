import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from run_current_coops import load  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "experiments" / "data" / "coops_currents.csv"


def test_percentiles_are_monotone_and_complete():
    st = load(str(DATA))
    assert len(st) >= 60
    for _, v in st:
        assert len(v) == 21
        assert all(a <= b for a, b in zip(v, v[1:]))
        assert v[0] >= 0
