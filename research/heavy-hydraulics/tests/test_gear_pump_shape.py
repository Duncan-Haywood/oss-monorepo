"""Milestone 6u: the shape-by-drag factorial's committed results are consistent with the committed sweeps they
generalise, and its crossing reader behaves on known cases."""
import re
import sys
from pathlib import Path

import pytest

EXP = Path(__file__).resolve().parents[1] / "experiments"
RES = EXP / "gear_pump_shape_results.txt"


def _cells():
    text = RES.read_text().splitlines()
    i = next(k for k, l in enumerate(text) if l.strip().startswith("shape \\ idle"))
    cells = {}
    for l in text[i + 1:i + 5]:
        f = l.split()
        cells[f[0]] = [float(x) for x in f[1:5]]
    return cells


def test_diagonal_cells_reproduce_committed_crossings():
    cells = _cells()
    fams = ("casappa", "danfoss", "marzocchi", "bench")
    committed = {"casappa": 0.8284, "danfoss": 0.8309, "marzocchi": 0.8188}
    for k, f in enumerate(fams[:3]):
        assert abs(cells[f][k] - committed[f]) < 0.002


def test_every_cell_is_near_the_pooled_curve_and_effects_add_up():
    cells = _cells()
    vals = [v for row in cells.values() for v in row]
    assert len(vals) == 16 and max(abs(v - 0.8212) for v in vals) <= 0.0143 + 1e-9
    text = RES.read_text()
    shape = float(re.search(r"shape main effect \(range of row means\) ([\d.]+)", text).group(1))
    drag = float(re.search(r"drag main effect \(range of column means\) ([\d.]+)", text).group(1))
    rows = [sum(r) / 4 for r in cells.values()]
    cols = [sum(r[k] for r in cells.values()) / 4 for k in range(4)]
    assert abs(shape - (max(rows) - min(rows))) < 2e-4 and abs(drag - (max(cols) - min(cols))) < 2e-4


def test_crossing_reader():
    pytest.importorskip("numpy")
    pytest.importorskip("h5py")
    sys.path.insert(0, str(EXP))
    import gear_pump_shape as gs
    assert abs(gs.crossing([0.80, 0.82], [40.0, 60.0]) - 0.81) < 1e-12
    assert gs.crossing([0.80, 0.82], [10.0, 20.0]) is None
    assert abs(gs.crossing([0.80, 0.81, 0.82], [40.0, 50.0, 70.0]) - 0.81) < 1e-12    # first point reaching 50


def test_shape_factorial_reproduces_committed_results(tmp_path):
    pytest.importorskip("numpy")
    pytest.importorskip("h5py")
    import os
    import subprocess
    cache = Path(os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
    if not cache.exists() or not any(cache.iterdir()):
        pytest.skip("excavator-motion cache not present (needs huggingface.co)")
    out = subprocess.run([sys.executable, str(EXP / "gear_pump_shape.py"), str(cache)], capture_output=True,
                         text=True, check=True).stdout
    assert out == RES.read_text()
