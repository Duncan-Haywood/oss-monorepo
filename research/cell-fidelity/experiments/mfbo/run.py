"""Milestone 4b: does a co-kriging search that picks design and fidelity each step beat screens and GP-EI?

    python experiments/mfbo/run.py      # 30 seeds x pool sizes 16/32/64/96, two cost models -> results.txt, summary.json

A replay on the cached benchmark (../cycles/bench.jsonl): no PyBaMM runs. Autoregressive co-kriging
(Kennedy and O'Hagan 2000) over a cheap rung (SPM@2 or DFN@2) and DFN@100, with two fidelity-selection rules:
augmented EI (Huang et al. 2006) and an MF-UCB rule after Kandasamy et al. (2016). References re-run here:
GP-EI at DFN@100 and three whole-pool screens. Plan and hypotheses H18 to H20 are in ../../LOG.md, written
before this script. Needs numpy and scipy.
"""
import importlib.util
import json
import math
import random
import statistics
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

spec = importlib.util.spec_from_file_location("search_run", ROOT / "search" / "run.py")
S = importlib.util.module_from_spec(spec)
spec.loader.exec_module(S)

N_SEEDS = 30
POOLS = (16, 32, 64, 96)
TOL = 0.01
N_INIT = 5
REFIT = 5
HI = ("DFN", 100)
LOWS = (("SPM", 2), ("DFN", 2))
LS_L = (0.1, 0.2, 0.4, 0.8, 1.6)
LS_D = (0.1, 0.3, 0.8, 1.6)
RHOS = (0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.2)
VDS = (0.005, 0.02, 0.1, 0.3, 1.0)
JIT = 1e-6
S_COST = {(m, int(n)): sorted(v)[1] for m, d in json.loads((ROOT / "cycles" / "cost.json").read_text()).items() for n, v in d.items()}


# ---------- costs ----------

def cost_fns(D, runs_seconds):
    """A: the cell's median baseline cost. B: scaled by the design's own 100-cycle benchmark time over the median design's."""
    base = D["cost"]
    med = {m: statistics.median(v) for m, v in runs_seconds.items()}

    def A(cell, i):
        return base[cell]

    def B(cell, i):
        m = cell[0]
        return base[cell] * runs_seconds[m][i] / med[m]
    return {"A": A, "B": B}


class Trace(S.Trace):
    """Milestone 4's trace, charging a per-design cost function; also counts low-rung calls."""

    def __init__(self, target, cf):
        super().__init__(target, {HI: None})
        self.cf = cf
        self.n_lo = 0

    def run(self, cell, i):
        if cell != HI:
            self.n_lo += 1
        self.charge(cell, i, self.cf(cell, i))


# ---------- co-kriging (numpy) ----------

def sqd(A, B):
    import numpy as np
    return ((A[:, None, :] - B[None, :, :]) ** 2).sum(-1)


