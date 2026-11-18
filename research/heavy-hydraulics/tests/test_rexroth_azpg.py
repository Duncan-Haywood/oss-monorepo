"""Milestone 6w: the digitised Rexroth AZPG curves are physically sane and give the committed size table, and the
held-out test's printed rule predictions follow from the committed 6r and 6v constants."""
import csv
import os
import re
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
RES = EXP / "gear_pump_rexroth_results.txt"
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


def _rows():
    with open(EXP / "data" / "rexroth_azpg_curves.csv") as fh:
        return [r for r in csv.reader(l for l in fh if not l.startswith("#"))][1:]


def test_azpg_curves_reproduce_the_committed_size_table():
    from heavy_hydraulics.measured import gear_pump_point
    import digitise_rexroth_azpg as rx
    rows = _rows()
    res = RES.read_text().splitlines()
    i = next(k for k, l in enumerate(res) if l.strip().startswith("size  Vg cm3/r"))
    table = [l.split() for l in res[i + 1:i + 1 + len(rx.SIZES)]]
    assert [int(t[0]) for t in table] == list(rx.SIZES)
    for t in table:
        size, q20, eta150 = int(t[0]), float(t[2]), float(t[6])
        fl, pw = gear_pump_point(rows, size, 2100.0)
        assert abs(fl(20.0) - q20) < 0.006
        assert abs(fl(150.0) * 150.0 / (600.0 * pw(150.0)) - eta150) < 0.0006
        # 20 bar flow within 1.5% of the geometric flow, overall efficiency a gear pump's, drag positive
        assert abs(fl(20.0) / (rx.DISPLACEMENT[size] * 2.1) - 1.0) < 0.015
        assert 0.80 < eta150 < 0.95
        assert 0.0 < pw(0.0) < 0.05 * fl(20.0) * 150.0 / 600.0


def test_every_size_has_both_flow_lines_and_its_power_curves():
    import digitise_rexroth_azpg as rx
    rows = _rows()
    for s in rx.SIZES:
        fl = {int(r[2]) for r in rows if int(r[0]) == s and r[1] == "flow"}
        pw = {int(r[2]) for r in rows if int(r[0]) == s and r[1] == "power"}
        assert fl == {20, rx.P2[s]}
        assert pw == set(rx.PRESS[s])
        # at any speed, more pressure takes more power
        for n in (1000, 2000):
            vals = [float(r[4]) for p in sorted(pw) for r in rows
                    if int(r[0]) == s and r[1] == "power" and int(r[2]) == p and int(r[3]) == n]
            assert all(b > a for a, b in zip(vals, vals[1:]))


def test_rule_predictions_follow_from_committed_constants():
    text = RES.read_text()
    kw = float(re.search(r"^  rexroth\s+[\d.]+(?:\s+[+-]?[\d.]+){5}\s+([\d.]+)$", text, re.M).group(1))
    e50 = float(re.search(r"AZPG shape, AZPG idle \(the family\):\s+([\d.]+)", text).group(1))
    pred2 = float(re.search(r"two-number rule \(6v\):.* = ([\d.]+); error", text).group(1))
    assert abs(0.8277 + 0.0187 * (kw - 3.57) - pred2) < 1e-4
    err1 = float(re.search(r"one-number rule \(6r\): E50 = 0.8212; error ([+-][\d.]+)", text).group(1))
    assert abs(0.8212 - e50 - err1) < 1e-4
    check = float(re.search(r"Casappa shape, Casappa idle \(check\):\s+([\d.]+)", text).group(1))
    six_u = (EXP / "gear_pump_shape_results.txt").read_text()
    assert f"casappa          {check:.4f}" in six_u            # 6u's Casappa diagonal, reproduced


def test_digitiser_rebuilds_the_csv_when_the_pdf_is_cached(tmp_path):
    pdf = os.path.expanduser("~/.cache/heavy-hydraulics-rexroth/rexroth_azpg_RE10093_2019-09-27.pdf")
    if not os.path.exists(pdf):
        pytest.skip("Rexroth data sheet not cached (digitise_rexroth_azpg.py fetches it)")
    import digitise_rexroth_azpg as rx
    rows = rx.read(pdf, log=lambda *a: None)
    assert [[str(v) for v in r] for r in rows] == _rows()
