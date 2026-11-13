import importlib.util
import math
import pathlib

_d = pathlib.Path(__file__).resolve().parents[1] / "experiments" / "hub_airspace"
_s = importlib.util.spec_from_file_location("hub_airspace_land_weights", _d / "land_weights.py")
lw = importlib.util.module_from_spec(_s)
_s.loader.exec_module(lw)
pw = lw.pw


def test_unmasked_cells_reproduce_uniform_disc_field():
    hub, r, origin = (50.0, 50.0), 2500.0, (-3000.0, -3000.0)
    cells, n = lw.density_cells(hub, r, None, origin)
    ana = pw.density_uniform(hub, r, origin)
    keys = [c for c in ana if math.hypot(origin[0] + (c[0] + 0.5) * 100 - hub[0], origin[1] + (c[1] + 0.5) * 100 - hub[1]) > 400]
    a = [ana[c] for c in keys]
    b = [cells.get(c, 0.0) for c in keys]
    assert pw.gp.pearson(a, b) > 0.98
    assert abs(sum(b) / sum(a) - 1) < 0.05
    assert n == len(lw.disc_cells(hub, r))


def test_mask_restricts_destinations_to_its_cells():
    hub, origin = (50.0, 50.0), (-3000.0, -3000.0)
    east = {(i, j) for i in range(0, 30) for j in range(-30, 30)}
    lm, n = lw.density_cells(hub, 2500.0, east, origin)
    assert 0 < n < len(lw.disc_cells(hub, 2500.0))
    # every ray starts at the hub and ends in the eastern half, so no path west of the hub's cell
    assert all(origin[0] + (c[0] + 1) * 100 > 0 for c in lm)
    mean_len = sum(lm.values()) * 100 * 100
    assert 0.5 * 2500 < mean_len < 2500


def test_land_mask_holds_most_destinations():
    land = lw.load_land()
    pts = lw.rl.load_nyc(10000.0)
    on = sum((math.floor(x / 100), math.floor(y / 100)) in land for x, y in pts)
    assert on / len(pts) > 0.97
    win = lw.window_cells()
    assert land <= win
