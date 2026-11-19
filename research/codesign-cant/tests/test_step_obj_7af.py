"""Milestone 7af: a 1 m set-point step as a fourth training condition. The verdicts file is what the script prints, the results
file holds the design set the verdicts read, and the post hoc cruise relation quoted in LOG.md (rise against 0.9 m / (A_P / kd))
holds on the 36 designs flown with the band."""
import json, os, subprocess, sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(HERE, "..", "experiments", "m7af_step_obj")


def test_results_shape():
    f = os.path.join(D, "results.json")
    if not os.path.exists(f):
        return
    r = json.load(open(f))
    assert r["band"] == 0.25 and r["w_step"] == 1.0 and len(r["designs"]) == 12
    assert {d["geom"] for d in r["designs"]} == {"above", "below"}
    assert {x["band"] for x in r["runs"]} == {None, 0.25}
    assert len(r["train"]) == 24 and all(t["arm"] == r["arm"] for t in r["train"])


def test_verdicts_file_is_what_the_script_prints():
    if not os.path.exists(os.path.join(D, "results.json")):
        return
    before = open(os.path.join(D, "verdicts.txt")).read()
    subprocess.run([sys.executable, "verdicts.py"], cwd=D, check=True, capture_output=True)
    assert open(os.path.join(D, "verdicts.txt")).read() == before
    assert "Verdicts:" in before and before.count("AF") >= 9
    assert "0 field mismatches" in before


def test_cruise_relation():
    if not os.path.exists(os.path.join(D, "results.json")):
        return
    R = json.load(open(os.path.join(D, "results.json")))
    AE = json.load(open(os.path.join(D, "..", "m7ae_cint_train", "results.json")))
    AD = json.load(open(os.path.join(D, "..", "m7ad_settle", "results.json")))
    med = lambda v: float(np.nanmedian(np.array([np.nan if x is None else x for x in v], float)))
    t, y = [], []
    for res, lab, cl in ((R["resp"], R["arm"], R["calls"]["new"]), (AE["resp"], AE["arm"], AE["calls"]["new"]),
                         (AD["resp"], "aware lag39c125", AE["calls"]["base"])):
        c = {(x["geom"], x["seed"]): x for x in cl}
        for r in res:
            if r["set"] == lab and r["band"] == 0.25 and r["test"] == "step" and r["law_name"] == "mid 36 ms D^0":
                t.append(0.9 / (3.5 / c[(r["geom"], r["seed"])]["kd"])); y.append(med(r["rise"]))
    assert len(t) == 36
    a, b = np.polyfit(t, y, 1)
    assert np.corrcoef(t, y)[0, 1] > 0.999 and abs(a - 0.90) < 0.01 and abs(b - 0.33) < 0.01
