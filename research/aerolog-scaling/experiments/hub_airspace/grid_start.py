"""Milestone 11u: the start term on paper. 11t's exact start term in its small-R form, G_A(x) ~ pi R^2 s_A l_A(x) / v_A,
evaluated on 11h's 100 m paper-weight grids, from the destination list (start_g) and from census-only uniform service
discs (start_u); added to 11h's gas weights to give paper weights with a start term (gas_d+, gas_u+).

Why. 11t computed the closed form's missing start term exactly from hub sites and destination lists: per unordered
operator pair {A, B}, lam^2 3600 [S(A <- B) + S(B <- A)] with S(A <- B) = sum_b w_b [G_A(h_B) + G_A(x_b)] and G_A(x) the
expected time a random flight of A (share-weighted) spends within R of x on one leg. It is exact but costs 33 s per
layout in pure Python, 5x the sampled estimate, and it needs the destination list. 11t's first "Next": the small-R
form, which 11h's paper weights already compute on a grid, giving census-only paper weights a start term.

Small-R form. Let l_A(x) be 11h's one-leg path length per unit area per flight of A (1/m; paper_weights.density_*).
Integrated over the R-disc about x, s_A l_A is the share-weighted expected one-leg length within R of x, so
G_A(x) = pi R^2 s_A lbar_A(x) / v_A exactly, with lbar the disc average; the grid replaces the disc average by the
100 m cell value. The approximation is good where l_A is smooth on the 100 m scale. It fails at A's hub (l ~ 1/rho)
and at A's own destinations (rays end there: 11t's coincident-point part, 0.64% of the delivery term, linear in R).

Versions.
  start_g  destination list: l_A from paper_weights.density_dest (rays rasterised every 25 m); the delivery part
           loops over B's destinations x_b (weights w_b) and looks up l_A in x_b's cell; the hub part looks up h_B's.
  start_u  census only (hub sites, radii, speeds, shares): l_A from paper_weights.density_uniform; B's destinations
           uniform over the cells of its disc (mass s_B spread evenly over the cells whose centres lie inside).
Zone (11t's label): terminal if 0.5 (|x - h_A| + rb) < R_TERM, with rb B's hub radius at x (0 for hub launches).
  gas_d+ = gas_d + start_g,  gas_u+ = gas_u + start_u  (cross-operator weights only, as 11h's gas weights).

Layouts and references: 11g's 24 random layouts (random_layouts.py), semi base rule, R = 50 m, Lambda = 240/h. The
exact start term is 11t's start_term.start_terms. The exact estimator is 11s's steiner_bias.estimate with 11t's seeds
(110000 + layout, 400,000 ordered pairs in 10 batches), so its numbers must match 11t's results file.

Experiments (R = 50 m).
 E1 start_g against 11t's exact start term: pooled cross ratio (both zones), per-layout ratios, Pearson r of the 28
    cross pair weights (both zones summed), separately for the hub and delivery parts.
 E2 start_u against 11t's exact start term, the same statistics.
 E3 Level: cross-operator en-route totals of gas_d, gas_d+, gas_u and gas_u+ against the exact estimator's.
 E4 Splits: each weight's best two-layer split (max over 11h's 127 bipartitions), scored on the pooled exact weights,
    as a ratio to the score of cf+'s split (11t: cf + exact start, the best paper-free split so far).
 E5 CPU seconds per layout for start_g and start_u against 11t's exact start term.

Predictions (written and committed before the experiment ran; before committing, only the unit tests in
tests/test_grid_start.py had run, on synthetic operators; no layout was evaluated):
 (1) E1: pooled start_g / exact within 3%, and per-layout ratio within 5% in >= 22 of 24 (prior 70%).
 (2) E1: Pearson r(start_g, exact) over the 28 cross pairs >= 0.99 in >= 22 of 24 (prior 70%).
 (3) E2: pooled start_u / exact in [0.4, 0.8], below 1 as 11h's gas_u flux level was (median 0.54 of cf), because
     uniform discs spread demand that the real list concentrates (prior 55%).
 (4) E3: gas_d+ / exact (en-route, cross) within 5% in >= 20 of 24 layouts, against gas_d / exact within 5% in
     <= 6 of 24 (gas_d is the flux term, about 7% low) (prior 60%).
 (5) E4: gas_d+'s split scores within 0.5% of cf+'s in >= 22 of 24 (prior 80%).
 (6) E4: adding the start term does not hurt census-only splits: mean score ratio of gas_u+'s split <= that of
     gas_u's split (prior 55%), and the two splits are the same in >= 16 of 24 (prior 60%).
 (7) E5: start_g and start_u each take under 1 s of CPU per layout, against 11t's 33 s (prior 85%).
Preliminary.

    python3 grid_start_run.py > grid_start_results.txt
"""
import importlib.util
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


