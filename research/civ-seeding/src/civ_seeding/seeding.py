"""Seeding rules on the BCDJ villages, and a batched simulator to score them (milestone 4).

`simulate_batch` runs the three model families of `complex.simulate` for many seed sets at
once: seeds is an n x C boolean matrix, and every column is run S times with the *same* random
draws (common random numbers across candidates), so greedy steps compare seed sets on equal
noise. With C = 1 it consumes the generator exactly as `complex.simulate` does and returns the
same adoption matrix (tested).

Rules return a boolean n-vector with exactly b seeds. Ties are broken by household index.
"""
from __future__ import annotations

import numpy as np

from . import bcdj

# The milestone-3b real-data fits (sigma = 0) and two sensitivity points.
MODELS = {
    "I": dict(qN=0.05, qP=0.3),
    "T": dict(qN=0.075, qP=0.1, theta=0.5, delta=-0.25),
    "R": dict(qN=0.10, qP=0.1, gamma=0.10, delta=-0.25),
    "T60": dict(qN=0.075, qP=0.1, theta=0.6),
    "Ipub": dict(qN=0.10, qP=0.5),
}


def simulate_batch(v: bcdj.Village, beta, seeds, S: int, rng, qN: float, qP: float,
                   gamma: float = 0.0, theta: float | None = None, delta: float = 0.0,
                   return_matrix: bool = False, fast: bool = False, shift=None,
                   independent: bool = False):
    """seeds: n x C bool. Returns C x S adopter counts (or the n x C*S adoption matrix,
    column c*S + s for seed set c and run s, if return_matrix). fast: float32 products
    (greedy search only; final scores use float64, which matches `complex.simulate`).
    shift: optional village random effect on the logit (as `complex.simulate`'s shift;
    milestone 6): length S, one value per run shared by every seed set, or length C*S, one
    per column. independent: every column gets its own random draws instead of the shared
    ones (for scoring many draws of a randomised rule, one run each; milestone 6)."""
    seeds = np.asarray(seeds, bool)
    if seeds.ndim == 1:
        seeds = seeds[:, None]
    n, C = seeds.shape
    base = (beta[0] + delta + v.Z @ beta[1:])[:, None]
    if shift is not None:
        z = np.asarray(shift, float)
        base = base + (z if len(z) == C * S else np.tile(z, C))[None, :]
    U = rng.random((n, C * S)) if independent else np.tile(rng.random((n, S)), (1, C))
    contagious = np.repeat(seeds, S, axis=1)
    informed = np.zeros((n, C * S), bool)
    adopted = np.zeros((n, C * S), bool)
    lq = np.log(np.clip(1 - np.array([qN, qP]), 1e-300, None))
    deg = np.maximum(v.deg, 1)[:, None]
    use_theta = theta is not None and theta <= 1
    A = v.A.astype(np.float32) if fast else v.A
    for _ in range(v.T):
        informed |= contagious
        if gamma != 0.0 or use_theta:
            k = A @ adopted.astype(A.dtype)
        if gamma != 0.0:
            p = 1 / (1 + np.exp(-(base + gamma * k)))
        else:
            p = 1 / (1 + np.exp(-base))
        new = informed & ~adopted & (U < p)
        if use_theta:
            new |= informed & ~adopted & (k / deg >= theta - 1e-12)
        adopted |= new
        lnot = (np.where(adopted, lq[1], lq[0]) * informed).astype(A.dtype)
        reach_u = (rng.random((n, C * S)) if independent
                   else np.tile(rng.random((n, S)), (1, C)))
        contagious = reach_u > np.exp(A @ lnot)
    if return_matrix:
        return adopted.astype(float)
    return adopted.sum(0).reshape(C, S)


def _top(score, b):
    order = np.lexsort((np.arange(len(score)), -np.asarray(score)))
    m = np.zeros(len(score), bool)
    m[order[:b]] = True
    return m


def eigenvector(v):
    w, U = np.linalg.eigh(v.A)
    x = np.abs(U[:, -1])
    return x, w[-1]


def diffusion_centrality(v):
    """sum_{t=1..T} (A / lambda_1)^t 1, with the village's own period count T."""
    _, lam = eigenvector(v)
    q = 1.0 / lam
    x = np.ones(v.n)
    out = np.zeros(v.n)
    for _ in range(v.T):
        x = q * (v.A @ x)
        out += x
    return out


