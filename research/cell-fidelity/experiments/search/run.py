"""Milestone 4: which multi-fidelity search finds the DFN-best design for the least wall time?

    python experiments/search/run.py     # replays every method on 30 pools of 64 -> results.txt, summary.json

A replay on the cached benchmark (../cycles/bench.jsonl): no PyBaMM runs. Each evaluation of a design at a
(model, cycles) cell is charged the median baseline wall time of a fresh run of that cell (../cycles/cost.json).
A design counts as found once it is run at DFN@100. The plan and hypotheses H7 to H10 were fixed in ../../LOG.md
before this script was written. Needs numpy and scipy (GP-EI and the Wilcoxon test); the trace logic is stdlib.
"""
import json
import math
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CYC = HERE.parent / "cycles"

N_SEEDS = 30
POOL = 64
TOL = 0.01            # within 1% of the pool's best DFN@100
N_INIT = 5            # GP-EI random starts
FLAG_RMIN = 0.1       # milestone 1's flag threshold
TOPK_FLAG = 5
ETA = 3
RUNGS = (2, 10, 30, 100)
BUDGETS = (60, 120, 240, 480)
LS_GRID = (0.05, 0.1, 0.2, 0.3, 0.5, 0.8, 1.2, 2.0)
JITTER = 1e-6


# ---------- benchmark ----------

def load():
    """Scores per (model, n) over the 128 designs, whole-run SPMe r_min, inputs, and median fresh-run cost per cell."""
    sys.path.insert(0, str(CYC))
    import importlib.util
    spec = importlib.util.spec_from_file_location("cycles_run", CYC / "run.py")
    cr = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cr)
    js, runs, sc = cr.load()
    rmin = [runs[(j, "SPMe")]["r_min"] for j in js]
    xs = [runs[(j, "DFN")]["x"] for j in js]
    c = json.loads((CYC / "cost.json").read_text())
    cost = {(m, int(n)): sorted(v)[1] for m, d in c.items() for n, v in d.items()}
    return dict(sc=sc, rmin=rmin, x=xs, cost=cost, n=len(js))


# ---------- trace logic (stdlib only; tested) ----------

class Trace:
    """Charged seconds and the best DFN@100 seen, after each charged evaluation."""

    def __init__(self, target, cost):
        self.target, self.cost = target, cost
        self.t, self.best, self.n_hi = 0.0, 0.0, 0
        self.pts = [(0.0, 0.0)]
        self.done_hi = set()
        self.order = []   # designs in the order they were run at DFN@100

    def charge(self, cell, i=None, seconds=None):
        """Charge one evaluation of design i at cell (its fresh-run cost unless seconds is given)."""
        self.t += self.cost[cell] if seconds is None else seconds
        if cell == ("DFN", 100):
            self.done_hi.add(i)
            self.order.append(i)
            self.n_hi += 1
            self.best = max(self.best, self.target[i])
        self.pts.append((self.t, self.best))


def verify_in_order(tr, order):
    for i in order:
        if i not in tr.done_hi:
            tr.charge(("DFN", 100), i)


def t_hit(pts, thr):
    """First charged time at which the best seen reaches thr (inf if never)."""
    for t, b in pts:
        if b >= thr:
            return t
    return math.inf


def best_at(pts, budget):
    b = 0.0
    for t, v in pts:
        if t <= budget + 1e-9:
            b = v
    return b


def m_random(pool, D, rng):
    tr = Trace(D["target"], D["cost"])
    order = list(pool)
    rng.shuffle(order)
    verify_in_order(tr, order)
    return tr


def m_screen(pool, D, cell, flag=False):
    tr = Trace(D["target"], D["cost"])
    s = D["sc"][cell]
    for i in pool:
        tr.charge(cell, i)
    order = sorted(pool, key=lambda i: -s[i])
    if flag:  # top-k by the screen, then every flagged design in screen order, then the rest (LOG.md, method d)
        fl = [i for i in order[TOPK_FLAG:] if D["rmin"][i] <= FLAG_RMIN]
        order = order[:TOPK_FLAG] + fl + [i for i in order[TOPK_FLAG:] if i not in set(fl)]
    verify_in_order(tr, order)
    return tr


