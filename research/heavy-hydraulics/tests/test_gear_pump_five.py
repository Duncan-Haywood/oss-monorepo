"""Milestone 6x: the five-family factorial agrees with 6u and 6w where they overlap, and the printed rule fits and
leave-one-family-out errors follow from the printed 25-cell table."""
import re
from pathlib import Path

import pytest

EXP = Path(__file__).resolve().parents[1] / "experiments"
RES = EXP / "gear_pump_five_results.txt"
SHAPE = EXP / "gear_pump_shape_results.txt"
FAMS = ("casappa", "danfoss", "marzocchi", "bench", "rexroth")


def _parse():
    text = RES.read_text().splitlines()
    i = next(k for k, l in enumerate(text) if l.strip().startswith("family     index 2"))
    fam = {l.split()[0]: [float(x) for x in l.split()[1:4]] for l in text[i + 1:i + 6]}
    j = next(k for k, l in enumerate(text) if l.strip().startswith("shape \\ idle"))
    cells = {}
    for l in text[j + 1:j + 6]:
        f = l.split()
        for g, v in zip(FAMS, f[1:6]):
            cells[(f[0], g)] = float(v)
    kw = {f: v[2] for f, v in fam.items()}
    ks = {f: v[1] for f, v in fam.items()}
    return cells, kw, ks


def _fit(np, cells, kw, ks, which):
    keys = list(cells)
    cols = [np.ones(len(keys))]
    if which >= 2:
        cols.append([kw[g] for _, g in keys])
    if which >= 3:
        cols.append([ks[f] for f, _ in keys])
    beta, *_ = np.linalg.lstsq(np.column_stack(cols), np.array([cells[c] for c in keys]), rcond=None)
    return beta


def _pred(beta, kw_g, k_f):
    return sum(b * x for b, x in zip(beta, [1.0, kw_g, k_f]))


def test_old_cells_match_6u_and_azpg_matches_6w():
    cells, _, _ = _parse()
    text = SHAPE.read_text().splitlines()
    i = next(k for k, l in enumerate(text) if l.strip().startswith("shape \\ idle"))
    for l in text[i + 1:i + 5]:
        f = l.split()
        for g, v in zip(FAMS[:4], f[1:5]):
            assert abs(cells[(f[0], g)] - float(v)) < 1e-4
    assert abs(cells[("rexroth", "rexroth")] - 0.8040) < 1e-4


def test_full_fits_follow_from_table():
    np = pytest.importorskip("numpy")
    cells, kw, ks = _parse()
    text = RES.read_text()
    b2 = _fit(np, cells, kw, ks, 2)
    m = re.search(r"two-number   a ([\d.]+), b \+([\d.]+) per kW", text)
    # the table and idle kW are printed rounded, so the refit agrees to rounding
    assert abs(b2[0] - float(m.group(1))) < 0.002 and abs(b2[1] - float(m.group(2))) < 5e-4
    at = float(re.search(r"two-number fit at 3.57 kW: ([\d.]+)", text).group(1))
    assert abs(_pred(b2, 3.57, 0.0) - at) < 3e-4


def test_leave_one_family_out_errors_follow_from_table():
    np = pytest.importorskip("numpy")
    cells, kw, ks = _parse()
    text = RES.read_text()
    diag = {w: [] for w in (1, 2, 3)}
    for h in FAMS:
        m = re.search(rf"^  {h}\s+[\d.]+\s+([+-][\d.]+)\s+([+-][\d.]+)\s+([+-][\d.]+)", text, re.M)
        train = {c: v for c, v in cells.items() if h not in c}
        for w in (1, 2, 3):
            e = cells[(h, h)] - _pred(_fit(np, train, kw, ks, w), kw[h], ks[h])
            assert abs(e - float(m.group(w))) < 1e-3
            diag[w].append(e)
    r = {w: float(np.sqrt(np.mean(np.square(diag[w])))) for w in diag}
    # the headline: held out, the drag rule is about four times as accurate as one number
    assert r[2] < r[1] / 3
    assert max(abs(e) for e in diag[2]) < 0.005


def test_drag_dominates_shape():
    cells, kw, _ = _parse()
    rm = [sum(cells[(f, g)] for g in FAMS) / 5 for f in FAMS]
    cm = [sum(cells[(f, g)] for f in FAMS) / 5 for g in FAMS]
    assert max(cm) - min(cm) > 1.5 * (max(rm) - min(rm))
    # every shape's crossing falls from the highest-drag column to the lowest-drag one
    hi, lo = max(kw, key=kw.get), min(kw, key=kw.get)
    assert all(cells[(f, hi)] > cells[(f, lo)] for f in FAMS)
