"""Posterior arithmetic over the ledger: exact posteriors, box bounds, variance shares,
flip thresholds and a dependence discount.  Stdlib only."""
import math
import random

from ledger import CHRISTIAN, HYPOTHESES, ITEMS, PRIOR_DEFAULT, THEISM


def prior_vector(theism, christian_given_theism, within):
    p = {"N": 1 - theism, "T_other": theism * (1 - christian_given_theism)}
    s = sum(within.values())
    for h in CHRISTIAN:
        p[h] = theism * christian_given_theism * within[h] / s
    return p


def posterior(prior, log_lrs, items=ITEMS, rho=1.0):
    """prior: {h: p}; log_lrs: {item id: log10 LR}; rho in (0, 1] scales every log LR
    (rho < 1 is a crude discount for dependence between items)."""
    logp = {h: math.log10(prior[h]) if prior[h] > 0 else -math.inf for h in HYPOTHESES}
    for it in items:
        x = log_lrs[it["id"]] * rho
        for h in it["favours"]:
            logp[h] += x
    m = max(logp.values())
    w = {h: 10 ** (v - m) if v > -math.inf else 0.0 for h, v in logp.items()}
    z = sum(w.values())
    return {h: w[h] / z for h in HYPOTHESES}


def unwin(prior, factors):
    odds = prior / (1 - prior)
    for d in factors:
        odds *= d
    return odds / (1 + odds)


def mid(it):
    return (it["lo"] + it["hi"]) / 2


def box_bounds(prior, target, items=ITEMS):
    """Min and max posterior of the group `target` over every LR in its range.  The
    posterior of a group is monotone in each item's log LR (it raises or lowers the
    group's weight relative to the rest, or both by the same factor), so the extremes
    sit at corners; we still check every corner when there are few items."""
    def group_post(choice):
        p = posterior(prior, choice, items)
        return sum(p[h] for h in target)
    lo_choice, hi_choice = {}, {}
    for it in items:
        inside = set(it["favours"]) & set(target)
        outside = set(it["favours"]) - set(target)
        # the item helps the target when it favours the target's members more than the rest
        a = {it["id"]: it["lo"]}; b = {it["id"]: it["hi"]}
        base = {j["id"]: mid(j) for j in items}
        up = group_post({**base, **b}) >= group_post({**base, **a})
        lo_choice[it["id"]] = it["lo"] if up else it["hi"]
        hi_choice[it["id"]] = it["hi"] if up else it["lo"]
    return group_post(lo_choice), group_post(hi_choice)


def contrast_shares(contrast, items=ITEMS):
    """Share of the variance of a log10 posterior-odds contrast contributed by each
    item, when each log LR is uniform on its range (log odds are additive, so the
    shares are exact).  contrast = (group A, group B): an item moves log odds A:B by
    its log LR times (fraction of A it favours - fraction of B it favours) only when
    it favours all of A or none; we use that indicator form."""
    A, B = contrast
    out = {}
    for it in items:
        fa = all(h in it["favours"] for h in A)
        fb = all(h in it["favours"] for h in B)
        coef = (1 if fa else 0) - (1 if fb else 0)
        out[it["id"]] = (coef ** 2) * (it["hi"] - it["lo"]) ** 2 / 12
    tot = sum(out.values())
    return {k: (v / tot if tot else 0.0) for k, v in out.items()}, tot


def flip_threshold(prior, item_id, A, B, items=ITEMS):
    """With every other item at its midpoint, the log10 LR of `item_id` at which the
    posterior odds of group A against group B equal 1, or None if the item does not
    move that contrast."""
    base = {j["id"]: mid(j) for j in items}
    it = next(j for j in items if j["id"] == item_id)
    coef = (1 if all(h in it["favours"] for h in A) else 0) - (1 if all(h in it["favours"] for h in B) else 0)
    if coef == 0:
        return None
    p = posterior(prior, {**base, item_id: 0.0}, items)
    lo = math.log10(sum(p[h] for h in A) / sum(p[h] for h in B))
    return -lo / coef


def monte_carlo(n=20000, seed=0, rho=1.0, prior_range=(0.01, 0.99), items=ITEMS):
    """Posterior distribution when each log LR is uniform on its range and the two
    top-level priors are uniform on the logit scale over prior_range."""
    rng = random.Random(seed)
    lg = lambda p: math.log(p / (1 - p))
    inv = lambda x: 1 / (1 + math.exp(-x))
    a, b = lg(prior_range[0]), lg(prior_range[1])
    draws = []
    for _ in range(n):
        pr = prior_vector(inv(rng.uniform(a, b)), inv(rng.uniform(a, b)), PRIOR_DEFAULT["within"])
        lr = {it["id"]: rng.uniform(it["lo"], it["hi"]) for it in items}
        draws.append(posterior(pr, lr, items, rho))
    return draws


def quantiles(xs, qs=(0.05, 0.5, 0.95)):
    s = sorted(xs)
    return [s[min(len(s) - 1, int(q * len(s)))] for q in qs]
