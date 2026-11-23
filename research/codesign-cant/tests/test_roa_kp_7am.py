"""Milestone 7am: the stored kp-varying offset sweep reproduces milestone 7l at its own 6 s episode, and its stats are consistent."""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..", "experiments", "m7am_roa_kp")


def _results():
    return json.load(open(os.path.join(EXP, "results.json")))


def test_six_second_check_matches_7l():
    R = _results()
    six = {r["cap"]: np.array(r["dead"]).sum(1) for r in R["runs"] if r["steps"] is None}
    assert six[False].tolist() == [d["stored_base"] for d in R["designs"]]
    assert six[True].tolist() == [d["stored_cap"] for d in R["designs"]]


def test_wide_designs_have_higher_kp():
    R = _results()
    kp = np.array([d["kp"] for d in R["designs"]]); wide = np.array([d["label"] == "t45 cap wide" for d in R["designs"]])
    assert wide.sum() == 12 and kp[wide].min() > 20 and kp[~wide].max() < 10.5


def test_stats_table_recomputes():
    R = _results(); J = json.load(open(os.path.join(EXP, "stats.json")))
    wide = np.array([d["label"] == "t45 cap wide" for d in R["designs"]])
    for r in R["runs"]:
        if r["arm"] == "quiet+O" and not r["cap"] and r["steps"] is not None:
            d = np.array(r["dead"], bool)
            assert J["table"][str(float(r["s"]))][:2] == [int(d[~wide].sum()), int(d[wide].sum())]
