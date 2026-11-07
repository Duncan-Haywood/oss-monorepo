import json, os, sys, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import summarise_paired as sp


def _cell(rel, lo, hi, boosted=2.0):
    return dict(boosted=boosted, rel=rel, lo=lo, hi=hi)


def test_counts_and_percentages(monkeypatch):
    d = tempfile.mkdtemp()
    for city, tgt in sp.PAIRS:
        cells = {"0.1": _cell(0.01, 0.002, 0.02), "0.5": _cell(-0.02, -0.04, -0.01), "0.9": _cell(0.0, -0.02, 0.02)}
        json.dump(dict(seeds=3, cells=cells), open(os.path.join(d, f"paired_{city}_{tgt}_2022.json"), "w"))
    monkeypatch.setattr(sp, "RES", d)
    txt = sp.summarise(2022, "2026-11-07")
    assert "15 cells: interval includes 0 in 5, neural significantly worse in 5, significantly better in 5" in txt
    assert "+1.00% (95% +0.10 to +1.00)  *" in txt   # lo/boosted = 0.002/2 = 0.1%, hi 0.02/2 = 1%
