import importlib.util
import math
import os
import sys

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
sys.path.insert(0, HERE)
spec = importlib.util.spec_from_file_location("rule_check_test", os.path.join(HERE, "rule_check.py"))
rc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rc)


def test_rule_reproduces_11ai_at_one_metre():
    # 11ai: independent 1 m per-drone noise, sigma_gap = sqrt 2, rule picks 5 bands (13.33 m) at Z = 25 ft
    assert rc.rule_bands(math.sqrt(2.0)) == 5
    assert abs(rc.spacing(5) - 13.333) < 1e-3


def test_zero_offsets_reduce_to_pair_noise():
    sg, sdd = rc.sigma_gap([1.5, 1.5, 1.5], 1.0)
    assert sdd == 0.0 and abs(sg - rc.SIGMA_PAIR) < 1e-12
    h = 13.33
    assert abs(rc.p_mix([0.7], 2.0, h) - rc.p_leak(0.0, rc.SIGMA_PAIR, h)) < 1e-12


def test_p_leak_matches_direct_integral():
    # P(|h + e| < Z) by a midpoint sum over e ~ N(0.5, 1.2^2)
    h, mu, sd, n = 9.0, 0.5, 1.2, 20000
    lo, hi = mu - 8 * sd, mu + 8 * sd
    de = (hi - lo) / n
    tot = 0.0
    for i in range(n):
        e = lo + (i + 0.5) * de
        if abs(h + e) < rc.Z:
            tot += math.exp(-0.5 * ((e - mu) / sd) ** 2) / (sd * math.sqrt(2 * math.pi)) * de
    assert abs(rc.p_leak(mu, sd, h) - tot) < 1e-4


def test_searched_parses_11ao_results():
    got = rc.searched("speed_offset_results.txt")
    assert got[(12, 1.0)] == 13.33 and got[(16, 2.0)] == 24.0
