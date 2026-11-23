"""Milestone 163: per-point naming draws (the draw rule, the helpers, and the committed results)."""
import importlib.util
import json
import statistics
from pathlib import Path

ND = Path(__file__).resolve().parents[1] / "experiments" / "naming_draws"


def _load():
    spec = importlib.util.spec_from_file_location("vdse_t163", ND / "run.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _T():
    rows = lambda tag, st: [{"design": "x", "seq": [str(j)], "status": s, "tag": tag}  # noqa: E731
                            for j, s in enumerate(st)]
    return {"Y": rows("Y", ["ok", "ok", "fail"]), "C": rows("C", ["ok", "fail", "fail"]),
            "R": rows("R", ["ok", "fail", "fail"])}


def test_mix_takes_only_ok_namings_and_is_deterministic():
    m = _load()
    T = _T()
    a, b = m.mix(T, 3), m.mix(T, 3)
    assert [r["tag"] for r in a] == [r["tag"] for r in b]
    for k in range(50):
        out = m.mix(T, k)
        assert out[1]["tag"] == "Y"  # the only ok naming
        assert out[2]["tag"] == "Y" and out[2]["status"] == "fail"  # failed everywhere stays build B's failure
    assert {m.mix(T, k)[0]["tag"] for k in range(50)} == {"Y", "C", "R"}


def test_need_k_and_spearman():
    m = _load()
    assert m.need_k(-10.0, 1.0) == 1
    assert m.need_k(-1.0, 1.0) == 4  # (1.96)^2 = 3.84
    assert m.need_k(0.0, 1.0) == float("inf")
    assert abs(m.spearman([1, 2, 3, 4], [10, 20, 30, 40]) - 1) < 1e-12
    assert abs(m.spearman([1, 2, 3, 4], [4, 3, 2, 1]) + 1) < 1e-12


def test_committed_draws_match_results():
    got = json.loads((ND / "draws.json").read_text())
    draws, fixed = got["draws"], got["fixed"]
    assert len(draws) == 200 and all(len(d) == 27 for d in draws)
    sd = sorted(statistics.stdev([d[x] for d in draws]) for x in fixed["A3"])
    assert abs(statistics.median(sd) - 1.02) < 0.005
    means = [statistics.mean(d.values()) for d in draws]
    assert max(means) < -2 and statistics.stdev(means) < 0.5
    assert abs(statistics.mean(fixed["A3"].values()) + 4.37) < 0.005  # milestone 162b's primary
    txt = (ND / "results.txt").read_text()
    assert txt.count(": held") == 5 and txt.count(": refuted") == 1
    sgn = lambda v: (v > 0) - (v < 0)  # noqa: E731
    flip = {x: sum(sgn(d[x]) != sgn(fixed["A3"][x]) for d in draws) / 200 for x in fixed["A3"]}
    assert all(flip[x] <= 0.05 for x in fixed["A3"] if abs(fixed["A3"][x]) > 2.08)
    assert all(flip[x] == 0 for x in fixed["A3"] if abs(fixed["A3"][x]) > 3.0)
    assert sorted(x for x in flip if flip[x] > 0.2) == ["dot6r", "gtc12r"]