def rule_leaders(v, b, rng=None):
    return v.leader.copy()


def rule_random(v, b, rng):
    m = np.zeros(v.n, bool)
    m[rng.choice(v.n, b, replace=False)] = True
    return m


def rule_degree(v, b, rng=None):
    return _top(v.deg, b)


def rule_eigen(v, b, rng=None):
    return _top(eigenvector(v)[0], b)


def rule_diffusion(v, b, rng=None):
    return _top(diffusion_centrality(v), b)


def rule_ball(v, b, rng=None):
    """One clustered ball: breadth-first from the top-degree household; nearer layers
    first, higher degree first within a layer."""
    start = int(np.lexsort((np.arange(v.n), -v.deg))[0])
    chosen = [start]
    seen = np.zeros(v.n, bool)
    seen[start] = True
    frontier = [start]
    while len(chosen) < b and frontier:
        nxt = np.flatnonzero((v.A[frontier].sum(0) > 0) & ~seen)
        seen[nxt] = True
        nxt = nxt[np.lexsort((nxt, -v.deg[nxt]))]
        chosen.extend(nxt[: b - len(chosen)].tolist())
        frontier = nxt.tolist()
    m = np.zeros(v.n, bool)
    m[chosen] = True
    if m.sum() < b:  # graph exhausted (giant component, so only if b > n)
        m |= _top(v.deg * ~m, b - m.sum()) & ~m
    return m


def rule_patches(v, b, rng=None, size: int = 4):
    """Patches of `size`: the highest-degree household neither seeded nor next to a seed,
    plus its size-1 highest-degree unseeded neighbours; repeated until b seeds."""
    m = np.zeros(v.n, bool)
    order = np.lexsort((np.arange(v.n), -v.deg))
    while m.sum() < b:
        near = (v.A[:, m].sum(1) > 0) | m
        free = [i for i in order if not near[i]]
        c = free[0] if free else next(i for i in order if not m[i])
        m[c] = True
        nb = np.flatnonzero((v.A[c] > 0) & ~m)
        nb = nb[np.lexsort((nb, -v.deg[nb]))]
        take = nb[: min(size - 1, b - int(m.sum()))]
        m[take] = True
    return m


def rule_greedy(v, b, beta, model: dict, S: int = 32, seed: int = 0):
    """Greedy: add the household with the largest gain in mean adopters, every step on the
    same S random draws (common random numbers across candidates and steps)."""
    m = np.zeros(v.n, bool)
    for _ in range(b):
        cand = np.flatnonzero(~m)
        X = np.repeat(m[:, None], len(cand), 1)
        X[cand, np.arange(len(cand))] = True
        rng = np.random.default_rng([seed, v.village, 11])
        val = simulate_batch(v, beta, X, S, rng, fast=True, **model).mean(1)
        m[cand[int(np.argmax(val))]] = True
    return m


STRUCTURAL = {
    "leaders": rule_leaders,
    "random": rule_random,
    "degree": rule_degree,
    "eigenvector": rule_eigen,
    "diffusion": rule_diffusion,
    "ball": rule_ball,
    "patches": rule_patches,
}


# ---- milestone 5: rules without a fitted model, and rules from a partial survey ----

def _spread_pick(score, A, b):
    """Households in score order, skipping any next to a seed; if that runs out, the
    highest-score households left. A is the adjacency the rule can see."""
    n = len(score)
    order = np.lexsort((np.arange(n), -np.asarray(score)))
    m = np.zeros(n, bool)
    blocked = np.zeros(n, bool)
    for i in order:
        if m.sum() == b:
            break
        if not blocked[i]:
            m[i] = True
            blocked |= A[i] > 0
            blocked[i] = True
    if m.sum() < b:
        rest = [i for i in order if not m[i]]
        m[rest[: b - int(m.sum())]] = True
    return m


def rule_spread_degree(v, b, rng=None):
    """Top degree, no two seeds adjacent (while an independent choice remains)."""
    return _spread_pick(v.deg, v.A, b)


def rule_single_discount(v, b, rng=None):
    """SingleDiscount (Chen, Wang and Yang 2009): highest degree counting only ties to
    unseeded households, recomputed after each pick."""
    m = np.zeros(v.n, bool)
    d = v.deg.astype(float).copy()
    for _ in range(b):
        sc = np.where(m, -np.inf, d)
        i = int(np.lexsort((np.arange(v.n), -sc))[0])
        m[i] = True
        d -= v.A[:, i]
    return m


