"""Milestone 3, part 1: an affine-residual bound on screen-then-verify, checked on the cached benchmark.

    python experiments/theory/run.py     # -> results.txt, summary.json, theory.svg

No PyBaMM runs: reads ../cycles/bench.jsonl, ../cycles/cost.json and ../search/summary.json (milestone 4's
pool sweep). The theorem is in ../../THEORY.md; the plan, C1 and H11 to H14 were fixed in ../../LOG.md first.
Needs numpy and scipy (the Chebyshev fit is a linear programme; Spearman).
"""
import importlib.util
import json
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent

TOL = 0.01            # tau: within 1% of the pool's best DFN@100
Q = 0.25              # kappa_q uses the top 25% by screen together with the top 25% by target
N_SEEDS, POOL = 30, 64
SWEEP = (16, 32, 64, 96)
SWEEP_SCREENS = (("SPM", 2), ("SPM", 100), ("DFN", 2), ("DFN", 10))
TARGET = ("DFN", 100)


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


# ---------- the theorem's quantities (stdlib except chebyshev) ----------

def screen_order(idx, s):
    """Designs in the order screen-then-verify runs them (descending screen score, stable, as milestone 4)."""
    return sorted(idx, key=lambda i: -s[i])


def calls_to_target(idx, s, f, tau=TOL):
    """R: DFN@100 calls until a design with f >= (1 - tau) max f has been verified."""
    thr = (1 - tau) * max(f[i] for i in idx)
    for k, i in enumerate(screen_order(idx, s), 1):
        if f[i] >= thr:
            return k
    raise AssertionError("unreachable: the best design meets the threshold")


def top1_regret(idx, s, f):
    """f* - f of the first design verified (absolute, units of f)."""
    return max(f[i] for i in idx) - f[screen_order(idx, s)[0]]


def r_bound(idx, f, kappa, tau=TOL):
    """Theorem (ii): 1 + #{x : f* - 2 kappa <= f(x) < (1 - tau) f*}."""
    fs = max(f[i] for i in idx)
    return 1 + sum(1 for i in idx if fs - 2 * kappa <= f[i] < (1 - tau) * fs)


def band_fraction(idx, f, kappa, tau=TOL):
    """p(2 kappa): fraction of designs within 2 kappa of the top but outside tolerance."""
    return (r_bound(idx, f, kappa, tau) - 1) / len(idx)


def screen_t1_bound(n, c_s, c_h, p):
    """Corollary: T1 <= c_h + N (c_s + p c_h) for a whole-pool screen."""
    return c_h + n * (c_s + p * c_h)


def top_set(idx, s, f, q=Q):
    """S_q: top q by screen together with top q by target; also whether x* is in the screen's top q."""
    k = max(1, round(q * len(idx)))
    by_s = screen_order(idx, s)[:k]
    by_f = sorted(idx, key=lambda i: -f[i])[:k]
    xstar = by_f[0]
    return sorted(set(by_s) | set(by_f)), xstar in set(by_s)


def chebyshev(svals, fvals):
    """kappa = min over u >= 0, c of max |u s - c - f| (a linear programme); returns kappa, u, c."""
    import numpy as np
    from scipy.optimize import linprog
    s = np.asarray(svals, float)
    f = np.asarray(fvals, float)
    n = len(s)
    one = np.ones(n)
    A = np.vstack([np.column_stack([s, -one, -one]), np.column_stack([-s, one, -one])])
    b = np.concatenate([f, -f])
    r = linprog([0, 0, 1], A_ub=A, b_ub=b, bounds=[(0, None), (None, None), (0, None)], method="highs")
    assert r.success, r.message
    u, c, t = r.x
    return float(t), float(u), float(c)


# ---------- report ----------

