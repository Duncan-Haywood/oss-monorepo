"""Milestone 12d (experiments/m12d_ten_seeds_c200): the per-design counts, the 150 ms arm read from 12c, and the reproduction checks."""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..", "experiments")
LAWS = ("id 33 ms D^0", "mid 36 ms D^0", "id 39.1 ms D^0")


def totals(path, sets, seeds=range(10)):
    tot = {}
    for x in json.load(open(path))["runs"]:
        if x["law_name"] in LAWS and x["set"] in sets and x["seed"] in seeds:
            tot[x["set"]] = tot.get(x["set"], 0) + x["dead_45_2_cap"]
    return tot


def test_identified_totals_recompute_from_results():
    assert totals(os.path.join(EXP, "m12d_ten_seeds_c200", "results.json"), {"aware lag39c200"}) == {"aware lag39c200": 86}
    assert totals(os.path.join(EXP, "m12c_ten_seeds_vii", "results.json"), {"aware lag39c150"}) == {"aware lag39c150": 112}
    # seeds 0-5 of the 200 ms arm are Table VII-1's six-seed row (53 of 2304)
    six = totals(os.path.join(EXP, "m12d_ten_seeds_c200", "results.json"), {"aware lag39c200"}, range(6))
    assert six == {"aware lag39c200": 53}
    txt = open(os.path.join(EXP, "m12d_ten_seeds_c200", "stats.txt")).read()
    assert re.search(r"ident pooled MWU \(20 a side\): sums 112 vs 86; U = 260\.5 of 400, p = 0\.08", txt)
    assert re.search(r"slow  pooled MWU \(20 a side\): sums 462 vs 217;", txt)


def test_new_seeds_are_new_designs():
    r = json.load(open(os.path.join(EXP, "m12d_ten_seeds_c200", "results.json")))
    seeds = sorted({(d["geom"], d["seed"]) for d in r["designs"]})
    assert len(seeds) == 20 and {s for _, s in seeds} == set(range(10))
    assert {t["seed"] for t in r["train"]} == {6, 7, 8, 9}


def test_reproduction_checks_hold_nan_aware():
    txt = open(os.path.join(EXP, "m12d_ten_seeds_c200", "checks.txt")).read()
    assert "stress records of seeds 0-5 differing from 7ac's in a dead_ or J_ field: 0 of 96" in txt
    assert "response records of seeds 0-5 differing from 7ac's in any field: 0 of 108" in txt
    assert txt.rstrip().endswith("MD0 held")