def rule_degree_discount(v, b, rng=None, p: float = 0.05):
    """DegreeDiscountIC (Chen, Wang and Yang 2009): dd = d - 2t - (d - t) t p, t = seeded
    neighbours. p = 0.05, the information model's fitted q_N."""
    m = np.zeros(v.n, bool)
    d = v.deg.astype(float)
    t = np.zeros(v.n)
    for _ in range(b):
        dd = d - 2 * t - (d - t) * t * p
        sc = np.where(m, -np.inf, dd)
        i = int(np.lexsort((np.arange(v.n), -sc))[0])
        m[i] = True
        t += v.A[:, i]
    return m


def survey(v, f, rng):
    """Survey a random share f of households; each reports its ties. Returns the surveyed
    mask, the estimated degree (exact if surveyed, surveyed neighbours / f if not) and the
    adjacency the survey saw (ties with at least one surveyed end)."""
    k = max(1, int(round(f * v.n)))
    s = np.zeros(v.n, bool)
    s[rng.choice(v.n, k, replace=False)] = True
    seen = v.A * (s[:, None] | s[None, :])
    est = np.where(s, v.deg, v.A[:, s].sum(1) / (k / v.n))
    return s, est, seen


def rule_survey_degree(v, b, rng, f: float):
    _, est, _ = survey(v, f, rng)
    return _top(est, b)


def rule_survey_spread(v, b, rng, f: float):
    _, est, seen = survey(v, f, rng)
    return _spread_pick(est, seen, b)


def rule_friend(v, b, rng):
    """Friend nomination (after Kim et al. 2015): random households each name a uniform
    random tie; seed the named until b distinct households are seeded."""
    m = np.zeros(v.n, bool)
    nbrs = [np.flatnonzero(v.A[i]) for i in range(v.n)]
    while m.sum() < b:
        i = int(rng.integers(v.n))
        if len(nbrs[i]):
            m[int(rng.choice(nbrs[i]))] = True
    return m


CENSUS_CHEAP = {
    "spread-degree": rule_spread_degree,
    "single-discount": rule_single_discount,
    "degree-discount": rule_degree_discount,
}
SURVEY_SHARES = (0.1, 0.25, 0.5)


def kendall_tau(x, y):
    """Kendall tau-b of two score vectors (ties counted as neither)."""
    x, y = np.asarray(x), np.asarray(y)
    i, j = np.triu_indices(len(x), 1)
    dx, dy = np.sign(x[i] - x[j]), np.sign(y[i] - y[j])
    nc = (dx * dy).sum()
    n0 = len(i)
    tx, ty = (dx == 0).sum(), (dy == 0).sum()
    den = np.sqrt((n0 - tx) * (n0 - ty))
    return nc / den if den else 0.0


# ---- milestone 7: complex centrality (after Guilbeault and Centola 2021) ----

def complex_paths(A, theta: float = 0.5, absolute: int | None = None, max_steps: int | None = None):
    """Complex path lengths from every household's seed neighbourhood (after Guilbeault and
    Centola 2021, Nature Communications 12:4430). Column i starts with i and all its neighbours
    active; a deterministic threshold contagion then runs on the graph: an inactive household
    activates when the share of its neighbours that are active is at least theta (or, with
    `absolute`, when at least that many are). Returns L, an n x n float matrix with L[j, i] the
    step at which j activates from i's neighbourhood (0 for the neighbourhood itself, inf if
    never)."""
    A = np.asarray(A, float)
    n = A.shape[0]
    deg = np.maximum(A.sum(1), 1)[:, None]
    act = (A + np.eye(n)) > 0
    L = np.where(act, 0.0, np.inf)
    for t in range(1, (max_steps or n) + 1):
        k = A @ act
        new = ~act & ((k >= absolute) if absolute is not None else (k / deg >= theta - 1e-12))
        if not new.any():
            break
        L[new] = t
        act |= new
    return L


