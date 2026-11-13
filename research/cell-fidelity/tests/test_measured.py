import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "measured"
spec = importlib.util.spec_from_file_location("measured_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def test_parse_measured_reads_csv_and_tab_columns():
    assert run.parse_measured("0,4.1\n10,4.0\n") == ([0.0, 10.0], [4.1, 4.0])
    assert run.parse_measured("0\t4.1\nheader x\n10\t4.0\n") == ([0.0, 10.0], [4.1, 4.0])


def test_crossing_time_interpolates_first_fall_below_cut():
    t, v = [0, 10, 20, 30], [4.0, 3.5, 3.0, 2.5]
    assert run.crossing_time(t, v, 3.25) == 15.0
    assert run.crossing_time(t, v, 2.0) is None
    assert run.crossing_time([0, 1], [2.0, 1.9], 3.0) == 0


def test_interp_and_rmse_on_overlap():
    ts, vs = [0, 10, 20], [4.0, 3.0, 2.0]
    assert run.interp(ts, vs, 5) == 3.5
    assert run.interp(ts, vs, 25) is None
    # model is the measured curve plus 0.01 V: RMSE 0.01 on the overlap only
    tm, vm = [0, 5, 10, 30], [4.0, 3.5, 3.0, 9.9]
    r = run.rmse_on_overlap(tm, vm, ts, [x + 0.01 for x in vs], 20)
    assert abs(r - 0.01) < 1e-12


def test_spearman_handles_ties_and_order():
    assert abs(run.spearman([1, 2, 3], [3, 2, 1]) + 1) < 1e-12
    assert abs(run.spearman([1, 1, 2], [1, 1, 2]) - 1) < 1e-12


def _cond(name, q_meas, spm, spme, dfn, r):
    return dict(name=name, q_meas=q_meas, models={"SPM": dict(q=spm, r_min=r), "SPMe": dict(q=spme, r_min=r),
                                                  "DFN": dict(q=dfn, r_min=r)})


def test_verdicts_follow_the_plan():
    # low r_min: SPMe far off, DFN close; high r_min: both 3% high and 0.1% apart
    conds = [_cond("a", 1.0, 1.2, 1.2, 1.01, 0.1), _cond("b", 1.0, 1.04, 1.03, 1.03, 0.9),
             _cond("c", 1.0, 1.05, 1.04, 1.035, 0.8)]
    res = run.verdicts(conds)
    assert res["H61"]["verdict"] == "supported"
    assert res["H62"]["verdict"] == "supported"
    assert res["H63"]["trusted"] == ["b", "c"] and res["H63"]["verdict"] == "supported"
    # SPMe closer than DFN by 5 points somewhere: H61 refuted
    res = run.verdicts([_cond("a", 1.0, 1.0, 1.0, 1.05, 0.9)])
    assert res["H61"]["verdict"] == "refuted"


def test_thin_keeps_ends():
    t = list(range(1000))
    kt, kv = run.thin(t, t, 10)
    assert kt[0] == 0 and kt[-1] == 999 and len(kt) == 10