def m_halving(pool, D, incremental=False):
    """Successive halving over DFN cycles, eta = 3, from the whole pool; then the rest verified by last-rung score."""
    tr = Trace(D["target"], D["cost"])
    C = D["cost"]
    alive = list(pool)
    last = {}  # design -> (rung index reached, score there)

    def step(i, r):
        cell = ("DFN", RUNGS[r])
        prev = last.get(i)
        extra = None
        if incremental and prev is not None:  # resume the run from the cycles it already has
            extra = C[cell] - C[("DFN", RUNGS[prev[0]])]
        tr.charge(cell, i, extra)
        last[i] = (r, D["sc"][cell][i])

    for r, n in enumerate(RUNGS):
        for i in alive:
            step(i, r)
        if n == 100:
            break
        alive = sorted(alive, key=lambda i: -D["sc"][("DFN", n)][i])[:max(1, len(alive) // ETA)]
    rest = sorted(pool, key=lambda i: (-last[i][0], -last[i][1]))
    for i in rest:
        if i not in tr.done_hi:
            step(i, len(RUNGS) - 1)
    return tr


# ---------- GP-EI (numpy) ----------

def gp_fit_predict(X, y, Xs):
    import numpy as np
    X, y, Xs = np.asarray(X, float), np.asarray(y, float), np.asarray(Xs, float)
    mu0, sd0 = y.mean(), y.std() or 1.0
    z = (y - mu0) / sd0
    d2 = ((X[:, None, :] - X[None, :, :]) ** 2).sum(-1)
    best = None
    for ls in LS_GRID:
        K = np.exp(-0.5 * d2 / ls ** 2) + JITTER * np.eye(len(X))
        try:
            L = np.linalg.cholesky(K)
        except np.linalg.LinAlgError:
            continue
        a = np.linalg.solve(L.T, np.linalg.solve(L, z))
        ll = -0.5 * z @ a - np.log(np.diag(L)).sum()
        if best is None or ll > best[0]:
            best = (ll, ls, L, a)
    _, ls, L, a = best
    ks = np.exp(-0.5 * ((Xs[:, None, :] - X[None, :, :]) ** 2).sum(-1) / ls ** 2)
    mu = ks @ a
    v = np.linalg.solve(L, ks.T)
    var = np.clip(1.0 - (v ** 2).sum(0), 1e-12, None)
    return mu * sd0 + mu0, np.sqrt(var) * sd0


def ei(mu, sd, fbest):
    import numpy as np
    from scipy.stats import norm
    z = (mu - fbest) / sd
    return (mu - fbest) * norm.cdf(z) + sd * norm.pdf(z)


def m_gp(pool, D, rng, screen=None):
    """GP-EI at DFN@100. With a screen cell: screen the pool, add the standardised screen score as an input, start at its top."""
    tr = Trace(D["target"], D["cost"])
    U = D["u"]
    feats = {i: list(U[i]) for i in pool}
    if screen:
        s = D["sc"][screen]
        for i in pool:
            tr.charge(screen, i)
        vals = [s[i] for i in pool]
        lo, hi = min(vals), max(vals)
        for i in pool:
            feats[i].append((s[i] - lo) / ((hi - lo) or 1.0))
        start = [max(pool, key=lambda i: s[i])]
    else:
        start = rng.sample(pool, N_INIT)
    for i in start:
        tr.charge(("DFN", 100), i)
    while len(tr.done_hi) < len(pool):
        seen = [i for i in pool if i in tr.done_hi]
        cand = [i for i in pool if i not in tr.done_hi]
        mu, sd = gp_fit_predict([feats[i] for i in seen], [D["target"][i] for i in seen], [feats[i] for i in cand])
        e = ei(mu, sd, max(D["target"][i] for i in seen))
        tr.charge(("DFN", 100), cand[int(e.argmax())])
    return tr


# ---------- experiment ----------

METHODS = ["random DFN@100", "GP-EI DFN@100",
           "screen SPM@2", "screen SPM@100", "screen SPMe@100", "screen SPMe@100+flag", "screen DFN@2", "screen DFN@10",
           "halving DFN 2-10-30-100", "halving DFN (resumed runs)", "MF-GP-EI DFN@10", "MF-GP-EI SPM@2"]


def run_method(name, pool, D, seed):
    rng = random.Random(1000 + seed)
    if name == "random DFN@100":
        return m_random(pool, D, rng)
    if name == "GP-EI DFN@100":
        return m_gp(pool, D, rng)
    if name.startswith("screen "):
        cell = name.split()[1].replace("+flag", "")
        m, n = cell.split("@")
        return m_screen(pool, D, (m, int(n)), flag=name.endswith("+flag"))
    if name == "halving DFN 2-10-30-100":
        return m_halving(pool, D)
    if name == "halving DFN (resumed runs)":
        return m_halving(pool, D, incremental=True)
    if name.startswith("MF-GP-EI"):
        m, n = name.split()[1].split("@")
        return m_gp(pool, D, rng, screen=(m, int(n)))
    raise KeyError(name)


def med(v):
    v = sorted(v)
    n = len(v)
    return v[n // 2] if n % 2 else 0.5 * (v[n // 2 - 1] + v[n // 2])


def boot_med(v, n=2000, seed=0):
    rng = random.Random(seed)
    out = sorted(med([rng.choice(v) for _ in v]) for _ in range(n))
    return out[int(0.025 * n)], out[int(0.975 * n) - 1]


def wilcoxon(a, b):
    """Two-sided paired Wilcoxon p (scipy); 1.0 when all differences are zero."""
    from scipy.stats import wilcoxon as w
    if all(x == y for x, y in zip(a, b)):
        return 1.0
    return float(w(a, b).pvalue)


def main():
    D = load()
    D["target"] = D["sc"][("DFN", 100)]
    lo = [min(x[k] for x in D["x"]) for k in range(4)]
    hi = [max(x[k] for x in D["x"]) for k in range(4)]
    D["u"] = [[(x[k] - lo[k]) / (hi[k] - lo[k]) for k in range(4)] for x in D["x"]]
    res = {m: dict(T1=[], nhi=[], reg={b: [] for b in BUDGETS}) for m in METHODS}
    traces = {}
    for s in range(N_SEEDS):
        pool = random.Random(s).sample(range(D["n"]), POOL)
        best = max(D["target"][i] for i in pool)
        thr = (1 - TOL) * best
        for m in METHODS:
            tr = run_method(m, pool, D, s)
            assert tr.done_hi == set(pool), (m, s)
            res[m]["T1"].append(t_hit(tr.pts, thr))
            res[m]["nhi"].append(None)
            for b in BUDGETS:
                res[m]["reg"][b].append(100 * (best - best_at(tr.pts, b)) / best)
            traces.setdefault(m, []).append(dict(seed=s, best=best, pts=[(round(t, 3), round(v, 4)) for t, v in tr.pts]))
            # DFN@100 calls until within 1%
            k, bb = 0, 0.0
            for i in tr.order:
                k += 1
                bb = max(bb, D["target"][i])
                if bb >= thr:
                    break
            res[m]["nhi"][-1] = k
        print("seed", s, "done", flush=True)
    gp = res["GP-EI DFN@100"]["T1"]
    L = ["cell-fidelity milestone 4: multi-fidelity search replay on the cached 128-design benchmark",
         f"{N_SEEDS} seeds, each a pool of {POOL} of the 128 Sobol designs; target within {100 * TOL:g}% of the pool's best DFN@100",
         "charged cost per evaluation (median fresh run, baseline design, s): " +
         ", ".join(f"{m}@{n} {D['cost'][(m, n)]:.2f}" for m, n in sorted(D["cost"]) if (m, n) in
                   {("SPM", 2), ("SPM", 100), ("SPMe", 100), ("DFN", 2), ("DFN", 10), ("DFN", 30), ("DFN", 100)}), "",
         "A. time to within 1% (T1, charged s), DFN@100 calls to it, regret % at a budget",
         f"{'method':<28} {'T1 median':>9} {'95% CI':>13} {'DFN@100 calls':>13} " +
         " ".join(f"{'reg@' + str(b):>7}" for b in BUDGETS) + f" {'p vs GP-EI':>10}"]
    summary = dict(seeds=N_SEEDS, pool=POOL, methods={})
    for m in METHODS:
        T = res[m]["T1"]
        a, b = boot_med(T)
        p = wilcoxon(T, gp) if m != "GP-EI DFN@100" else None
        regs = {bb: med(res[m]["reg"][bb]) for bb in BUDGETS}
        L.append(f"{m:<28} {med(T):9.1f} {a:6.1f}-{b:<6.1f} {med(res[m]['nhi']):13.1f} " +
                 " ".join(f"{regs[bb]:7.2f}" for bb in BUDGETS) + f" {'' if p is None else f'{p:.2g}':>10}")
        summary["methods"][m] = dict(T1_median=med(T), T1_ci=[a, b], T1=T, dfn_calls_median=med(res[m]["nhi"]),
                                     regret_median_at={str(k): v for k, v in regs.items()}, p_vs_gp=p)
    # hypotheses
    S = summary["methods"]
    g, d10 = S["GP-EI DFN@100"]["T1_median"], S["screen DFN@10"]["T1_median"]
    bud = g / 3
    trs = traces["screen DFN@10"]
    reg_b = med([100 * (t["best"] - best_at(t["pts"], bud)) / t["best"] for t in trs])
    p8 = wilcoxon(res["halving DFN 2-10-30-100"]["T1"], res["screen DFN@10"]["T1"])
    p9 = wilcoxon(res["screen SPM@2"]["T1"], res["screen DFN@10"]["T1"])
    p10 = wilcoxon(res["screen SPMe@100+flag"]["T1"], res["screen SPMe@100"]["T1"])
    h = S["halving DFN 2-10-30-100"]["T1_median"]
    s2 = S["screen SPM@2"]["T1_median"]
    f1, f0 = S["screen SPMe@100+flag"]["T1_median"], S["screen SPMe@100"]["T1_median"]
    L += ["", "B. hypotheses",
          f"H7 median T1: DFN@10 screen {d10:.1f} s vs GP-EI DFN@100 {g:.1f} s, ratio {d10 / g:.2f} (supported if <= 1/3); "
          f"median regret of the DFN@10 screen at a budget of GP-EI/3 = {bud:.1f} s: {reg_b:.2f}% (refuted if > 2%)",
          f"H8 halving median T1 {h:.1f} s vs DFN@10 screen {d10:.1f} s, paired Wilcoxon p = {p8:.2g} "
          f"(refuted if halving lower at p < 0.05)",
          f"H9 SPM@2 screen median T1 {s2:.1f} s vs DFN@10 screen {d10:.1f} s, p = {p9:.2g} "
          f"(supported if lower; refuted if higher at p < 0.05)",
          f"H10 SPMe@100 + flag median T1 {f1:.1f} s vs SPMe@100 {f0:.1f} s, p = {p10:.2g} "
          f"(refuted if higher at p < 0.05)"]
    summary["h"] = dict(h7=dict(ratio=d10 / g, budget=bud, regret=reg_b), h8=dict(p=p8, halving=h, dfn10=d10),
                        h9=dict(p=p9, spm2=s2), h10=dict(p=p10, flag=f1, noflag=f0))
    # extra: how often each method is fastest; T1 per seed spread
    L += ["", "C. (extra) seeds on which each method has the lowest T1 (ties shared)"]
    wins = {m: 0.0 for m in METHODS}
    for s in range(N_SEEDS):
        tmin = min(res[m]["T1"][s] for m in METHODS)
        w = [m for m in METHODS if res[m]["T1"][s] == tmin]
        for m in w:
            wins[m] += 1 / len(w)
    for m in METHODS:
        L.append(f"{m:<28} {wins[m]:5.1f}")
    summary["wins"] = wins
    # median regret curve for the figure
    grid = [5 * k for k in range(1, 121)]
    L += ["", "D. median regret % against charged seconds (figure data)",
          "s " + " ".join(f"[{m}]" for m in ("GP-EI DFN@100", "screen SPM@2", "screen DFN@10", "halving DFN 2-10-30-100"))]
    for t in grid:
        row = [med([100 * (tr_["best"] - best_at(tr_["pts"], t)) / tr_["best"] for tr_ in traces[m]])
               for m in ("GP-EI DFN@100", "screen SPM@2", "screen DFN@10", "halving DFN 2-10-30-100")]
        L.append(f"{t} " + " ".join(f"{max(0.0, v) + 0.0:.3f}" for v in row))
    # extra (not in the plan): screening pays per pooled design, GP-EI roughly per DFN call, so the winner may move with pool size
    sweep = ("GP-EI DFN@100", "screen SPM@2", "screen SPM@100", "screen DFN@2", "screen DFN@10", "halving DFN (resumed runs)")
    L += ["", "E. (extra, not in the plan) median T1 (charged s) against pool size, 30 seeds each (pools of 96 overlap heavily)",
          f"{'pool':>5} " + " ".join(f"{m:>26}" for m in sweep)]
    summary["pool_sweep"] = {}
    for P in (16, 32, 64, 96):
        row = {}
        for m in sweep:
            T = []
            for s in range(N_SEEDS):
                pool = random.Random(s).sample(range(D["n"]), P)
                thr = (1 - TOL) * max(D["target"][i] for i in pool)
                T.append(t_hit(run_method(m, pool, D, s).pts, thr))
            row[m] = med(T)
        summary["pool_sweep"][P] = row
        L.append(f"{P:>5} " + " ".join(f"{row[m]:26.1f}" for m in sweep))
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(summary, indent=1) + "\n")
    print("\n".join(L[:40]))


if __name__ == "__main__":
    main()
