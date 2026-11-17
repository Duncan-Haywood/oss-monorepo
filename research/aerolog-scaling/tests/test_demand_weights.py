import importlib.util
import json
import pathlib

_d = pathlib.Path(__file__).resolve().parents[1] / "experiments" / "hub_airspace"
_s = importlib.util.spec_from_file_location("hub_airspace_demand_weights", _d / "demand_weights.py")
dw = importlib.util.module_from_spec(_s)
_s.loader.exec_module(dw)
lw, pw = dw.lw, dw.pw


def test_equal_counts_on_land_reproduce_land_mask_field():
    hub, r, origin = (50.0, 50.0), 2500.0, (-3000.0, -3000.0)
    land = lw.load_land()
    a, n = lw.density_cells(hub, r, land, origin)
    b, tot = dw.density_weighted(hub, r, {c: 7 for c in land}, origin)
    assert tot == 7 * n
    assert set(a) == set(b)
    assert all(abs(a[c] - b[c]) < 1e-12 for c in a)


def test_weights_move_paths_toward_heavy_cells():
    hub, origin = (50.0, 50.0), (-3000.0, -3000.0)
    counts = {(20, 0): 99, (-20, 0): 1}
    m, tot = dw.density_weighted(hub, 2500.0, counts, origin)
    assert tot == 100
    east = sum(v for c, v in m.items() if origin[0] + (c[0] + 0.5) * 100 > 100)
    west = sum(v for c, v in m.items() if origin[0] + (c[0] + 0.5) * 100 < 0)
    assert 50 < east / west < 200


def test_demand_file_totals_and_window():
    d = json.load(open(_d / "nyc_demand_100m.json"))
    assert d["_pop_nyc"] == 8804190  # 2020 Census, New York City
    assert sum(d["pop"].values()) == d["_pop_window"]
    assert sum(d["jobs"].values()) == d["_jobs_window"]
    dem = dw.load_demand()
    win = lw.window_cells()
    assert set(dem["pop"]) <= win and set(dem["jobs"]) <= win
    assert sum(dem["pj"].values()) == d["_pop_window"] + d["_jobs_window"]
