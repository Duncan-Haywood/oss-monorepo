"""Milestone 143: the one-clock blind designs at the SKY130 ss_100C_1v60 corner (40% utilisation) against their tt cells."""
import importlib.util
import json
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments"
HERE = EXP / "corner_ss_blind"


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_rows_follow_the_fixed_protocol():
    a = _load(HERE / "analyse.py", "corner_ss_blind_rows")
    rows = a.rows_ss()
    meta = json.loads((HERE / "meta.json").read_text())
    assert meta["order"] == a.run.ORDER and meta["liberty_sha256"] == a.run.SHA256
    for r in rows:
        assert r["corner"] == "ss_100C_1v60" and r["util"] == 40 and r["tag"] == a.run.CLOCK[r["design"]]
        assert abs(r["period_ns"] - round(meta["base_period_ns"][r["design"]] * a.run.FACTORS[r["tag"]], 3)) < 1e-9
    keys = [(r["design"], tuple(r["seq"])) for r in rows]
    assert len(set(keys)) == len(keys)
    assert len(a.run.complete(rows)) == N_DONE


def test_ss_baselines_are_slower_than_tt():
    meta = json.loads((HERE / "meta.json").read_text())
    assert all(meta["base_period_ns"][d] > meta["tt_base_period_ns"][d] for d in meta["order"])


def test_synth_period_parses_a_log_that_failed_later():
    run = _load(HERE / "run.py", "corner_ss_blind_run")
    log = "STAGE synth_netlist\nDesign area 10 um^2 1% utilization.\nworst slack max -23.87\nSTAGE global_route\n[ERROR GRT-0183]\n"
    assert run.synth_period(log) == 33.87
    assert run.synth_period("STAGE floorplan\n") is None


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load(HERE / "analyse.py", "corner_ss_blind_analyse").main(out)
    assert out.read_text() == (HERE / "results.txt").read_text()


N_DONE = 27  # the flow stopped at its two-hour limit at 3,311 of 6,240 points
