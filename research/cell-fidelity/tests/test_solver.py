import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "solver"
spec = importlib.util.spec_from_file_location("solver_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def test_kind_separates_fail_stop_ok():
    assert run.kind({"ok": False, "ok_cycles": 0}) == "fail"
    assert run.kind({"ok": True, "ok_cycles": 0}) == "fail"
    assert run.kind({"ok": True, "ok_cycles": 37}) == "stop"
    assert run.kind({"ok": True, "ok_cycles": 100}) == "ok"
    assert run.kind({}) == "fail"


def test_rel_gap_matches_the_untrusted_label():
    assert run.rel_gap(0.0, 120.0) == 1.0
    assert abs(run.rel_gap(90.0, 120.0) - 0.25) < 1e-12
    assert run.rel_gap(130.0, 120.0) < 0


def test_rescued_ignores_v0():
    rows = {((1, 2), "V0"): {"ok": True, "ok_cycles": 100}, ((1, 2), "V3"): {"ok": True, "ok_cycles": 100},
            ((1, 2), "V1"): {"ok": True, "ok_cycles": 40}}
    assert run.rescued(rows, (1, 2)) == ["V3"]


def test_structural_needs_a_negative_concentration():
    assert run.structural({"ce1_min_ratio": -0.1})
    assert not run.structural({"ce1_min_ratio": 0.0})
    assert not run.structural({"ce1_min_ratio": None})


def test_committed_census_covers_every_failing_run():
    c = json.loads((HERE / "census.json").read_text())
    kinds = {}
    for r in c["failing"]:
        kinds[(r["set"], r["kind"])] = kinds.get((r["set"], r["kind"]), 0) + 1
    assert kinds == {("NCA_Kim2011", "fail"): 49, ("OKane2022", "fail"): 12, ("Mohtat2020", "stop"): 6}
    assert len(c["control"]) == 24
