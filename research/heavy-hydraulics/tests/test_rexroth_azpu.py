"""Milestone 6z: the digitised Rexroth AZPU curves are sane and give the printed size table, index 2 now holds at a
family's end sizes (the five families that reach 85 L/min are unchanged, the AZPN takes the model's own value), the
seven-family table extends 6y's post-hoc table, and the held-out errors follow from the committed constants."""
import csv
import os
import re
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
RES = EXP / "gear_pump_seven_results.txt"
FAMS = ("casappa", "danfoss", "marzocchi", "bench", "rexroth", "azpn", "azpu")
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


def _rows():
    with open(EXP / "data" / "rexroth_azpu_curves.csv") as fh:
        return [r for r in csv.reader(l for l in fh if not l.startswith("#"))][1:]


def _table(text, first, n):
    lines = text.splitlines()
    i = next(k for k, l in enumerate(lines) if l.strip().startswith(first))
    return [l.split() for l in lines[i + 1:i + 1 + n]]


def test_azpu_curves_reproduce_the_printed_size_table():
    from heavy_hydraulics.measured import gear_pump_point
    import digitise_rexroth_azpu as ru
    rows = _rows()
    table = _table(RES.read_text(), "size  V cm3/r", len(ru.SIZES))
    assert [int(t[0]) for t in table] == list(ru.SIZES)
    for t in table:
        size, q20, eta150 = int(t[0]), float(t[2]), float(t[5])
        fl, pw = gear_pump_point(rows, size, 2100.0)
        assert abs(fl(20.0) - q20) < 0.006
        assert abs(fl(150.0) * 150.0 / (600.0 * pw(150.0)) - eta150) < 0.0006
        # the sheet draws the 20 bar flow 2 to 4.5% above geometric (disclosed); a gear pump's efficiency; drag > 0
        assert 1.0 < fl(20.0) / (ru.DISPLACEMENT[size] * 2.1) < 1.05
        assert 0.85 < eta150 < 0.93
        assert 0.0 < pw(0.0) < 0.05 * fl(20.0) * 150.0 / 600.0


def test_every_size_has_both_flow_lines_and_its_power_curves():
    import digitise_rexroth_azpu as ru
    rows = _rows()
    for s in ru.SIZES:
        fl = {int(r[2]) for r in rows if int(r[0]) == s and r[1] == "flow"}
        pw = {int(r[2]) for r in rows if int(r[0]) == s and r[1] == "power"}
        assert fl == {20, ru.P2[s]}
        assert pw == set(ru.PRESS[s])
        for n in (1000, 2000):
            vals = [float(r[4]) for p in sorted(pw) for r in rows
                    if int(r[0]) == s and r[1] == "power" and int(r[2]) == p and int(r[3]) == n]
            assert all(b > a for a, b in zip(vals, vals[1:]))


def test_index_holds_at_the_end_sizes_and_changes_only_the_azpn():
    text = RES.read_text()
    t = {r[0]: [float(v) for v in r[1:4]] for r in _table(text, "family     hold", len(FAMS))}
    for f, (hold, ext, model) in t.items():
        if f != "danfoss":
            assert abs(hold - model) < 1e-4                 # the index is where the model reads the pump
        if f != "azpn":
            assert hold == ext                              # families that reach 85 L/min are unchanged
    assert t["azpn"][1] - t["azpn"][0] > 0.03               # 6y's extrapolation overstated it
    assert "largest difference 0.0000" in text.split("Check: the 36 six-family cells")[1].splitlines()[0]


def test_seven_family_table_and_held_out_errors_follow():
    text = RES.read_text()
    t7 = {r[0]: [float(v) for v in r[1:8]] for r in _table(text, "shape \\ idle", 7)}
    six = (EXP / "gear_pump_six_results.txt").read_text()
    t6 = {r[0]: [float(v) for v in r[1:7]] for r in _table(six, "shape \\ idle", 6)}
    for f in FAMS[:5]:
        assert t7[f][:6] == t6[f]
    fam = {r[0]: [float(v) for v in r[1:4]] for r in _table(text, "family     index 2", 7)}
    kw, e50 = fam["azpu"][2], t7["azpu"][6]
    m = re.search(r"\(A\) 6x as committed 0.8241 \+ 0.0179 \([\d.]+ - 3.57\) = ([\d.]+); error ([+-][\d.]+)", text)
    pred, err = float(m.group(1)), float(m.group(2))
    assert abs(0.8241 + 0.0179 * (kw - 3.57) - pred) < 3e-4        # kW is printed to 0.01
    assert abs(e50 - pred - err) < 1e-4
    m = re.search(r"seven held-out diagonals: one-number ([\d.]+), two-number ([\d.]+)", text)
    assert float(m.group(2)) < float(m.group(1)) / 3


def test_digitiser_rebuilds_the_csv_when_the_pdf_is_cached():
    pdf = os.path.expanduser("~/.cache/heavy-hydraulics-rexroth/rexroth_azpu_RE10098_2012-02.pdf")
    if not os.path.exists(pdf):
        pytest.skip("Rexroth AZPU data sheet not cached (digitise_rexroth_azpu.py fetches it)")
    import digitise_rexroth_azpu as ru
    saved = dict(vars(ru.rx))                  # configure() repoints 6w's module; put it back afterwards
    try:
        ru.configure()
        rows = ru.rx.read(pdf, log=lambda *a: None)
    finally:
        vars(ru.rx).update(saved)
    assert [[str(v) for v in r] for r in rows] == _rows()
