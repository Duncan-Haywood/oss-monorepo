"""Milestone 122: the amount-depth guard SWD(8) tested blind from both sides of its threshold on three new shifter families."""
import importlib.util
import json
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "amount_threshold"


def _load(name):
    spec = importlib.util.spec_from_file_location(f"amount_threshold_{name}", EXP / f"{name}.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_designs_are_unseen():
    run = _load("run")
    seen = set()
    for f in EXP.parent.glob("*/results*.jsonl"):
        if f.parent.name == "amount_threshold":
            continue
        for line in f.read_text().splitlines():
            try:
                seen.add(json.loads(line)["design"])
            except (ValueError, KeyError):
                pass
    assert seen and not seen & set(run.NEW)
    assert set(run.ORDER) == set(run.NEW) and len(run.NEW) == 6


def test_depths_straddle_the_threshold():
    f = json.loads((EXP / "features.json").read_text())
    assert all(v["shift_width"] == 128 for v in f.values())
    depth = {d: v["amount_depth"] for d, v in f.items()}
    assert depth == {"chainsh2": 4, "chainsh8": 16, "pcnsh6": 5, "pcnsh24": 23, "tzcsh4": 10, "tzcsh8": 22}
    for fam in ("chainsh", "pcnsh", "tzcsh"):
        ds = sorted((v, d) for d, v in depth.items() if d.startswith(fam))
        assert len(ds) == 2 and (ds[0][0] < 8 <= ds[1][0] or fam == "tzcsh")


def test_guards_flag_what_was_registered():
    a = _load("analyse")
    new = sorted(_load("run").NEW)
    assert [d for d in new if a.flag_d(d)] == ["chainsh2", "pcnsh6"]
    assert [d for d in new if a.flag_dg(d)] == ["chainsh2", "pcnsh24", "pcnsh6"]
    assert not any(a.flag_d(d, 1) for d in new)
    assert all(a.FEAT[d]["shift_width"] >= 64 for d in new)  # SWS(64) flags all six


def test_table_covers_every_cell():
    run = _load("run")
    rs = [json.loads(l) for l in (EXP / "results.jsonl").read_text().splitlines()]
    assert {(r["design"], r["tag"]) for r in rs} == {(d, t) for d in run.NEW for t in run.FACTORS}
    assert len({(r["design"], r["tag"], tuple(r["seq"])) for r in rs}) == len(rs) == 1440


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load("analyse").main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()
