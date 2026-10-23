"""Interval estimators for a group gap (prevalence in group A minus group B) when the hand-coded audit is
stratified by the coder's label and only a handful of items fall on the coder-negative side.

Each group g has two strata s (coder-negative, coder-positive) with known size N_gs, so the group prevalence is
p_g = sum_s (N_gs / N_g) * p_gs, and the gap is p_A - p_B. An audit gives x_gs positives out of n_gs hand-coded
items in cell (g, s); with a small negative stratum a cell can hold 0 to 3 items. Each estimator takes
cells = {(g, s): (N_gs, x_gs, n_gs)} and returns (low, high, point):

  wald       p_gs = x/n, var from sample variances; a cell with n = 0 contributes p = 0 and no variance
             (the naive reading of qual-negaudit's interval)
  plus_two   add one success and one failure to every cell, then Wald (defined for n = 0)
  jeffreys   Beta(x + 1/2, n - x + 1/2) posterior per cell (Beta(1/2, 1/2) for n = 0), equal-tailed 95% interval
             of the gap from posterior draws
  pooled     as jeffreys, but the two groups share one posterior for the negative stratum (their negative cells
             pooled), which assumes the coder's miss rate does not depend on the group

Stdlib only. Builds on ../qual-negint (the single-prevalence versions).
"""
import math

Z95 = 1.959964
GROUPS = ("A", "B")
STRATA = ("neg", "pos")


def _weights(cells):
    tot = {g: sum(cells[g, s][0] for s in STRATA) for g in GROUPS}
    return {(g, s): cells[g, s][0] / tot[g] for g in GROUPS for s in STRATA}


def _wald_gap(cells, adj):
    w = _weights(cells)
    est = var = 0.0
    for g, sign in (("A", 1), ("B", -1)):
        for s in STRATA:
            _, x, n = cells[g, s]
            x, n = x + adj, n + 2 * adj
            if n == 0:
                continue
            p = x / n
            est += sign * w[g, s] * p
            var += w[g, s] ** 2 * p * (1 - p) / n
    h = Z95 * math.sqrt(var)
    return est - h, est + h, est


def wald(cells):
    return _wald_gap(cells, 0)


def plus_two(cells):
    return _wald_gap(cells, 1)


def _quantiles(vals):
    vals.sort()
    d = len(vals)
    return vals[int(0.025 * d)], vals[min(d - 1, int(0.975 * d))], sum(vals) / d


def jeffreys(cells, rng, draws=400):
    w = _weights(cells)
    out = []
    for _ in range(draws):
        gap = 0.0
        for g, sign in (("A", 1), ("B", -1)):
            for s in STRATA:
                _, x, n = cells[g, s]
                gap += sign * w[g, s] * rng.betavariate(x + 0.5, n - x + 0.5)
        out.append(gap)
    return _quantiles(out)


def pooled(cells, rng, draws=400):
    w = _weights(cells)
    xn = sum(cells[g, "neg"][1] for g in GROUPS)
    nn = sum(cells[g, "neg"][2] for g in GROUPS)
    out = []
    for _ in range(draws):
        p_neg = rng.betavariate(xn + 0.5, nn - xn + 0.5)
        gap = 0.0
        for g, sign in (("A", 1), ("B", -1)):
            _, x, n = cells[g, "pos"]
            gap += sign * (w[g, "neg"] * p_neg + w[g, "pos"] * rng.betavariate(x + 0.5, n - x + 0.5))
        out.append(gap)
    return _quantiles(out)


def cells_from_audit(human, group, neg, pos, audit_neg, audit_pos):
    """Cell tuples from the coder's strata (index lists) and the audited indices of each stratum."""
    cells = {}
    for s, members, audited in (("neg", neg, audit_neg), ("pos", pos, audit_pos)):
        for g in GROUPS:
            big = sum(1 for i in members if group[i] == g)
            got = [i for i in audited if group[i] == g]
            cells[g, s] = (big, sum(human[i] for i in got), len(got))
    return cells


def true_gap(human, group):
    pa = [h for h, g in zip(human, group) if g == "A"]
    pb = [h for h, g in zip(human, group) if g == "B"]
    return sum(pa) / len(pa) - sum(pb) / len(pb)