pw = _load("hub_airspace_paper_weights_11u", "paper_weights.py")
gp = pw.gp
H = pw.H
R_TERM = gp.R_TERM


def _cell(x, origin, h=H):
    return int(math.floor((x[0] - origin[0]) / h)), int(math.floor((x[1] - origin[1]) / h))


def _centre(c, origin, h=H):
    return origin[0] + (c[0] + 0.5) * h, origin[1] + (c[1] + 0.5) * h


def uniform_mass(hub, r, origin, share, h=H):
    """[(point, mass)] spreading share evenly over the cells whose centres lie inside the disc (hub, r)."""
    cells = list(pw.density_uniform(hub, r, origin, h))
    m = share / len(cells)
    return [(_centre(c, origin, h), m) for c in cells]


def dest_mass(mix, op):
    """[(point, w)] for operator op's destinations (share-weighted, as in the mix)."""
    return [((x, y), w) for w, j, _, _, x, y in mix if j == op]


def grid_start(lmaps, masses, hubs, speeds, shares, origin, lam_h=pw.LAM, R=50.0, h=H):
    """Small-R start term per unordered cross pair and zone, conflicts per hour (11t's units).

    lmaps[k]: {cell: l} per flight of operator k; masses[k]: [(point, mass)] of k's delivery points.
    Returns {'start': {(i, j, zone): x}, 'hub': pooled hub-launch part, 'deliv': pooled delivery part}.
    """
    lam = lam_h / 3600.0
    sc = lam * lam * 3600.0
    disc = math.pi * R * R
    start = {}
    parts = {"hub": 0.0, "deliv": 0.0}
    m = len(hubs)

    def add(k, x):
        if x:
            start[k] = start.get(k, 0.0) + x
    for B in range(m):
        cells_b = [(p, mb, _cell(p, origin, h)) for p, mb in masses[B]]
        for A in range(m):
            if A == B:
                continue
            la, ha, fa = lmaps[A], hubs[A], disc * shares[A] / speeds[A]
            key = gp.key(A, B)
            g = fa * la.get(_cell(hubs[B], origin, h), 0.0)
            z = "term" if 0.5 * math.dist(hubs[B], ha) < R_TERM else "enr"
            add(key + (z,), sc * shares[B] * g)
            parts["hub"] += sc * shares[B] * g
            for p, mb, c in cells_b:
                l = la.get(c)
                if not l:
                    continue
                g = sc * mb * fa * l
                z = "term" if 0.5 * (math.dist(p, ha) + math.dist(p, hubs[B])) < R_TERM else "enr"
                add(key + (z,), g)
                parts["deliv"] += g
    return {"start": start, **parts}


def start_g(mix, hubs, radii, speeds, shares, origin=None, R=50.0):
    origin = origin or pw.grid_bounds(hubs, radii)
    m = len(hubs)
    lm = [pw.density_dest(mix, k, shares[k], origin) for k in range(m)]
    return grid_start(lm, [dest_mass(mix, k) for k in range(m)], hubs, speeds, shares, origin, R=R), lm


def start_u(hubs, radii, speeds, shares, origin=None, R=50.0):
    origin = origin or pw.grid_bounds(hubs, radii)
    m = len(hubs)
    lm = [pw.density_uniform(hubs[k], radii[k], origin) for k in range(m)]
    ms = [uniform_mass(hubs[k], radii[k], origin, shares[k]) for k in range(m)]
    return grid_start(lm, ms, hubs, speeds, shares, origin, R=R), lm


def plus(gas, start):
    """gas weights (cross, en-route) plus the start term's en-route part."""
    out = dict(gas)
    for (i, j, z), x in start.items():
        if z == "enr":
            out[(i, j, z)] = out.get((i, j, z), 0.0) + x
    return out