class CoKrig:
    """f_l = m_l + g(x); f_h = m_h + rho g(x) + d(x); g, d independent zero-mean SE GPs, common profiled variance s2."""

    def __init__(self):
        self.hyp = None

    def fit(self, Xl, yl, Xh, yh, refit=True):
        import numpy as np
        self.Xl, self.Xh = np.asarray(Xl, float), np.asarray(Xh, float)
        yl, yh = np.asarray(yl, float), np.asarray(yh, float)
        self.ml = yl.mean() if len(yl) else yh.mean()
        self.mh = yh.mean()
        sc = np.concatenate([yl - self.ml, yh - self.mh]).std() or 1.0
        self.sc = sc
        self.z = np.concatenate([(yl - self.ml) / sc, (yh - self.mh) / sc])
        self.nl = len(yl)
        dll, dlh, dhh = sqd(self.Xl, self.Xl), sqd(self.Xl, self.Xh), sqd(self.Xh, self.Xh)
        grid = [(a, b, r, v) for a in LS_L for b in LS_D for r in RHOS for v in VDS] if (refit or self.hyp is None) else [self.hyp]
        best = None
        n = len(self.z)
        for ls_l, ls_d, rho, vd in grid:
            K = self._K(dll, dlh, dhh, ls_l, ls_d, rho, vd)
            try:
                L = np.linalg.cholesky(K)
            except np.linalg.LinAlgError:
                continue
            a = np.linalg.solve(L.T, np.linalg.solve(L, self.z))
            s2 = max(self.z @ a / n, 1e-12)
            ll = -0.5 * n * math.log(s2) - np.log(np.diag(L)).sum()
            if best is None or ll > best[0]:
                best = (ll, (ls_l, ls_d, rho, vd), L, a, s2)
        _, self.hyp, self.L, self.a, self.s2 = best
        return self

    @staticmethod
    def _K(dll, dlh, dhh, ls_l, ls_d, rho, vd):
        import numpy as np
        kll = np.exp(-0.5 * dll / ls_l ** 2)
        klh = rho * np.exp(-0.5 * dlh / ls_l ** 2)
        khh = rho ** 2 * np.exp(-0.5 * dhh / ls_l ** 2) + vd * np.exp(-0.5 * dhh / ls_d ** 2)
        K = np.block([[kll, klh], [klh.T, khh]])
        return K + JIT * np.eye(len(K))

    def predict(self, Xs):
        """Posterior mean and sd of f_h, sd of f_l and corr(f_l, f_h) at each row of Xs (original units)."""
        import numpy as np
        Xs = np.asarray(Xs, float)
        ls_l, ls_d, rho, vd = self.hyp
        gl = np.exp(-0.5 * sqd(Xs, self.Xl) / ls_l ** 2)
        gh = np.exp(-0.5 * sqd(Xs, self.Xh) / ls_l ** 2)
        dh = np.exp(-0.5 * sqd(Xs, self.Xh) / ls_d ** 2)
        kl = np.hstack([gl, rho * gh])                       # cov(f_l(x), obs)
        kh = np.hstack([rho * gl, rho ** 2 * gh + vd * dh])   # cov(f_h(x), obs)
        vl = np.linalg.solve(self.L, kl.T)
        vh = np.linalg.solve(self.L, kh.T)
        var_l = np.clip(1.0 - (vl ** 2).sum(0), 1e-12, None)
        var_h = np.clip(rho ** 2 + vd - (vh ** 2).sum(0), 1e-12, None)
        cov = rho - (vl * vh).sum(0)
        corr = np.clip(cov / np.sqrt(var_l * var_h), -1.0, 1.0)
        mu = self.mh + self.sc * (kh @ self.a)
        k = math.sqrt(self.s2) * self.sc
        return mu, np.sqrt(var_h) * k, np.sqrt(var_l) * k, corr

    def delta_sd(self):
        return math.sqrt(self.hyp[3] * self.s2) * self.sc


# ---------- searches (each stops at the 1% target) ----------

def m_screen(pool, D, cell, cf, thr):
    tr = Trace(D["target"], cf)
    s = D["sc"][cell]
    for i in pool:
        tr.run(cell, i)
    for i in sorted(pool, key=lambda i: -s[i]):
        tr.run(HI, i)
        if tr.best >= thr:
            break
    return tr


def m_gp(pool, D, cf, thr, rng):
    tr = Trace(D["target"], cf)
    U = D["u"]
    for i in rng.sample(pool, N_INIT):
        tr.run(HI, i)
    while tr.best < thr:
        seen = [i for i in pool if i in tr.done_hi]
        cand = [i for i in pool if i not in tr.done_hi]
        mu, sd = S.gp_fit_predict([U[i] for i in seen], [D["target"][i] for i in seen], [U[i] for i in cand])
        e = S.ei(mu, sd, tr.best)
        tr.run(HI, cand[int(e.argmax())])
    return tr


