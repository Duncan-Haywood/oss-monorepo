import importlib.util
import math
import os

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


cb = _load("cb_test", "census_blend.py")
cs, gs, pw, lw = cb.cs, cb.gs, cb.pw, cb.cs.lw

HUBS, RADII, SHARES = [(1050.0, 1050.0), (2750.0, 1650.0), (1900.0, 2600.0)], [1500.0, 1300.0, 1100.0], [0.5, 0.3, 0.2]
SPEEDS = [15.0, 22.0, 18.0]


def _maps():
    cells = set()
    for hub, r in zip(HUBS, RADII):
        cells |= set(lw.disc_cells(hub, r))
    p = {c: 1 + (c[0] * 7 + c[1] * 3) % 11 for c in cells}
    j = {c: (c[0] * c[1]) % 5 for c in cells}           # some cells empty, as jobs maps are
    return p, j


def _direct_l(hub, r, cp, cj, a, origin):
    """l map of the mixture q = (1-a) q_p + a q_j, built from one destination list (tests linearity of density_dest)."""
    mixl = []
    for counts, wt in ((cp, 1 - a), (cj, a)):
        cells = [(c, counts[c]) for c in lw.disc_cells(hub, r) if counts.get(c, 0) > 0]
        tot = sum(n for _, n in cells)
        mixl += [(wt * n / tot, 0, hub[0], hub[1], (i + 0.5) * 100.0, (k + 0.5) * 100.0) for (i, k), n in cells if wt > 0]
    return pw.density_dest(mixl, 0, 1.0, origin)


def _direct_mass(hub, r, cp, cj, a, share):
    return [(pt, (1 - a) * m) for pt, m in cs.census_mass(hub, r, cp, share)] + \
           [(pt, a * m) for pt, m in cs.census_mass(hub, r, cj, share)]


def _close(d1, d2, tol=1e-9):
    for k in set(d1) | set(d2):
        x, y = d1.get(k, 0.0), d2.get(k, 0.0)
        assert abs(x - y) <= tol * max(1e-12, abs(y)), (k, x, y)


def test_bilinear_start_equals_direct_blend():
    cp, cj = _maps()
    o = pw.grid_bounds(HUBS, RADII)
    S, G, _, _ = cb.combos(cp, cj, HUBS, RADII, SPEEDS, SHARES, o)
    al, am = 0.7, 0.3
    lm = [_direct_l(HUBS[k], RADII[k], cp, cj, al, o) for k in range(3)]
    ms = [_direct_mass(HUBS[k], RADII[k], cp, cj, am, SHARES[k]) for k in range(3)]
    d = gs.grid_start(lm, ms, HUBS, SPEEDS, SHARES, o)
    _close(cb.start_blend(S, al, am), d["start"])
    h, dl = cb.start_parts(S, al, am)
    assert abs(h - d["hub"]) < 1e-9 * d["hub"] and abs(dl - d["deliv"]) < 1e-9 * d["deliv"]


def test_bilinear_gas_equals_direct_blend():
    cp, cj = _maps()
    o = pw.grid_bounds(HUBS, RADII)
    S, G, _, _ = cb.combos(cp, cj, HUBS, RADII, SPEEDS, SHARES, o)
    b = 0.4
    lm = [_direct_l(HUBS[k], RADII[k], cp, cj, b, o) for k in range(3)]
    _close(cb.gas_blend(G, b), pw.gas_weights(lm, HUBS, SPEEDS, SHARES, o))


def test_endpoints_are_the_single_maps():
    cp, cj = _maps()
    o = pw.grid_bounds(HUBS, RADII)
    S, G, _, _ = cb.combos(cp, cj, HUBS, RADII, SPEEDS, SHARES, o)
    _close(cb.start_blend(S, 0.0, 0.0), cs.start_census(cp, HUBS, RADII, SPEEDS, SHARES, o)[0]["start"])
    _close(cb.start_blend(S, 1.0, 1.0), cs.start_census(cj, HUBS, RADII, SPEEDS, SHARES, o)[0]["start"])


def test_fit_grid_recovers_a_known_blend():
    # totals linear in a with the target at a = 0.37 on every layout: the grid fit must return 0.37
    tot = {n: {("p", "p"): 1.0 + n, ("p", "j"): 1.5 + n, ("j", "p"): 1.5 + n, ("j", "j"): 2.0 + n} for n in range(5)}
    a0 = 0.37
    tgt = {n: sum(cb.w(x, a0) * cb.w(y, a0) * tot[n][(x, y)] for x, y in cb.XY) for n in range(5)}
    assert cb.fit_grid(tot, tgt, range(5)) == (a0, a0)
    al, am = cb.fit_grid(tot, tgt, range(5), two=True)
    assert all(abs(math.log(sum(cb.w(x, al) * cb.w(y, am) * tot[n][(x, y)] for x, y in cb.XY) / tgt[n])) < 1e-9
               for n in range(5))


def test_fit_scale():
    v, t = {0: 2.0, 1: 4.0}, {0: 1.0, 1: 8.0}
    assert abs(cb.fit_scale(v, t, [0, 1]) - 1.0) < 1e-12
