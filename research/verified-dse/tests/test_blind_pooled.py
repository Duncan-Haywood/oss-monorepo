"""Milestone 136: every rule on the 42 pooled blind cells, each scored on the cells that were out of sample for it."""
import importlib.util
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "blind_pooled"


def _load():
    spec = importlib.util.spec_from_file_location("blind_pooled_analyse", EXP / "analyse.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_registry_is_as_fixed():
    a = _load()
    reg = {n: sets for n, _f, sets in a.REGISTRY}
    assert reg["SWC"] == reg["SWG(32)"] == ("m125", "m132", "m133")
    assert reg["SWP(32)"] == reg["SWGP(32)"] == ("m132", "m133")
    assert reg["SWPF(32)"] == ("m133",) and reg["SWX(3,0.02)"] == ()


def test_holm_matches_hand_case():
    a = _load()
    assert [round(x, 9) for x in a.holm([0.01, 0.04, 0.03])] == [0.03, 0.06, 0.06]
    assert a.holm([0.5, 0.9]) == [1.0, 1.0]


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load().main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()


def test_outcome_as_logged():
    t = (EXP / "results.txt").read_text()
    assert "design level (21 designs, mean over each design's cells): SWC better on 13, worse on 5, tied on 3; sign p = 0.0963" in t
    assert "perfect guard: 1.99 points below SWC on the 42 cells" in t