def m_cokrig(pool, D, cf, thr, rng, low, rule, cheap_start=False):
    import numpy as np
    tr = Trace(D["target"], cf)
    U, sl, f = D["u"], D["sc"][low], D["target"]
    done_lo = []
    if cheap_start:  # extra, not in the plan: 10 random designs at the low rung, then DFN@100 on the best 2 of them
        start = rng.sample(pool, 2 * N_INIT)
        for i in start:
            tr.run(low, i)
            done_lo.append(i)
        for i in sorted(start, key=lambda i: -sl[i])[:2]:
            tr.run(HI, i)
    else:
        start = rng.sample(pool, N_INIT)
        for i in start:
            tr.run(HI, i)
        for i in start:
            tr.run(low, i)
            done_lo.append(i)
    ck, nobs, t = CoKrig(), 0, 0
    c_ratio = D["cost"][HI] / D["cost"][low]   # the planner knows the cells' typical costs, not each design's
    while tr.best < thr:
        t += 1
        hi_seen = [i for i in pool if i in tr.done_hi]
        n_now = len(done_lo) + len(hi_seen)
        refit = ck.hyp is None or n_now - nobs >= REFIT
        if refit:
            nobs = n_now
        ck.fit([U[i] for i in done_lo], [sl[i] for i in done_lo], [U[i] for i in hi_seen], [f[i] for i in hi_seen], refit=refit)
        cand = [i for i in pool if i not in tr.done_hi]
        mu, sdh, sdl, corr = ck.predict([U[i] for i in cand])
        lo_ok = np.array([i not in set(done_lo) for i in cand])
        if rule == "aEI":
            e = S.ei(mu, sdh, tr.best)
            a_hi = e
            a_lo = np.where(lo_ok, e * np.clip(corr, 0.0, 1.0) * c_ratio, -np.inf)
            j_hi, j_lo = int(a_hi.argmax()), int(a_lo.argmax())
            if a_lo[j_lo] > a_hi[j_hi]:
                cell, j = low, j_lo
            else:
                cell, j = HI, j_hi
        else:  # MF-UCB
            beta = 0.2 * 4 * math.log(2 * t)
            j = int((mu + math.sqrt(beta) * sdh).argmax())
            gamma = math.sqrt(1.0 / c_ratio) * ck.delta_sd()
            cell = low if (lo_ok[j] and math.sqrt(beta) * sdl[j] > gamma) else HI
        i = cand[j]
        tr.run(cell, i)
        if cell == low:
            done_lo.append(i)
    return tr


METHODS = ["GP-EI DFN@100", "screen SPM@2", "screen SPM@100", "screen DFN@2",
           "coKrig aEI SPM@2", "coKrig aEI DFN@2", "coKrig MF-UCB SPM@2", "coKrig MF-UCB DFN@2"]
COKRIG = [m for m in METHODS if m.startswith("coKrig")]
EXTRA = [m + " cheap-start" for m in COKRIG]   # not in the plan; never enter the H19 pick
ALL = METHODS + EXTRA
SCREENS = [m for m in METHODS if m.startswith("screen")]


def run_method(name, pool, D, cf, thr, seed):
    rng = random.Random(1000 + seed)   # milestone 4's seed, so GP-EI and co-kriging share their 5 random starts
    if name == "GP-EI DFN@100":
        return m_gp(pool, D, cf, thr, rng)
    if name.startswith("screen "):
        m, n = name.split()[1].split("@")
        return m_screen(pool, D, (m, int(n)), cf, thr)
    _, rule, cell = name.split()[:3]
    m, n = cell.split("@")
    return m_cokrig(pool, D, cf, thr, rng, (m, int(n)), rule, cheap_start=name.endswith("cheap-start"))


def main():
    D = S.load()
    D["target"] = D["sc"][HI]
    lo = [min(x[k] for x in D["x"]) for k in range(4)]
    hi = [max(x[k] for x in D["x"]) for k in range(4)]
    D["u"] = [[(x[k] - lo[k]) / (hi[k] - lo[k]) for k in range(4)] for x in D["x"]]
    bench = [json.loads(l) for l in (ROOT / "cycles" / "bench.jsonl").read_text().splitlines()]
    js = sorted({r["j"] for r in bench})
    secs = {m: [next(r["seconds"] for r in bench if r["j"] == j and r["model"] == m) for j in js] for m in ("SPM", "SPMe", "DFN")}
    CF = cost_fns(D, secs)
    res = {}
    for cname, cf in CF.items():
        for P in POOLS:
            if cname == "B" and P != 64:
                continue
            for m in ALL:
                res[(cname, P, m)] = dict(T1=[], nhi=[], nlo=[])
            for s in range(N_SEEDS):
                pool = random.Random(s).sample(range(D["n"]), P)
                thr = (1 - TOL) * max(D["target"][i] for i in pool)
                for m in ALL:
                    tr = run_method(m, pool, D, cf, thr, s)
                    r = res[(cname, P, m)]
                    r["T1"].append(S.t_hit(tr.pts, thr))
                    r["nhi"].append(tr.n_hi)
                    r["nlo"].append(tr.n_lo)
            print("cost", cname, "pool", P, "done", flush=True)
    raw = {f"{c}|{P}|{m}": r for (c, P, m), r in res.items()}
    info = dict(dfn_secs=[min(secs["DFN"]), statistics.median(secs["DFN"]), max(secs["DFN"])])
    report(raw, info)


