"""Re-tuning a capped SPRT so it holds both error rates at their nominal level.

Pure standard library; imports the exact SPRT pieces from the sibling project `free-sprtcert`.
Convention as in free-sprtcert: H0 is the unacceptable rate p0, H1 the acceptable p1 < p0, "accept" means deciding H1.
The test stops early when the log likelihood ratio (LLR) reaches `hi` (accept) or `lo` (reject); a run still going
after `cap` trials accepts if failures <= kc. Because the LLR at a fixed n falls as failures rise, "failures <= kc" is
every possible final threshold on the LLR. Everything is an exact dynamic programme over (trials, failures).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "free-sprtcert"))
from sprtcert import log_lr, wald_bounds  # noqa: E402,F401


def run(p, p0, p1, lo, hi, cap):
    """Exact run at true rate p. Returns (accept_early, mean_n, left) where left[k] = P(still running after cap trials with k failures)
    and mean_n is the expected number of trials (runs still going count as cap)."""
    dist = {0: 1.0}
    acc = 0.0
    mean_n = 0.0
    for n in range(cap):
        mean_n += sum(dist.values())
        nxt = {}
        for k, m in dist.items():
            for kk, pr in ((k, 1 - p), (k + 1, p)):
                w = m * pr
                if w == 0.0:
                    continue
                s = log_lr(n + 1, kk, p0, p1)
                if s >= hi:
                    acc += w
                elif s <= lo:
                    pass
                else:
                    nxt[kk] = nxt.get(kk, 0.0) + w
        dist = nxt
        if not dist:
            break
    return acc, mean_n, dist


def accept_prob(acc, left, kc):
    """P(decide H1) when runs left at the cap accept if failures <= kc."""
    return acc + sum(m for k, m in left.items() if k <= kc)


def best_cut(r0, r1, alpha, beta):
    """Largest-power final cut for one boundary pair: the kc (or -1 = reject all) with alpha_ach <= alpha, beta_ach <= beta,
    and the smallest beta_ach. Returns (kc, alpha_ach, beta_ach) or None. r0, r1 are run() results at p0 and p1."""
    ks = sorted(set(r0[2]) | set(r1[2]))
    best = None
    for kc in [-1] + ks:
        a = accept_prob(r0[0], r0[2], kc)
        b = 1 - accept_prob(r1[0], r1[2], kc)
        if a <= alpha and b <= beta and (best is None or b < best[2]):
            best = (kc, a, b)
    return best


def tune(p0, p1, alpha, beta, cap, scales):
    """Grid search over multiples of Wald's boundaries (s_hi on the accept side, s_lo on the reject side) and the final cut.

    Feasible = both achieved errors within nominal, computed exactly. Objective = mean trials averaged over p0 and p1.
    Returns dict(s_lo, s_hi, kc, alpha_ach, beta_ach, mean_p0, mean_p1) or None if nothing in the grid is feasible.
    """
    lo0, hi0 = wald_bounds(alpha, beta)
    best = None
    for s_lo in scales:
        for s_hi in scales:
            lo, hi = lo0 * s_lo, hi0 * s_hi
            r0 = run(p0, p0, p1, lo, hi, cap)
            r1 = run(p1, p0, p1, lo, hi, cap)
            cut = best_cut(r0, r1, alpha, beta)
            if cut is None:
                continue
            obj = (r0[1] + r1[1]) / 2
            if best is None or obj < best["obj"]:
                best = {"s_lo": s_lo, "s_hi": s_hi, "kc": cut[0], "alpha_ach": cut[1], "beta_ach": cut[2],
                        "mean_p0": r0[1], "mean_p1": r1[1], "obj": obj}
    return best
