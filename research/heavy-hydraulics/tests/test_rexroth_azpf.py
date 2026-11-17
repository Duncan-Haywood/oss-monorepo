"""Milestone 7a: the digitised Rexroth AZPF curves are sane and give the printed size table, the family's largest
size stops below the 85 L/min index point (so the hold rule prices it), the eight-family table extends 6z's table
unchanged, and the held-out errors follow from the committed constants."""
import csv
import os
import re
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
RES = EXP / "gear_pump_eight_results.txt"
FAMS = ("casappa", "danfoss", "marzocchi", "bench", "rexroth", "azpn", "azpu", "azpf")
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


def _rows():
    with open(EXP / "data" / "rexroth_azpf_curves.csv") as fh:
        return [r for r in csv.reader(l for l in fh if not l.startswith("#"))][1:]


def _table(text, first, n):
    lines = text.splitlines()
    i = next(k for k, l in enumerate(lines) if l.strip().startswith(first))
    return [l.split() for l in lines[i + 1:i + 1 + n]]


def test_azpf_curves_reproduce_the_printed_size_table():
    from heavy_hydraulics.measured import gear_pump_point
    import digitise_rexroth_azpf as rf
    rows = _rows()
    table = _table(RES.read_text(), "size  V cm3/r", len(rf.SIZES))
    assert [int(t[0]) for t in table] == list(rf.SIZES)
    for t in table:
        size, q20, eta150 = int(t[0]), float(t[2]), float(t[5])
        fl, pw = gear_pump_point(rows, size, 2100.0)
        assert abs(fl(20.0) - q20) < 0.006
        assert abs(fl(150.0) * 150.0 / (600.0 * pw(150.0)) - eta150) < 0.0006
        # 20 bar flow within 3% of geometric; a gear pump's efficiency; drag positive and small
        assert 0.97 < fl(20.0) / (rf.DISPLACEMENT[size] * 2.1) < 1.01
        assert 0.80 < eta150 < 0.93
        assert 0.0 < pw(0.0) < 0.1 * fl(20.0) * 150.0 / 600.0


def test_every_size_has_both_flow_lines_and_its_power_curves():
    import digitise_rexroth_azpf as rf
    rows = _rows()
    for s in rf.SIZES:
        fl = {int(r[2]) for r in rows if int(r[0]) == s and r[1] == "flow"}
        pw = {int(r[2]) for r in rows if int(r[0]) == s and r[1] == "power"}
        assert fl == {20, rf.P2[s]}
        assert pw == set(rf.PRESS[s])
        for n in (1000, 2000):
            vals = [float(r[4]) for p in sorted(pw) for r in rows
                    if int(r[0]) == s and r[1] == "power" and int(r[2]) == p and int(r[3]) == n]
            assert all(b > a for a, b in zip(vals, vals[1:]))
    # flow rises with size at every speed both lines are drawn
    q = [float(r[4]) for s in rf.SIZES for r in rows if int(r[0]) == s and r[1] == "flow" and int(r[2]) == 20
         and int(r[3]) == 2000]
    assert all(b > a for a, b in zip(q, q[1:]))


def test_largest_size_stops_below_the_index_point_and_the_index_is_held():
    text = RES.read_text()
    m = re.search(r"largest size gives ([\d.]+) L/min", text)
    assert float(m.group(1)) < 85.0
    table = _table(text, "size  V cm3/r", 10)
    fam = {r[0]: [float(v) for v in r[1:4]] for r in _table(text, "family     index 2", 8)}
    assert fam["azpf"][0] == float(table[-1][5])          # index 2 is size 28's efficiency at 150 bar
    assert "largest difference 0.0000" in text.split("Check: the 49 seven-family cells")[1].splitlines()[0]


def test_eight_family_table_extends_6z_and_held_out_errors_follow():
    text = RES.read_text()
    t8 = {r[0]: [float(v) for v in r[1:9]] for r in _table(text, "shape \\ idle", 8)}
    seven = (EXP / "gear_pump_seven_results.txt").read_text()
    t7 = {r[0]: [float(v) for v in r[1:8]] for r in _table(seven, "shape \\ idle", 7)}
    for f in FAMS[:7]:
        assert t8[f][:7] == t7[f]
    fam = {r[0]: [float(v) for v in r[1:4]] for r in _table(text, "family     index 2", 8)}
    kw, e50 = fam["azpf"][2], t8["azpf"][7]
    m = re.search(r"\(Z\) 6z seven-family refit 0.8239 \+ 0.0179 \([\d.]+ - 3.57\) = ([\d.]+); error ([+-][\d.]+)",
                  text)
    pred, err = float(m.group(1)), float(m.group(2))
    assert abs(0.8239 + 0.0179 * (kw - 3.57) - pred) < 3e-4        # kW is printed to 0.01
    assert abs(e50 - pred - err) < 1e-4
    m = re.search(r"eight held-out diagonals: one-number ([\d.]+), two-number ([\d.]+)", text)
    assert float(m.group(2)) < float(m.group(1)) / 3


def test_digitiser_rebuilds_the_csv_when_the_pdf_is_cached():
    pdf = os.path.expanduser("~/.cache/heavy-hydraulics-rexroth/rexroth_azpf_RE10089_2021-11-24.pdf")
    if not os.path.exists(pdf):
        pytest.skip("Rexroth AZPF data sheet not cached (digitise_rexroth_azpf.py fetches it)")
    import digitise_rexroth_azpf as rf
    saved = dict(vars(rf.rx))                  # configure() repoints 6w's module; put it back afterwards
    try:
        rows = rf.read(pdf, log=lambda *a: None)
    finally:
        vars(rf.rx).update(saved)
    assert [[str(v) for v in r] for r in rows] == _rows()
