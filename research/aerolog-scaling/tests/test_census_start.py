import importlib.util
import math
import os

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


cs = _load("cs_test", "census_start.py")
gs = cs.gs

HUBS, RADII, SHARES = [(1050.0, 1050.0), (2750.0, 1650.0)], [1500.0, 1300.0], [0.6, 0.4]
SPEEDS = [15.0, 22.0]


def _flat(hubs, radii):
    out = {}
    for hub, r in zip(hubs, radii):
        for c in cs.lw.disc_cells(hub, r):
            out[c] = 1
    return out


def test_census_mass_sums_to_share_and_follows_counts():
    counts = {c: (5 if c[0] % 2 else 1) for c in cs.lw.disc_cells(HUBS[0], RADII[0])}
    m = cs.census_mass(HUBS[0], RADII[0], counts, 0.6)
    assert abs(sum(x for _, x in m) - 0.6) < 1e-12
    heavy = [x for p, x in m if int(p[0] // 100) % 2]
    light = [x for p, x in m if not int(p[0] // 100) % 2]
    assert abs(max(heavy) / max(light) - 5.0) < 1e-9


def test_flat_counts_match_uniform_start_closely():
    # a count of 1 in every disc cell is a uniform disc: the census start term must be close to 11u's start_u
    o = cs.pw.grid_bounds(HUBS, RADII)
    c, _ = cs.start_census(_flat(HUBS, RADII), HUBS, RADII, SPEEDS, SHARES, o)
    u, _ = gs.start_u(HUBS, RADII, SPEEDS, SHARES, o)
    a, b = sum(u["start"].values()), sum(c["start"].values())
    assert abs(b / a - 1) < 0.1, b / a


def test_census_equals_grid_start_on_list_at_cell_centres():
    # a destination list placed at the census cell centres, weighted by count, is the same input to 11u's start_g
    o = cs.pw.grid_bounds(HUBS, RADII)
    counts = {c: 1 + (c[0] * 7 + c[1] * 3) % 11 for c in _flat(HUBS, RADII)}
    mix = []
    for k, (hub, r) in enumerate(zip(HUBS, RADII)):
        for (x, y), w in cs.census_mass(hub, r, counts, SHARES[k]):
            mix.append((w, k, hub[0], hub[1], x, y))
    c, _ = cs.start_census(counts, HUBS, RADII, SPEEDS, SHARES, o)
    g, _ = gs.start_g(mix, HUBS, RADII, SPEEDS, SHARES, o)
    for k in set(c["start"]) | set(g["start"]):
        assert abs(c["start"].get(k, 0.0) - g["start"].get(k, 0.0)) < 1e-12 * max(1.0, abs(g["start"].get(k, 0.0)))


def test_start_census_scales_as_r_squared():
    o = cs.pw.grid_bounds(HUBS, RADII)
    f = _flat(HUBS, RADII)
    a = sum(cs.start_census(f, HUBS, RADII, SPEEDS, SHARES, o, R=50.0)[0]["start"].values())
    b = sum(cs.start_census(f, HUBS, RADII, SPEEDS, SHARES, o, R=100.0)[0]["start"].values())
    assert abs(b / a - 4.0) < 1e-9
