"""Step 2b's committed outputs: the replay matches step 1, and the H4 score is what the README reports."""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..", "experiments")


def load():
    cells = json.load(open(os.path.join(EXP, "threshold", "libriwasn_summary.json")))
    step1 = json.load(open(os.path.join(EXP, "real-devices", "summary.json")))["fail"]
    return cells, step1


def test_replay_reproduces_step1():
    cells, step1 = load()
    assert len(cells) == 96
    for c in cells:
        ref = step1[f"{c['room']}|{c['snr']:.1f}|{c['L']}|{c['gamma']}"]
        assert c["n"] == ref["n"] and abs(c["raw"] - ref["fail"]) < 1e-12


def test_h4_score_matches_readme():
    cells, _ = load()
    scored = [c for c in cells if c["n_fixed"] >= 10]
    ok = sum(0.5 <= c["pred"] / c["fixed"] <= 2 for c in scored)
    assert (ok, len(scored)) == (41, 94)
    assert all(c["pred"] / c["fixed"] >= 0.5 for c in scored)  # nothing underpredicted beyond x2
