"""Milestone 7t: the training lag is the midpoint of the identified rows marked for use, and the results reproduce 7r."""
import csv, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data", "motor_lag")


def test_train_lag_is_midpoint_of_fit_rows():
    rows = [r for r in csv.DictReader(open(os.path.join(DATA, "identified.csv"))) if r["use"] == "fit"]
    law = json.load(open(os.path.join(DATA, "lag_law.json")))
    lags = sorted(float(r["lag_s"]) for r in rows)
    assert lags == sorted(law["fit_rows"].values())
    assert abs(law["train_K_s"] - sum(lags) / len(lags)) < 0.001
    assert law["train_exp"] == 0.0


def test_7t_reproduces_7r_counts_under_inherited_law():
    res = json.load(open(os.path.join(HERE, "..", "experiments", "m7t_lag_src", "results.json")))
    got = {}
    for r in res["runs"]:
        if r["law_name"] == "inherited 15 ms D^1.5" and r["set"].endswith("[src_li]"):
            got[(r["set"], r["geom"])] = got.get((r["set"], r["geom"]), 0) + r["dead_45_2_cap"]
    assert got == {("7l src_li [src_li]", "above"): 106, ("7l src_li [src_li]", "below"): 131,
                   ("aware src_li [src_li]", "above"): 54, ("aware src_li [src_li]", "below"): 64}
