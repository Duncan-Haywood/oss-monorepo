"""Milestone 12c (experiments/m12c_ten_seeds_vii): the DP Wilcoxon, the per-design counts and the reproduction checks."""
import importlib.util, json, os, random, re

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..", "experiments")


def load(name, sub, f="stats.py"):
    spec = importlib.util.spec_from_file_location(name, os.path.join(EXP, sub, f))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


def test_dp_wilcoxon_equals_full_enumeration():
    dp, en = load("m12c_stats", "m12c_ten_seeds_vii"), load("m12_stats", "m12_ten_seeds")
    rng = random.Random(3)
    for _ in range(200):
        d = [rng.choice([-4, -2, -1, 0, 1, 2, 2, 3, 6]) for _ in range(rng.randint(1, 12))]
        assert abs(dp.wilcoxon(d)[0] - en.wilcoxon(d)) < 1e-12
    assert abs(dp.wilcoxon([1.0] * 20)[0] - 2 / 2 ** 20) < 1e-15     # the n = 20 floor


def test_identified_totals_recompute_from_results():
    r = json.load(open(os.path.join(EXP, "m12c_ten_seeds_vii", "results.json")))
    laws = ("id 33 ms D^0", "mid 36 ms D^0", "id 39.1 ms D^0")
    tot = {}
    for x in r["runs"]:
        if x["law_name"] in laws:
            tot[x["set"]] = tot.get(x["set"], 0) + x["dead_45_2_cap"]
    assert tot == {"aware lag39c125": 196, "aware lag39c150": 112}
    txt = open(os.path.join(EXP, "m12c_ten_seeds_vii", "stats.txt")).read()
    assert re.search(r"sums 196 vs 112; U = 303\.5 of 400, p = 0\.004", txt)
    # seeds 0-5 are milestone 7ac's six-seed rows of Table VII-1 (101 and 65 of 2304)
    six = {}
    for x in r["runs"]:
        if x["law_name"] in laws and x["seed"] < 6:
            six[x["set"]] = six.get(x["set"], 0) + x["dead_45_2_cap"]
    assert six == {"aware lag39c125": 101, "aware lag39c150": 65}


def test_reproduction_checks_hold_nan_aware():
    txt = open(os.path.join(EXP, "m12c_ten_seeds_vii", "checks.txt")).read()
    assert "stress records of seeds 0-5 differing from 7ac's in a dead_ or J_ field: 0 of 192" in txt
    assert "response records of seeds 0-5 differing from 7ac's in any field: 0 of 216" in txt
    assert txt.rstrip().endswith("MC0 held")
