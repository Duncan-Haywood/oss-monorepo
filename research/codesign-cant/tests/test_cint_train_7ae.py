"""Milestone 7ae: training with conditional integration on. The verdicts file is what the script prints, and the results
file holds the design set the verdicts read (12 designs, 2 geometries x 6 seeds, flown with and without the band)."""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(HERE, "..", "experiments", "m7ae_cint_train")


def test_results_shape():
    f = os.path.join(D, "results.json")
    if not os.path.exists(f):
        return
    r = json.load(open(f))
    assert r["band"] == 0.25 and len(r["designs"]) == 12
    assert {d["geom"] for d in r["designs"]} == {"above", "below"}
    assert {x["band"] for x in r["runs"]} == {None, 0.25}
    assert len(r["train"]) == 24 and all(t["arm"] == r["arm"] for t in r["train"])


def test_verdicts_file_is_what_the_script_prints():
    if not os.path.exists(os.path.join(D, "results.json")):
        return
    before = open(os.path.join(D, "verdicts.txt")).read()
    subprocess.run([sys.executable, "verdicts.py"], cwd=D, check=True, capture_output=True)
    assert open(os.path.join(D, "verdicts.txt")).read() == before
    assert "Verdicts:" in before and before.count("AE") >= 7
    assert "0 field mismatches" in before
