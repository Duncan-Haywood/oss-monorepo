"""Milestone 6y: the digitised Rexroth AZPN curves are sane and give the printed size table, the six-family table
agrees with 6x where they overlap, the held-out errors follow from 6x's committed constants, and the post-hoc
index reading is the model's own efficiency at the largest size."""
import csv
import os
import re
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
RES = EXP / "gear_pump_six_results.txt"
FAMS = ("casappa", "danfoss", "marzocchi", "bench", "rexroth", "azpn")
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


def _rows():
    with open(EXP / "data" / "rexroth_azpn_curves.csv") as fh:
        return [r for r in csv.reader(l for l in fh if not l.startswith("#"))][1:]


def _table(text, first, n):
    lines = text.splitlines()
    i = next(k for k, l in enumerate(lines) if l.strip().startswith(first))
    return [l.split() for l in lines[i + 1:i + 1 + n]]


def test_azpn_curves_reproduce_the_printed_size_table():
    from heavy_hydraulics.measured import gear_pump_point
    import digitise_rexroth_azpn as rn
    rows = _rows()
    table = _table(RES.read_text(), "size  V cm3/r", len(rn.SIZES))
    assert [int(t[0]) for t in table] == list(rn.SIZES)
    for t in table:
        size, q20, eta150 = int(t[0]), float(t[2]), float(t[5])
        fl, pw = gear_pump_point(rows, size, 2100.0)
        assert abs(fl(20.0) - q20) < 0.006
        assert abs(fl(150.0) * 150.0 / (600.0 * pw(150.0)) - eta150) < 0.0006
        # 20 bar flow within 2.5% of geometric (the sheet draws size 25 2% high), a gear pump's efficiency, drag > 0
        assert abs(fl(20.0) / (rn.DISPLACEMENT[size] * 2.1) - 1.0) < 0.025
        assert 0.85 < eta150 < 0.96
        assert 0.0 < pw(0.0) < 0.05 * fl(20.0) * 150.0 / 600.0


def test_every_size_has_both_flow_lines_and_its_power_curves():
    import digitise_rexroth_azpn as rn
    rows = _rows()
    for s in rn.SIZES:
        fl = {int(r[2]) for r in rows if int(r[0]) == s and r[1] == "flow"}
        pw = {int(r[2]) for r in rows if int(r[0]) == s and r[1] == "power"}
        assert fl == {20, rn.P2[s]}
        assert pw == set(rn.PRESS[s])
        for n in (1000, 2000):
            vals = [float(r[4]) for p in sorted(pw) for r in rows
                    if int(r[0]) == s and r[1] == "power" and int(r[2]) == p and int(r[3]) == n]
            assert all(b > a for a, b in zip(vals, vals[1:]))


def test_six_family_table_matches_6x_and_held_out_errors_follow():
    text = RES.read_text()
    five = (EXP / "gear_pump_five_results.txt").read_text()
    t6 = {r[0]: [float(v) for v in r[1:7]] for r in _table(text, "shape \\ idle", 6)}
    t5 = {r[0]: [float(v) for v in r[1:6]] for r in _table(five, "shape \\ idle", 5)}
    for f, vals in t5.items():
        assert t6[f][:5] == vals
    fam = {r[0]: [float(v) for v in r[1:4]] for r in _table(text, "family     index 2", 6)}
    kw, e50 = fam["azpn"][2], t6["azpn"][5]
    pred = float(re.search(r"two-number 0.8241 \+ 0.0179 \([\d.]+ - 3.57\) = ([\d.]+); error ([+-][\d.]+)", text).group(1))
    assert abs(0.8241 + 0.0179 * (kw - 3.57) - pred) < 3e-4        # kW is printed to 0.01
    err2 = float(re.search(r"= [\d.]+; error ([+-][\d.]+)", text).group(1))
    assert abs(e50 - pred - err2) < 1e-4
    # the registered test failed: the error is outside the 0.010 AY1 allowed
    assert abs(err2) > 0.010


def test_post_hoc_index_is_the_models_efficiency_and_scales_the_crossing():
    text = RES.read_text()
    m = re.search(r"index 2 extrapolated to 85 L/min ([\d.]+); the model's own efficiency there ([\d.]+)", text)
    e_ex, e_cl = float(m.group(1)), float(m.group(2))
    size36 = [r for r in _table(text, "size  V cm3/r", 6) if r[0] == "36"][0]
    assert abs(e_cl - float(size36[5])) < 1e-4            # held at the largest size, as Gear holds it
    m = re.search(r"AZPN E50 ([\d.]+) \(registered reading ([\d.]+); ratio of the indices ([\d.]+), crossings ([\d.]+)\)", text)
    ec, er = float(m.group(1)), float(m.group(2))
    # the crossing is in units of the index, so it moves by the ratio of the two readings (up to the 0.99 cap)
    assert abs(ec / er - e_cl / e_ex) < 0.001
    m = re.search(r"RMS over the six held-out diagonals: one-number ([\d.]+), two-number ([\d.]+)\n\nSources", text)
    assert float(m.group(2)) < float(m.group(1)) / 3


def test_digitiser_rebuilds_the_csv_when_the_pdf_is_cached():
    pdf = os.path.expanduser("~/.cache/heavy-hydraulics-rexroth/rexroth_azpn_RE10091_2024-11-18.pdf")
    if not os.path.exists(pdf):
        pytest.skip("Rexroth AZPN data sheet not cached (digitise_rexroth_azpn.py fetches it)")
    import digitise_rexroth_azpn as rn
    saved = dict(vars(rn.rx))                  # configure() repoints 6w's module; put it back afterwards
    try:
        rn.configure()
        rows = rn.rx.read(pdf, log=lambda *a: None)
    finally:
        vars(rn.rx).update(saved)
    assert [[str(v) for v in r] for r in rows] == _rows()