def complex_centrality(A, theta: float = 0.5, absolute: int | None = None):
    """Per household: (reach, mean complex path length to the households reached outside its
    neighbourhood). Reach is the share of the village its seed neighbourhood activates; a
    household whose neighbourhood reaches nobody beyond itself gets mean length inf. Guilbeault
    and Centola rank by the average complex path length; with fractional thresholds on these
    villages most cascades stop early, so we rank by reach first and break ties by shorter
    mean length (our choice, stated in LOG.md before the run)."""
    L = complex_paths(A, theta, absolute)
    fin = np.isfinite(L)
    reach = fin.mean(0)
    out = fin & (L > 0)
    with np.errstate(invalid="ignore", divide="ignore"):
        mlen = np.where(out.sum(0) > 0, np.where(out, L, 0).sum(0) / out.sum(0), np.inf)
    return reach, mlen


def _cc_order(v, theta, absolute):
    reach, mlen = complex_centrality(v.A, theta, absolute)
    # reach desc, then mean length asc, then degree desc, then index
    return np.lexsort((np.arange(v.n), -v.deg, mlen, -reach)), reach


def rule_complex(v, b, rng=None, theta: float = 0.5, absolute: int | None = None):
    """Top-b households by complex centrality (single households, not neighbourhoods)."""
    order, _ = _cc_order(v, theta, absolute)
    m = np.zeros(v.n, bool)
    m[order[:b]] = True
    return m


def rule_complex_hood(v, b, rng=None, theta: float = 0.5, absolute: int | None = None):
    """Seed neighbourhoods, as Guilbeault and Centola's measure assumes: take the most central
    household not yet seeded, seed it and then its unseeded neighbours in degree order, until
    b seeds; repeat."""
    order, _ = _cc_order(v, theta, absolute)
    m = np.zeros(v.n, bool)
    for c in order:
        if m.sum() >= b:
            break
        if m[c]:
            continue
        m[c] = True
        nb = np.flatnonzero((v.A[c] > 0) & ~m)
        nb = nb[np.lexsort((nb, -v.deg[nb]))]
        m[nb[: b - int(m.sum())]] = True
    return m


def rule_complex_spread(v, b, rng=None, theta: float = 0.5, absolute: int | None = None):
    """Complex centrality order, no two seeds adjacent while possible (spread degree's rule
    with complex centrality as the score)."""
    order, _ = _cc_order(v, theta, absolute)
    score = np.empty(v.n)
    score[order] = -np.arange(v.n)
    return _spread_pick(score, v.A, b)


COMPLEX_RULES = {
    "cc-frac": lambda v, b, rng=None: rule_complex(v, b, theta=0.5),
    "cc-frac25": lambda v, b, rng=None: rule_complex(v, b, theta=0.25),
    "cc-abs2": lambda v, b, rng=None: rule_complex(v, b, absolute=2),
    "cc-hood-frac": lambda v, b, rng=None: rule_complex_hood(v, b, theta=0.5),
    "cc-hood-abs2": lambda v, b, rng=None: rule_complex_hood(v, b, absolute=2),
    "cc-spread-frac": lambda v, b, rng=None: rule_complex_spread(v, b, theta=0.5),
}


# ---- milestone 9: adaptive survey designs ----

SURVEY_DESIGNS = ("uniform", "adaptive", "walk")