def report(raw, info):
    """results.txt and summary.json from the raw per-seed numbers (python run.py --report rebuilds them from summary.json)."""
    med = S.med
    L = ["cell-fidelity milestone 4b: co-kriging multi-fidelity BO against whole-pool screens and GP-EI (cached benchmark replay)",
         f"{N_SEEDS} seeds per pool size; target within {100 * TOL:g}% of the pool's best DFN@100; T1 = charged s to it",
         "cost A: each cell's median baseline fresh-run cost; cost B: scaled per design by its own 100-cycle benchmark time / the median design's",
         "DFN 100-cycle benchmark time per design: min {:.1f}, median {:.1f}, max {:.1f} s".format(*info["dfn_secs"]), ""]
    summary = dict(seeds=N_SEEDS, pools=POOLS, info=info, cells={})
    for cname in ("A", "B"):
        for P in POOLS:
            if f"{cname}|{P}|{METHODS[0]}" not in raw:
                continue
            g = raw[f"{cname}|{P}|GP-EI DFN@100"]["T1"]
            L += [f"{cname}{P}",
                  f"cost {cname}, pool {P}",
                  f"{'method':<34} {'T1 median':>9} {'95% CI':>15} {'DFN@100 calls':>13} {'low calls':>9} {'p vs GP-EI':>10}"]
            for m in ALL:
                if m == EXTRA[0]:
                    L.append("  (extra, not in the plan: co-kriging started from 10 low-rung runs and DFN@100 on their best 2)")
                r = raw[f"{cname}|{P}|{m}"]
                a, b = S.boot_med(r["T1"])
                p = None if m == "GP-EI DFN@100" else S.wilcoxon(r["T1"], g)
                L.append(f"{m:<34} {med(r['T1']):9.1f} {a:7.1f}-{b:<7.1f} {med(r['nhi']):13.1f} {med(r['nlo']):9.1f} "
                         f"{'' if p is None else f'{p:.2g}':>10}")
                summary["cells"][f"{cname}|{P}|{m}"] = dict(T1_median=med(r["T1"]), T1_ci=[a, b], T1=r["T1"], nhi=r["nhi"], nlo=r["nlo"],
                                                            dfn_calls_median=med(r["nhi"]), low_calls_median=med(r["nlo"]), p_vs_gp=p)
            L.append("")
    C = summary["cells"]

    def T(c, P, m):
        return C[f"{c}|{P}|{m}"]["T1_median"]
    # H18
    h18 = T("A", 64, "coKrig aEI SPM@2"), T("A", 64, "GP-EI DFN@100"), C["A|64|coKrig aEI SPM@2"]["p_vs_gp"]
    v18 = "supported" if (h18[0] < h18[1] and h18[2] < 0.05) else ("refuted" if h18[0] > h18[1] else "not supported (lower, p >= 0.05)")
    # H19: pick the best planned co-kriging variant at pool 64, cost A (the cheap-start extras never enter it)
    pick = min(COKRIG, key=lambda m: T("A", 64, m))
    g96, k96 = T("A", 96, "GP-EI DFN@100"), T("A", 96, pick)
    s16 = min(T("A", 16, m) for m in SCREENS)
    k16 = T("A", 16, pick)
    r96, r16 = k96 / g96, k16 / s16
    v19 = "supported" if (r96 <= 1.0 and r16 <= 1.5) else ("refuted" if (r96 > 1.1 or r16 > 2.0) else "neither (between the bars)")
    # H20 (the planned methods only)
    a64 = [T("A", 64, m) for m in METHODS]
    b64 = [T("B", 64, m) for m in METHODS]
    rho20 = spearman(a64, b64)
    v20 = "supported" if rho20 >= 0.8 else ("refuted" if rho20 < 0.6 else "neither")
    L += ["H. hypotheses",
          f"H18 coKrig aEI SPM@2 median T1 {h18[0]:.1f} s vs GP-EI {h18[1]:.1f} s on pools of 64 (cost A), p = {h18[2]:.2g}: {v18}",
          f"H19 best co-kriging variant at 64 (cost A): {pick}; pool 96 T1 {k96:.1f} vs GP-EI {g96:.1f} (ratio {r96:.2f}, bar <= 1.0, refuted > 1.1); "
          f"pool 16 T1 {k16:.1f} vs best screen {s16:.1f} (ratio {r16:.2f}, bar <= 1.5, refuted > 2.0): {v19}",
          f"H20 Spearman of the {len(METHODS)} methods' median T1 at 64, cost A vs cost B: {rho20:.2f} (supported >= 0.8, refuted < 0.6): {v20}"]
    summary["h"] = dict(h18=dict(cokrig=h18[0], gp=h18[1], p=h18[2], verdict=v18),
                        h19=dict(pick=pick, r96=r96, r16=r16, verdict=v19), h20=dict(rho=rho20, verdict=v20))
    # E: where the DFN@100 seconds go, and the cheap-start extras head to head with the best screen (exploratory)
    L += ["", "E. (extra, not in the plan; exploratory) cost split and cheap-start co-kriging against the best whole-pool screen, cost A",
          f"{'pool':>4} {'method':<34} {'DFN@100 s':>9} {'low-rung s':>10}"]
    for P in POOLS:
        for m in ("GP-EI DFN@100", pick, pick + " cheap-start", min(SCREENS, key=lambda x: T("A", P, x))):
            c = C[f"A|{P}|{m}"]
            low = next((k for k in ("SPM@2", "SPM@100", "DFN@2") if k in m), None)
            cl = 0.0 if low is None else S_COST[tuple([low.split("@")[0], int(low.split("@")[1])])]
            L.append(f"{P:>4} {m:<34} {c['dfn_calls_median'] * S_COST[HI]:9.1f} {c['low_calls_median'] * cl:10.1f}")
    L += ["", f"{'pool':>4} {'cheap-start variant':<34} {'best screen':<16} {'T1 med':>7} {'screen':>7} {'wins':>4} {'losses':>6} {'p':>6}"]
    summary["extra"] = {}
    for P in POOLS:
        best = min(SCREENS, key=lambda x: T("A", P, x))
        for m in EXTRA:
            a, b = C[f"A|{P}|{m}"]["T1"], C[f"A|{P}|{best}"]["T1"]
            w = sum(x < y for x, y in zip(a, b))
            l = sum(x > y for x, y in zip(a, b))
            p = S.wilcoxon(a, b)
            summary["extra"][f"{P}|{m}"] = dict(best_screen=best, wins=w, losses=l, p=p)
            L.append(f"{P:>4} {m:<34} {best:<16} {med(a):7.1f} {med(b):7.1f} {w:>4} {l:>6} {p:6.2g}")
    # figure data: median T1 vs pool size (cost A)
    fig = ["GP-EI DFN@100", "screen SPM@100", pick, pick + " cheap-start", "screen SPM@2", "screen DFN@2"]
    L += ["", "F. median T1 (charged s, cost A) against pool size (figure data)",
          "pool " + " ".join(f"[{m}]" for m in fig)]
    for P in POOLS:
        L.append(f"{P} " + " ".join(f"{T('A', P, m):.3f}" for m in fig))
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(summary, indent=1) + "\n")
    print("\n".join(L))


def spearman(a, b):
    def rk(v):
        o = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        i = 0
        while i < len(o):
            j = i
            while j + 1 < len(o) and v[o[j + 1]] == v[o[i]]:
                j += 1
            for k in range(i, j + 1):
                r[o[k]] = (i + j) / 2
            i = j + 1
        return r
    ra, rb = rk(a), rk(b)
    ma, mb = sum(ra) / len(ra), sum(rb) / len(rb)
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    den = math.sqrt(sum((x - ma) ** 2 for x in ra) * sum((y - mb) ** 2 for y in rb))
    return num / den if den else 0.0


if __name__ == "__main__":
    import sys
    if "--report" in sys.argv:
        old = json.loads((HERE / "summary.json").read_text())
        report({k: dict(T1=v["T1"], nhi=v["nhi"], nlo=v["nlo"]) for k, v in old["cells"].items()}, old["info"])
    else:
        main()
