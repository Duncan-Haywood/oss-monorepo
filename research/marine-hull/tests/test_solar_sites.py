import glob
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]


def test_power_files_are_complete_and_annual_matches_months():
    files = glob.glob(os.path.join(HERE, "..", "experiments", "data", "power_*.json"))
    assert len(files) == 5
    for f in files:
        p = json.load(open(f))["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]
        assert all(p[m] > 0 for m in MONTHS)
        mean = sum(p[m] for m in MONTHS) / 12
        assert abs(mean - p["ANN"]) / p["ANN"] < 0.03  # POWER's ANN is a day-weighted mean


def test_insolation_falls_with_latitude():
    ann = {}
    for f in glob.glob(os.path.join(HERE, "..", "experiments", "data", "power_*.json")):
        d = json.load(open(f))
        ann[d["geometry"]["coordinates"][1]] = d["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]["ANN"]
    lats = sorted(ann)
    assert all(ann[a] > ann[b] for a, b in zip(lats, lats[1:]))