def main():
    import numpy as np
    from scipy.stats import spearmanr
    cr = _mod("cycles_run", EXP / "cycles" / "run.py")
    js, runs, sc = cr.load()
    N = len(js)
    idx = list(range(N))
    f = sc[TARGET]
    c = json.loads((EXP / "cycles" / "cost.json").read_text())
    cost = {(m, int(n)): sorted(v)[1] for m, d in c.items() for n, v in d.items()}
    c_h = cost[TARGET]
    rmin = [runs[(j, "SPMe")]["r_min"] for j in js]
    cells = [(m, n) for m in cr.MODELS for n in cr.NS if (m, n) != TARGET]
    pools = [random.Random(s).sample(range(N), POOL) for s in range(N_SEEDS)]

    L = ["cell-fidelity milestone 3 (theory, part 1): the affine-residual bound on screen-then-verify",
         f"benchmark: {N} Sobol designs (milestone 2); target DFN@100; tau = {TOL}; pools: {N_SEEDS} of {POOL} (milestone 4's)",
         f"kappa = min over u >= 0, c of max |u s - c - f| in Wh/kg; kappa_q over the top {Q:.0%} by s with the top {Q:.0%} by f", ""]
    summ = dict(n=N, tau=TOL, q=Q, cells={})

    # C1 and the per-cell diagnostics
    viol = []
    L += ["A. per screen cell: residual, raw error and screening cost",
          f"{'cell':<10} {'kappa_all':>9} {'kappa_q':>8} {'x* in top q':>11} {'raw |s-f|':>9} {'u':>6} "
          f"{'R med':>6} {'R bound med':>11} {'top1 reg':>8} {'2 kappa_all':>11}"]
    for cell in cells:
        s = sc[cell]
        ka, u, _ = chebyshev([s[i] for i in idx], [f[i] for i in idx])
        S, ok_q = top_set(idx, s, f)
        kq = chebyshev([s[i] for i in S], [f[i] for i in S])[0]
        raw = float(np.median([abs(s[i] - f[i]) for i in idx]))
        Rs, Rb = [], []
        for pool in pools:
            kp = chebyshev([s[i] for i in pool], [f[i] for i in pool])[0]
            R, rb, reg = calls_to_target(pool, s, f), r_bound(pool, f, kp), top1_regret(pool, s, f)
            Rs.append(R)
            Rb.append(rb)
            if R > rb or reg > 2 * kp + 1e-6:
                viol.append((cell, R, rb, reg, 2 * kp))
        reg128 = top1_regret(idx, s, f)
        summ["cells"][f"{cell[0]}@{cell[1]}"] = dict(kappa_all=ka, kappa_q=kq, xstar_in_top_q=ok_q, raw_median_abs=raw,
                                                      u=u, R_median=float(np.median(Rs)), R=Rs,
                                                      R_bound_median=float(np.median(Rb)), top1_regret_128=reg128,
                                                      R_128=calls_to_target(idx, s, f), R_bound_128_q=r_bound(idx, f, kq),
                                                      cost=cost.get(cell))
        L.append(f"{cell[0] + '@' + str(cell[1]):<10} {ka:9.2f} {kq:8.2f} {str(ok_q):>11} {raw:9.2f} {u:6.2f} "
                 f"{np.median(Rs):6.1f} {np.median(Rb):11.1f} {reg128:8.2f} {2 * ka:11.2f}")
    L += ["", f"C1 bound check over {len(cells)} cells x {N_SEEDS} pools: {len(viol)} violations"]
    summ["c1_violations"] = len(viol)

    # H11
    C = summ["cells"]
    keys = list(C)
    Rm = [C[k]["R_median"] for k in keys]
    rho_k = spearmanr([C[k]["kappa_q"] for k in keys], Rm).statistic
    rho_ka = spearmanr([C[k]["kappa_all"] for k in keys], Rm).statistic
    rho_r = spearmanr([C[k]["raw_median_abs"] for k in keys], Rm).statistic
    h11 = "supported" if rho_k >= 0.7 and rho_k - rho_r >= 0.2 else ("refuted" if rho_k < 0.5 else "neither")
    L += ["", "B. hypotheses",
          f"H11 Spearman over {len(keys)} cells with median R: kappa_q {rho_k:.3f}, raw median |s-f| {rho_r:.3f} "
          f"(difference {rho_k - rho_r:+.3f}); kappa_all {rho_ka:.3f} (extra) -> {h11}"]

    # H12, H13 on designs SPMe completed
    done = [i for i, j in enumerate(js) if runs[(j, "SPMe")]["ok_cycles"] >= 100]
    k_spm = chebyshev([sc[("SPM", 100)][i] for i in done], [f[i] for i in done])[0]
    k_spme = chebyshev([sc[("SPMe", 100)][i] for i in done], [f[i] for i in done])[0]
    h12 = "supported" if k_spm <= 0.5 * k_spme else ("refuted" if k_spm >= k_spme else "neither")
    L.append(f"H12 on the {len(done)} designs SPMe completed: kappa_all SPM@100 {k_spm:.2f} vs SPMe@100 {k_spme:.2f} Wh/kg "
             f"(ratio {k_spm / k_spme:.2f}) -> {h12}")
    res = {}
    for m in ("SPM", "SPMe"):
        x = np.array([sc[(m, 100)][i] for i in done])
        y = np.array([f[i] for i in done])
        a, b = np.polyfit(x, y, 1)
        e = y - (a * x + b)            # DFN minus the affine prediction from the screen: > 0 where the screen under-scores
        rho = spearmanr(e, [rmin[i] for i in done]).statistic
        res[m] = dict(slope=float(a), intercept=float(b), rms=float(np.sqrt(np.mean(e ** 2))), rho_rmin=float(rho))
    d13 = abs(res["SPMe"]["rho_rmin"]) - abs(res["SPM"]["rho_rmin"])
    h13 = "supported" if d13 >= 0.2 else ("refuted" if d13 <= 0 else "neither")
    L.append(f"H13 Spearman(least-squares affine residual, SPMe r_min): SPMe@100 {res['SPMe']['rho_rmin']:+.3f}, "
             f"SPM@100 {res['SPM']['rho_rmin']:+.3f} (|difference| {d13:+.3f}); residual RMS SPMe {res['SPMe']['rms']:.2f}, "
             f"SPM {res['SPM']['rms']:.2f} Wh/kg -> {h13}")
    summ["h12"] = dict(kappa_spm=k_spm, kappa_spme=k_spme, n=len(done))
    summ["h13"] = res

    # H14: corollary against milestone 4's pool sweep
    ms = json.loads((EXP / "search" / "summary.json").read_text())
    m_gp = ms["methods"]["GP-EI DFN@100"]["dfn_calls_median"]
    sweep = ms["pool_sweep"]
    right, rows = 0, []
    L += ["", f"C. H14: corollary T1 <= c_h + N (c_s + p c_h) against GP-EI at m = {m_gp:g} DFN@100 calls ({m_gp * c_h:.1f} s)",
          f"{'screen':<10} {'p(2kq)':>7} {'N*':>6} " + " ".join(f"{'N=' + str(P) + ' pred/obs':>16}" for P in SWEEP)]
    for cell in SWEEP_SCREENS:
        k = f"{cell[0]}@{cell[1]}"
        p = band_fraction(idx, f, C[k]["kappa_q"])
        c_s = cost[cell]
        nstar = (m_gp - 1) * c_h / (c_s + p * c_h)
        cols = []
        for P in SWEEP:
            pred = screen_t1_bound(P, c_s, c_h, p) < m_gp * c_h
            obs = sweep[str(P)][f"screen {k}"] < sweep[str(P)]["GP-EI DFN@100"]
            right += pred == obs
            cols.append(f"{('win' if pred else 'lose') + '/' + ('win' if obs else 'lose'):>16}")
            rows.append(dict(cell=k, pool=P, pred_win=pred, obs_win=obs,
                             bound=screen_t1_bound(P, c_s, c_h, p), obs_t1=sweep[str(P)][f"screen {k}"],
                             gp_t1=sweep[str(P)]["GP-EI DFN@100"]))
        L.append(f"{k:<10} {p:7.3f} {nstar:6.1f} " + " ".join(cols))
    tot = len(SWEEP_SCREENS) * len(SWEEP)
    h14 = "supported" if right >= 13 else ("refuted" if right <= 10 else "neither")
    L.append(f"H14 calls right: {right} of {tot} -> {h14}")
    summ["h11"] = dict(rho_kappa_q=rho_k, rho_raw=rho_r, rho_kappa_all=rho_ka, verdict=h11)
    summ["h12"]["verdict"], summ["h13_verdict"], summ["h14"] = h12, h13, dict(right=right, of=tot, verdict=h14, rows=rows)

    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(summ, indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