def survey_design(v, f, rng, design: str = "uniform", split: float | None = None, recall: float = 1.0):
    """Survey k = round(f n) households under a design; each surveyed household reports all its
    ties. uniform: k random households (milestone 5's `survey`, same draws). adaptive: k1 = k // 2
    random, then the k - k1 unsurveyed households named by the most stage-1 households (ties
    broken at random). walk: k1 random, then repeatedly a random stage-1 household names a
    uniform random tie, surveyed if not yet, until k (stops early only if no stage-1 household
    can name anyone new). Returns (surveyed mask, estimated degree, seen adjacency). Estimated
    degree: exact if surveyed; otherwise stage-1 neighbours / (k1 / n), unbiased for a stage-1
    uniform sample (uniform: all surveyed neighbours / (k / n), as milestone 5). split (milestone
    10): stage 1 gets round(split k) households, clamped to [1, k - 1]; None keeps k // 2.
    recall (milestone 11): below 1, each surveyed household reports each true tie independently
    with that probability (`survey_recall`); recall = 1 keeps the draws above unchanged."""
    if recall < 1.0:
        return survey_recall(v, f, rng, design, split, recall)
    if design == "uniform":
        return survey(v, f, rng)
    n = v.n
    k = max(1, int(round(f * n)))
    if k >= n:
        s = np.ones(n, bool)
        return s, v.deg.astype(float), v.A.copy()
    k1 = max(1, k // 2) if split is None else min(max(1, int(round(split * k))), max(1, k - 1))
    s1 = np.zeros(n, bool)
    s1[rng.choice(n, k1, replace=False)] = True
    s = s1.copy()
    named = v.A[:, s1].sum(1)
    if design == "adaptive":
        cand = np.flatnonzero(~s)
        tie = rng.random(len(cand))
        order = cand[np.lexsort((tie, -named[cand]))]
        s[order[: k - k1]] = True
    elif design == "walk":
        st1 = np.flatnonzero(s1)
        nbrs = {int(i): np.flatnonzero(v.A[i]) for i in st1}
        reachable = (named > 0) & ~s
        while s.sum() < k and (reachable & ~s).any():
            i = int(rng.choice(st1))
            if len(nbrs[i]):
                s[int(rng.choice(nbrs[i]))] = True
        if s.sum() < k:  # stage-1 ties exhausted: fill at random
            rest = np.flatnonzero(~s)
            s[rng.choice(rest, k - int(s.sum()), replace=False)] = True
    else:
        raise ValueError(design)
    seen = v.A * (s[:, None] | s[None, :])
    est = np.where(s, v.deg, named / (k1 / n))
    return s, est.astype(float), seen


def false_reports(v, rng, fp: float, mode: str = "uniform"):
    """Spurious ties (milestone 16): household i names m_i ~ Poisson(fp * deg_i) households it has
    no tie to, chosen without replacement from a pool. uniform: every non-neighbour in the village.
    closure: non-neighbours who share at least one neighbour with i (friends of friends), the
    triadic-closure error a respondent who confuses a friend's friend for a friend would make.
    m_i is capped at the pool's size. Returns an n x n boolean matrix F[i, j]: i would name j."""
    n = v.n
    A = v.A > 0
    pool = ~A & ~np.eye(n, dtype=bool)
    if mode == "closure":
        Ai = A.astype(np.int32)
        pool &= (Ai @ Ai) > 0
    elif mode != "uniform":
        raise ValueError(mode)
    m = rng.poisson(fp * v.deg.astype(float))
    keys = np.where(pool, rng.random((n, n)), np.inf)
    ranks = np.argsort(np.argsort(keys, 1), 1)
    return pool & (ranks < m[:, None])


def survey_recall(v, f, rng, design: str = "uniform", split: float | None = None,
                  recall: "float | np.ndarray" = 0.85, fp: float = 0.0, fp_mode: str = "uniform",
                  recip: bool = False, fp_joint: float = 0.0, recip_w: float = 0.0,
                  oracle_true: bool = False):
    """A survey whose respondents forget ties (milestone 11). Each surveyed household i reports
    each true tie (i, j) independently with probability `recall` (R[i, j], drawn once per survey
    after stage 1); a tie is seen if a surveyed end reported it. uniform: k random households.
    adaptive: k1 random, then the k - k1 unsurveyed households named in the most stage-1 reports.
    Estimated degree: seen degree for surveyed households, reports by the random stage /
    (k1 / n) otherwise, with no correction for recall (a field team does not know it). f = 1 is
    a census with recall error: a tie is seen with probability 1 - (1 - recall)^2.
    `recall` may also be an n x n array of per-tie probabilities (milestone 12: recall by tie
    strength); a constant array gives exactly the same draws as the scalar.
    fp > 0 (milestone 16): each household also names spurious ties (`false_reports`, drawn right
    after the recall draw), which enter the stage-1 counts, the seen ties and the degree estimate
    like true reports; fp = 0 draws nothing extra, so earlier milestones' draws are unchanged.
    recip (milestone 17): the reciprocity filter. A tie between two surveyed households is kept
    only if both name each other; a tie with one surveyed end cannot be checked and is kept on
    that one report. Stage-1 counts (which pick stage 2 and estimate unsurveyed degrees) are
    unfiltered, since a field team has not yet surveyed the other end. It uses no random draws,
    so recip changes nothing but the filter.
    fp_joint (milestone 18): correlated false reports. Each spurious report i -> j is echoed by
    j -> i with probability fp_joint (both ends remember the same non-existent tie), drawn right
    after `false_reports`, so the reciprocity filter cannot remove it. The echo adds no new
    unordered pair, so the set of false ties an unfiltered census sees is unchanged: fp still
    fixes the number of distinct false ties, and fp_joint only decides how many of them look
    mutual. fp_joint = 0 draws nothing extra.
    recip_w (milestone 19): the soft reciprocity filter. With recip, a checkable tie that only one
    end names is kept at weight recip_w instead of dropped (mutual and uncheckable ties keep weight
    1), so `seen` becomes a weighted adjacency and a surveyed household's degree is its weighted
    seen degree. recip_w = 0 is milestone 17's hard filter and recip_w = 1 keeps every report
    (the unfiltered census); like the filter itself, it uses no random draws.
    oracle_true (milestone 22, a diagnostic no field team can run): with the soft filter, a
    one-sided tie that is true keeps weight 1, so only one-sided false ties are down-weighted. It
    uses no random draws, so it isolates what halving one-sided true ties costs."""
    if not 0.0 <= recip_w <= 1.0:
        raise ValueError(recip_w)
    if design not in ("uniform", "adaptive"):
        raise ValueError(design)
    n = v.n
    k = min(n, max(1, int(round(f * n))))
    if k >= n:
        k1 = n
    elif design == "uniform":
        k1 = k
    else:
        k1 = max(1, k // 2) if split is None else min(max(1, int(round(split * k))), max(1, k - 1))
    s1 = np.zeros(n, bool)
    s1[rng.choice(n, k1, replace=False)] = True
    R = (rng.random((n, n)) < recall) & (v.A > 0)        # R[i, j]: i would report its tie to j
    if fp > 0:
        F = false_reports(v, rng, fp, fp_mode)
        if fp_joint > 0:
            F = F | (F & (rng.random((n, n)) < fp_joint)).T
        R = R | F
    named = (R[s1, :]).sum(0).astype(float)                # stage-1 reports naming each household
    s = s1.copy()
    if k > k1:
        cand = np.flatnonzero(~s)
        tie = rng.random(len(cand))
        order = cand[np.lexsort((tie, -named[cand]))]
        s[order[: k - k1]] = True
    rep = R & s[:, None]
    seen = rep | rep.T
    if recip:
        both = s[:, None] & s[None, :]
        if recip_w > 0:
            one = both & seen & ~(R & R.T)
            if oracle_true:
                one &= ~(v.A > 0)
            seen = seen.astype(float)
            seen[one] = recip_w
        else:
            seen &= ~both | (R & R.T)
    seen = seen.astype(v.A.dtype)
    est = np.where(s, seen.sum(1), named / (k1 / n))
    return s, est.astype(float), seen


def rule_recall_degree(v, b, rng, f: float, design: str = "uniform", split: float | None = None,
                       recall: float = 0.85, fp: float = 0.0, fp_mode: str = "uniform",
                       recip: bool = False, fp_joint: float = 0.0, recip_w: float = 0.0):
    _, est, _ = survey_recall(v, f, rng, design, split, recall, fp, fp_mode, recip, fp_joint, recip_w)
    return _top(est, b)


def rule_recall_dd(v, b, rng, f: float, design: str = "uniform", split: float | None = None,
                   recall: float = 0.85, p: float = 0.05, fp: float = 0.0, fp_mode: str = "uniform",
                   recip: bool = False, fp_joint: float = 0.0, recip_w: float = 0.0,
                   oracle_true: bool = False):
    _, est, seen = survey_recall(v, f, rng, design, split, recall, fp, fp_mode, recip, fp_joint, recip_w,
                                 oracle_true)
    return _dd_pick(est, seen, b, p)


def _dd_pick(est, seen, b, p: float = 0.05):
    """DegreeDiscountIC on an estimated degree and the ties a survey saw."""
    n = len(est)
    m = np.zeros(n, bool)
    t = np.zeros(n)
    d = np.asarray(est, float)
    for _ in range(b):
        dd = d - 2 * t - (d - t) * t * p
        sc = np.where(m, -np.inf, dd)
        i = int(np.lexsort((np.arange(n), -sc))[0])
        m[i] = True
        t += seen[:, i]
    return m


def rule_design_degree(v, b, rng, f: float, design: str = "uniform", split: float | None = None):
    _, est, _ = survey_design(v, f, rng, design, split)
    return _top(est, b)


def rule_design_dd(v, b, rng, f: float, design: str = "uniform", p: float = 0.05,
                   split: float | None = None):
    _, est, seen = survey_design(v, f, rng, design, split)
    return _dd_pick(est, seen, b, p)
