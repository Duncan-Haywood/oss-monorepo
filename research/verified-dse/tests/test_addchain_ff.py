"""Milestone 145: add-chain against other shift amounts at SKY130 ff_n40C_1v95, 20 fresh designs."""
import importlib.util
import json
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments"
HERE = EXP / "addchain_ff"


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_groups_and_order_are_fixed():
    run = _load(HERE / "run.py", "addchain_ff_run")
    assert len(run.ADD) == 10 and len(run.CTRL) == 10 and not set(run.ADD) & set(run.CTRL)
    assert sorted(run.ORDER) == sorted(run.NEW)
    assert all(run.GROUP[run.ORDER[i]] == ("ADD", "CTRL")[i % 2] for i in range(len(run.ORDER)))
    # no design here was in milestone 144's ff run
    m144 = _load(EXP / "corner_ff_blind" / "run.py", "addchain_ff_m144")
    assert not set(run.NEW) & set(m144.ORDER)


def test_rows_follow_the_fixed_protocol():
    a = _load(HERE / "analyse.py", "addchain_ff_rows")
    rows = a.rows()
    meta = json.loads((HERE / "meta.json").read_text())
    assert meta["order"] == a.run.ORDER and meta["liberty_sha256"] == a.run.SHA256
    assert meta["tools"]["openroad"] == "26Q3" and "0.71" in meta["tools"]["yosys"]
    for r in rows:
        assert r["corner"] == "ff_n40C_1v95" and r["tag"] == a.run.CLOCK[r["design"]]
        assert abs(r["period_ns"] - round(meta["base_period_ns"][r["design"]] * a.run.FACTORS[r["tag"]], 3)) < 1e-9
    keys = [(r["design"], tuple(r["seq"])) for r in rows]
    assert len(set(keys)) == len(keys) == 2400
    assert len(a.run.complete(rows)) == 20


def test_perm_p_is_one_for_identical_groups():
    a = _load(HERE / "analyse.py", "addchain_ff_perm")
    assert a.perm_p([1.0, 2.0], [1.0, 2.0], n=200) == 1.0


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load(HERE / "analyse.py", "addchain_ff_analyse").main(out)
    assert out.read_text() == (HERE / "results.txt").read_text()
