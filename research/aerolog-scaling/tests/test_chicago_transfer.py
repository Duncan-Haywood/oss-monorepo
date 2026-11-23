import gzip
import importlib.util
import json
import math
import os
import random
import sys

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
sys.path.insert(0, HERE)


def _mod(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


ce = _mod("chicago_extract_test", "chicago_extract.py")
ct = _mod("chicago_transfer_test", "chicago_transfer.py")


def _row(lat, lon, station):
    return {"end_lat": lat, "end_lng": lon, "end_station_id": "13157" if station else ""}


def test_station_end_spread_stays_in_its_disc():
    rnd = random.Random(1)
    c = ce.project(41.8781, -87.6439)
    for _ in range(500):
        x, y = ce.spread(_row("41.8781", "-87.6439", True), rnd)
        assert math.dist((x, y), c) <= ce.JITTER_M + 1e-6


def test_dockless_end_spread_stays_in_its_rounding_cell():
    rnd = random.Random(2)
    lo, hi = ce.project(41.875, -87.645), ce.project(41.885, -87.635)
    for _ in range(500):
        x, y = ce.spread(_row("41.88", "-87.64", False), rnd)
        assert lo[0] - 1e-6 <= x <= hi[0] + 1e-6 and lo[1] - 1e-6 <= y <= hi[1] + 1e-6
    # one decimal ("41.9" from trailing-zero loss) spreads over the 0.1 deg cell
    assert ce.decimals("41.9") == 1 and ce.decimals("-87.64") == 2


def test_missing_and_far_dockless_ends_are_dropped():
    rnd = random.Random(3)
    assert ce.spread(_row("", "", False), rnd) is None
    assert ce.spread(_row("42.10", "-87.64", False), rnd) is None      # cell centre about 24 km north


def test_chicago_set_shares_no_seed_with_any_nyc_set():
    assert ct.check_seeds() == set()
    assert ct.CHI == {12: list(range(1260, 1272)), 16: list(range(1660, 1672))}


def test_committed_results_have_every_chicago_layout():
    path = ct.OUT
    if not os.path.exists(path):
        return
    with gzip.open(path, "rt") as f:
        res = json.load(f)
    assert sorted((r["m"], r["idx"]) for r in res) == sorted((m, i) for m in ct.CHI for i in ct.CHI[m])
