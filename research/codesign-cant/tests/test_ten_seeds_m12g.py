"""Milestone 12g (experiments/m12g_ten_seeds_7c7d): 7c's confusion counts and 7d's tilt sweep recomputed from results.json."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(HERE, "..", "experiments", "m12g_ten_seeds_7c7d")


def _r():
    return json.load(open(os.path.join(D, "results.json")))


def test_certificate_is_necessary_over_ten_seeds():
    cs = [c for c in _r()["conds"] if c["set"] == "7b"]
    assert len(cs) == 80 and {c["seed"] for c in cs} == set(range(10))
    tp = sum(1 for c in cs for r, d in zip(c["rho_ep"], c["dead_0"]) if r >= 1 and d)
    fp = sum(1 for c in cs for r, d in zip(c["rho_ep"], c["dead_0"]) if r >= 1 and not d)
    fn = sum(1 for c in cs for r, d in zip(c["rho_ep"], c["dead_0"]) if r < 1 and d)
    assert (tp, fp, fn) == (140, 502, 0)
    assert all(c["label"] == "6b+integ" and c["geom"] == "above"
               for c in cs if any(r >= 1 and not d for r, d in zip(c["rho_ep"], c["dead_0"])))


def test_tilt_limit_releases_the_rescaled_designs():
    R = _r()["m7d"]
    idx = [i for i, m in enumerate(R["conds"]) if m["set"] == "1.25x"]
    tot = {(o["cap"], o["hz"]): sum(sum(o["dead"][i]) for i in idx) for o in R["tilt"]}
    assert tot[(20.0, 6)] == 0 and tot[(20.0, 18)] == 0
    assert tot[(45.0, 6)] == 317 and tot[(45.0, 18)] == 535
    m = [i for i, c in enumerate(R["conds"]) if c["set"] == "0.8x"]
    assert all(sum(o["dead"][i]) == 0 for o in R["tilt"] for i in m)


def test_reproduction_checks_hold():
    txt = open(os.path.join(D, "checks.txt")).read()
    assert txt.count("CHECK ok") == 5 and "FAIL" not in txt
