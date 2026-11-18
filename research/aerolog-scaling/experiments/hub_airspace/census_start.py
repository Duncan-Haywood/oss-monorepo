"""Milestone 11v: the start term on census maps. 11u's small-R start term, G_A(x) ~ pi R^2 s_A l_A(x) / v_A on the
100 m grid, with each operator's destinations drawn from 11j's public census maps (2020 residents, LODES 2022 jobs, and
residents plus jobs) instead of the operator's own destination list; added to 11j's census flux weights.

Why. 11u's first "Next": does the start term on 11j's residents-plus-jobs maps bring a census-only paper weight to the
exact level? 11u found the start term on the real destination list within 0.7% of 11t's exact term and the paper level
at 1.01 of the exact estimator, but on uniform discs (census-only, no demand map) the start term was 0.44 of exact,
the same factor-of-two shortfall as the uniform flux term. 11j's census maps raised the flux level from 0.54 of the
closed form (uniform) to 0.81 (residents), 1.01 (jobs) and 0.94 (residents plus jobs). A planner with no traffic
record has only these maps, so the question is whether the start term follows the flux term to the right level.

Versions (all from public data: hub sites, radii, speeds, shares and nyc_demand_100m.json; nothing from the pickups).
  start_p, start_j, start_pj   l_A from demand_weights.density_weighted on 11j's map (rays to each census cell's
           centre, 25 m steps, weights in proportion to the cell's count inside A's disc); B's delivery mass s_B
           spread over the census cells of B's disc in proportion to their counts. The hub part is 11u's (A's map
           looked up at B's hub cell).
  gas_c+ = gas_c + start_c (en-route part, cross-operator pairs only), c in p, j, pj; gas_c is 11j's flux weight.
Reproduction checks: start_g, gas_d and gas_d+ (11u's) are recomputed and must match 11u's results file.

Layouts and references as 11u: 11g's 24 random layouts, semi, R = 50 m, Lambda = 240/h; 11t's exact start term
(start_term.start_terms) and 11s's exact estimator (steiner_bias.estimate, 400,000 ordered pairs, seeds 110000 + idx).

Experiments.
 E1 start_c against 11t's exact cross-operator start term (both zones): pooled ratio, per-layout ratios, Pearson r over
    the 28 cross pairs, hub and delivery parts separately.
 E2 Level: cross-operator en-route totals of gas_c and gas_c+ against the exact estimator.
 E3 Splits: each weight's best two-layer split (127 bipartitions) scored on the pooled exact weights, ratio to cf+'s.
 E4 Does a layout's start-term level error follow its flux level error? Pearson r over the 24 layouts between
    start_c / exact start and gas_c / gas_d (the census flux level relative to the list's).
 E5 CPU seconds per layout for start_c (including rasterising the census map).

Predictions (written and committed before the experiment ran; before committing, only the unit tests in
tests/test_census_start.py had run, on synthetic operators and synthetic count maps; no layout was evaluated):
 (1) E1: pooled start_pj / exact in [0.70, 1.00]: residents plus jobs concentrate demand as the real list does, but
     less, so the level rises from start_u's 0.44 and stays below 1 (11j's gas_pj flux was 0.94 of cf) (prior 60%).
 (2) E1: start_j has the highest pooled level of the three and start_p the lowest, the order of 11j's flux levels
     (gas_j 1.012, gas_pj 0.937, gas_p 0.808 of cf) (prior 65%).
 (3) E1: median per-layout Pearson r(start_pj, exact) over the 28 cross pairs >= 0.95 (start_u: 0.91) (prior 60%).
 (4) E2: median gas_pj+ / exact in [0.88, 0.98]: the level rises by about the start term's share but does not reach
     1, because gas_pj's own flux level (about 0.87 of exact) is the larger error (prior 55%).
 (5) E2: gas_pj+ within 5% of exact in at most 12 of 24 layouts (gas_d+: 22) (prior 65%).
 (6) E3: adding the start term changes gas_pj's split in at most 3 of 24 layouts, and the mean score ratio moves by
     at most 0.005 (11u: the start term moved no gas_d split, one gas_u split) (prior 75%).
 (7) E4: Pearson r(start_pj / exact start, gas_pj / gas_d) over the 24 layouts >= 0.5: a layout whose census map
     misses the flux level misses the start level the same way (prior 55%).
 (8) E5: start_pj under 3 s of CPU per layout (11u's start_g: 2.71 s) (prior 75%).
Reproduction (not a prediction): start_g, gas_d and gas_d+ columns equal 11u's to the printed digits.
Preliminary.

    python3 census_start_run.py > census_start_results.txt
"""
import importlib.util
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


gs = _load("hub_airspace_grid_start_11v", "grid_start.py")
dw = _load("hub_airspace_demand_weights_11v", "demand_weights.py")
lw = dw.lw
pw = gs.pw
H = gs.H
MAPS = (("p", "pop"), ("j", "jobs"), ("pj", "pj"))


def census_mass(hub, r, counts, share, h=H):
    """[(point, mass)] spreading share over the census cells inside the disc (hub, r) in proportion to their counts.

    Cells and their centres are on the global 100 m grid, as demand_weights.density_weighted's rays."""
    cells = [(c, counts[c]) for c in lw.disc_cells(hub, r, h) if counts.get(c, 0) > 0]
    tot = float(sum(n for _, n in cells))
    return [(((i + 0.5) * h, (j + 0.5) * h), share * n / tot) for (i, j), n in cells]


def start_census(counts, hubs, radii, speeds, shares, origin=None, R=50.0):
    """11u's grid start term with destinations from a census count map. Returns (grid_start result, lmaps)."""
    origin = origin or pw.grid_bounds(hubs, radii)
    m = len(hubs)
    lm = [dw.density_weighted(hubs[k], radii[k], counts, origin)[0] for k in range(m)]
    ms = [census_mass(hubs[k], radii[k], counts, shares[k]) for k in range(m)]
    return gs.grid_start(lm, ms, hubs, speeds, shares, origin, R=R), lm
