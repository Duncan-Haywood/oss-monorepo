"""Milestone 11ah: altitude bands under a fixed altitude budget (the 400 ft ceiling), 12 and 16 operators. How many
bands fit, what the vertical separation costs in conflicts, and whether bands can be added to a running plan one at a
time instead of re-planning.

Why. 11ag's "Next" (and 11af's). 11ag charged bands for the climbs and descents through them and found the optimum
uses a median 10 of 12 and 13 of 16 bands at tau = 5 s per layer, but it let the count run free: nothing capped the
height of the stack, and tau was swept, not tied to a layer spacing. A real stack lives between a floor (obstacles)
and a ceiling: for small drones in the US, 14 CFR 107.51(b), "cannot be higher than 400 feet above ground level"
(121.9 m; the structure exception is not modelled). The number of bands and the time a transit spends in each layer
then both follow from two figures a regulator sets: the vertical spacing h between layer levels and the usable depth
H between the lowest and highest level.

Model. 11ag's, unchanged (band_cost.py: F(labels) = sum W_ij [same band] + sum V_ij [j below i], W = cf_D+'s
en-route weights, V = tau A + B the transit charge; straight legs, Poisson launches at Lambda = 240/h, R = 50 m, no
avoidance or wind; same 48 layouts, 1200..1223 at M = 12 and 1600..1623 at M = 16). New: the budget.
 * A band is two layer levels (semicircular rule), so k bands need 2k levels spaced h apart: (2k - 1) h <= H, i.e.
   k_cap(H, h) = floor((H / h + 1) / 2), at most M. Where not even two levels fit (H < h) the stack is one band.
 * A transit through a level spends tau = h / w there, w the vertical speed. Climbs and descents are equally many
   (each flight climbs and descends once at its hub and once at its destination), so tau = h (1/w_up + 1/w_down) / 2.
Parameters (sourced): h = 7.62 m (25 ft, the layer spacing of Doole, Ellerbroek, Knoop and Hoekstra's layered urban
airspace, Aerospace 8(2):38, 2021, doi:10.3390/aerospace8020038, as 11af used it; attribution corrected 2026-11-23 from
search excerpts, full text not opened), and 15.24 m and 30.48 m (50 and 100 ft) as more
conservative separations; w_up = 5 m/s and w_down = 4 m/s (DJI Matrice 300 RTK, P mode, DJI's support page), so
tau = 0.225 h s/m: 1.71 s, 3.43 s, 6.86 s. H swept over 30, 60, 90 and 120 m (no source fixes the floor of an urban
delivery stack; 120 m is the whole 400 ft column above a floor at about 2 m, 30 m a stack squeezed above 90 m
rooftops).

A consequence of the form, stated before the run: for any fixed labelling F is non-decreasing in tau (A >= 0), and
k_cap is non-increasing in h, so in this model the thinnest spacing is always best for conflicts; spreading a fixed
number of bands over the whole depth only lengthens every transit. The trade-off against h is safety (altitude-keeping
error, wake, sensor noise), which the model does not price. The results are therefore the conflict price of a
separation standard, read off a (H, h) table, not an optimum h.

Searches. Best of 200 random-restart single-move descents over band positions (band_cost.search_bands, as 11ag) at
k = k_cap, and at k = M ("free", 11ag's count) for the loss of the cap. Growing a plan: start from the best one-band
plan; at each step try inserting an empty band at every slot 0..k (operators above the slot move up one position),
run one single-move descent from each with k + 1 positions, keep the best (insert_band below), and repeat up to the
cap. Compared at each k with the 200-restart re-plan at the same k; operators that changed band relative to the
previous step's plan (after the slot shift) are counted as moves.

Checks and predictions (written and committed before any capped search was run on a layout; the per-layout inputs
W, A and B are 11ag's, recomputed unchanged by band_budget_run.py --build, which was started before this text was
written, and 11ag's results with an uncapped count at tau = 0, 2, 5, 10, 20 s were known; only the unit tests, on
synthetic operators, had run against the new code):
 P1 The cap is slack at the sourced spacing: at H = 120 m, h = 7.62 m (k_cap = 8, tau = 1.71 s) the median over
    layouts of F(k_cap) / F(free) is <= 1.01 at both M.
 P2 Half the column costs real conflicts: at H = 60 m, h = 7.62 m (k_cap = 4) that median is between 1.10 and 1.40
    at both M.
 P3 A 100 ft spacing gives back most of what bands buy: at H = 120 m, h = 30.48 m (k_cap = 2, tau = 6.86 s) the
    median F(k_cap) / F_1 is >= 0.45 at both M (F_1 = one band, all en-route weight shared, no transit).
 P4 Halving the spacing pays: at H = 120 m, going from h = 15.24 m (k_cap = 4) to 7.62 m (k_cap = 8) lowers the
    median best F by 20% to 40% at both M.
 P5 Bands can be added one at a time: at h = 7.62 m, growing from one band to 8 by insertions stays within 2% of
    the re-plan (mean F_insert / F_replan <= 1.02) at every k from 2 to 8, at both M.
 Reported without a prediction: the whole (H, h) table of k_cap, F / F_1 and F / F_free; operators moved per
 insertion; how often the inserted band goes on top.
Preliminary.
"""
import math

import numpy as np

CEILING_M = 400 * 0.3048            # 14 CFR 107.51(b)
W_UP, W_DOWN = 5.0, 4.0             # DJI Matrice 300 RTK, P mode, m/s
SPACINGS = (7.62, 15.24, 30.48)     # 25, 50, 100 ft
DEPTHS = (30.0, 60.0, 90.0, 120.0)


def k_cap(H, h, m=None):
    """Bands that fit: 2k levels spaced h apart need (2k - 1) h <= H. At least 1, at most m."""
    k = max(1, int(math.floor((H / h + 1.0) / 2.0 + 1e-9)))
    return k if m is None else min(k, m)


def tau_of(h, w_up=W_UP, w_down=W_DOWN):
    """Mean time per level crossed: half the transits climb, half descend."""
    return 0.5 * h * (1.0 / w_up + 1.0 / w_down)


def insert_slot(labels, slot):
    """Open an empty band at position `slot` (0 = lowest): operators at or above it move up one."""
    return tuple(x + 1 if x >= slot else x for x in labels)


def insert_band(bc, W, V, labels):
    """Grow a plan by one band: for each slot, open it and run one single-move descent with k + 1 positions.
    Returns (labels, F, slot, moved), labels compacted; moved counts operators whose band differs from the slotted
    start. If no descent uses the new band the plan keeps k bands."""
    k = max(labels) + 1
    best = None
    for s in range(k + 1):
        start = insert_slot(labels, s)
        lab = bc.descend_bands(W, V, start, k + 1)
        F = float(bc.score(W, V, lab))
        moved = sum(a != b for a, b in zip(lab, start))
        key = (F, s)
        if best is None or key < best[0]:
            best = (key, bc.compact(lab), s, moved)
    (F, _), lab, s, moved = best
    return lab, F, s, moved


def grow(bc, W, V, kmax, restarts=200):
    """Best one-band plan, then insert_band up to kmax. Returns {k: (labels, F, slot, moved)}."""
    m = W.shape[0]
    lab = tuple([0] * m)
    out = {1: (lab, float(bc.score(W, V, lab)), None, 0)}
    for k in range(2, kmax + 1):
        lab, F, s, moved = insert_band(bc, W, V, out[k - 1][0])
        out[k] = (lab, F, s, moved)
    return out
