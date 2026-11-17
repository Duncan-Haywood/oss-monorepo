"""Milestone 3j: scoring of the TUM re-solve (experiments/m3j_tumpin/analyse.py)."""
import importlib.util, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("m3j_analyse", os.path.join(HERE, "..", "experiments", "m3j_tumpin", "analyse.py"))
A = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(A)


def window(f, ref, fc, fp, sd_p=1.0, ratio_c=1.0):
    w = {"why": "ok", "seq": "fr1_desk", "window": 0, "intr": [f, 320, 240, 0, 0], "cost": 100.0}
    for p in A.PINS:
        w[p] = {"fc": fc, "fp": fp, "status_p": 1, "kept": True, "sd_p": sd_p, "sd_free": 1.0,
                "sd_ratio_c": ratio_c, "cost_p": 110.0}
    return w


def run(ws):
    m3c = {("fr1_desk", 0): {"f": ws[0]["intr"][0], "ref": 500.0}}
    R = []
    for w in ws:
        R += A.rows({"windows": [w]}, m3c)
    return R


def test_pinning_that_hurts_holds_h161_to_h163():
    R = run([window(510, 500, 530, 525)])           # free 2% off, pinned 5% off
    h = A.score(R)
    assert h["H161"]["holds"] and h["H162"]["holds"] and h["H163"]["holds"]
    assert abs(h["H161"]["median_abs_e_pinned"] - 0.05) < 1e-12


def test_pinning_that_helps_refutes():
    h = A.score(run([window(530, 500, 505, 502)]))
    assert not h["H161"]["holds"]


def test_sign_and_ratio():
    R = run([window(500, 500, 510, 508)])
    h = A.score(R)
    assert h["H164"]["holds"]
    assert abs(h["H165"]["median_ratio"]["k"] - 0.8) < 1e-12 and h["H165"]["holds"]
    R = run([window(500, 500, 510, 492)])
    h = A.score(R)
    assert not h["H164"]["holds"] and not h["H165"]["holds"]


def test_sd_ratio_gap_and_failed_pins_excluded():
    w = window(500, 500, 510, 508, sd_p=0.5, ratio_c=0.5)
    assert A.score(run([w]))["H166"]["holds"]
    w["k"]["kept"] = False
    R = run([w])
    assert not R[0]["k"]["ok"]
    assert np.isnan(A.score(R)["H161"]["median_abs_e_pinned"])
