"""Milestone 121: a guard on where a shifter's amount comes from (pins or logic), tested blind on three new shifter families."""
import importlib.util
import json
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "amount_depth"


def _load(name):
    spec = importlib.util.spec_from_file_location(f"amount_depth_{name}", EXP / f"{name}.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_designs_are_unseen():
    run = _load("run")
    seen = set()
    for f in EXP.parent.glob("*/results*.jsonl"):
        if f.parent.name == "amount_depth":
            continue
        for line in f.read_text().splitlines():
            try:
                seen.add(json.loads(line)["design"])
            except (ValueError, KeyError):
                pass
    assert seen and not seen & set(run.NEW)
    assert set(run.ORDER) == set(run.NEW) and len(run.NEW) == 6


def test_amount_depth_separates_pins_from_logic():
    f = json.loads((EXP / "features.json").read_text())
    for d in ("barrel64", "barrel256", "funnel128", "rotmask128", "alignsh128", "addsh64", "fpalign64", "pcsh64", "lzcnorm128"):
        assert f[d]["shift_width"] >= 64
    assert all(f[d]["amount_depth"] == 0 for d in ("barrel64", "barrel256", "funnel128", "rotmask128", "alignsh128"))
    assert f["addsh64"]["amount_depth"] == 1 and f["fpalign128"]["amount_depth"] == 2
    assert f["pcsh128"]["amount_depth"] > 100 and f["lzcnorm64"]["amount_depth"] > 100
    assert f["muxshl128"]["amount_depth"] is None and f["mult32"]["amount_depth"] is None


def test_guards_flag_what_was_registered():
    a = _load("analyse")
    new = sorted(_load("run").NEW)
    assert all(a.flag_s(d) for d in new)
    assert not any(a.flag_d(d) for d in new)
    assert [d for d in new if a.flag_d(d, 8)] == ["addsh128", "addsh64", "fpalign128", "fpalign64"]
    assert [d for d in new if a.flag_dg(d)] == ["addsh128"]
    assert a.flag_dg("muxshl128") and a.flag_dg("barrel128") and not a.flag_dg("lzcnorm128")


def test_seen_cells_cannot_place_the_threshold():
    a = _load("analyse")
    seen = a.seen_tables()
    assert len(seen) == 160
    for k in (2, 8, 64, 287):
        g = a.guard(lambda d, k=k: a.flag_d(d, k))
        assert all(abs(g(c) - a.swd1(c)) < 1e-12 for c in seen)


def test_table_covers_every_cell():
    run = _load("run")
    rs = [json.loads(l) for l in (EXP / "results.jsonl").read_text().splitlines()]
    assert {(r["design"], r["tag"]) for r in rs} == {(d, t) for d in run.NEW for t in run.FACTORS}
    assert len({(r["design"], r["tag"], tuple(r["seq"])) for r in rs}) == len(rs) == 1440


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load("analyse").main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()
