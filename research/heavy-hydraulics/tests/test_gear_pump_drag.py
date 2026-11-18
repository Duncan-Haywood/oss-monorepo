"""Milestone 6v: the idle-drag sweep's committed results agree with 6u's factorial where they overlap, and the
two-number rule's printed errors follow from the printed table."""
import re
from pathlib import Path

import pytest

EXP = Path(__file__).resolve().parents[1] / "experiments"
RES = EXP / "gear_pump_drag_results.txt"
SHAPE = EXP / "gear_pump_shape_results.txt"
FAMS = ("casappa", "danfoss", "marzocchi", "bench")


def _table():
    text = RES.read_text().splitlines()
    i = next(k for k, l in enumerate(text) if l.strip().startswith("shape \\ d"))
    ds = [float(x) for x in text[i].split()[3:]]
    kw = [float(x) for x in text[i + 1].split()[2:]]
    rows = {l.split()[0]: [float(x) for x in l.split()[1:]] for l in text[i + 2:i + 6]}
    return ds, kw, rows


def _shape_cells():
    text = SHAPE.read_text().splitlines()
    i = next(k for k, l in enumerate(text) if l.strip().startswith("shape \\ idle"))
    return {l.split()[0]: [float(x) for x in l.split()[1:5]] for l in text[i + 1:i + 5]}


def test_d1_column_is_6u_casappa_idle_column():
    ds, _, rows = _table()
    k = ds.index(1.0)
    six_u = _shape_cells()
    for f in FAMS:
        assert abs(rows[f][k] - six_u[f][0]) < 1e-4      # Casappa idle at d = 1 is 6u's first column


def test_crossing_rises_with_drag_and_slopes_match_table():
    _, kw, rows = _table()
    np = pytest.importorskip("numpy")
    text = RES.read_text()
    for f in FAMS:
        assert all(b > a for a, b in zip(rows[f], rows[f][1:]))
        b = np.polyfit(kw, rows[f], 1)[0]
        printed = float(re.search(rf"^  {f}\s+[\d.]+\s+\+([\d.]+)", text, re.M).group(1))
        assert abs(b - printed) < 2e-4


def test_rule_errors_and_rms():
    text = RES.read_text()
    errs = [float(m.group(1)) for m in re.finditer(r"^  \w+/\w+\s+[\d.]+\s+[\d.]+\s+([+-][\d.]+)", text, re.M)]
    assert len(errs) == 16
    rms = (sum(e * e for e in errs) / 16) ** 0.5
    printed = float(re.search(r"RMS error: two-number ([\d.]+)", text).group(1))
    assert abs(rms - printed) < 2e-4
