"""Milestone 5i: a closed-form salt-depletion number that says where SPMe breaks, before any simulation.

    python experiments/sand/run.py committed  # r_ss (and r_t) for every committed design -> committed.jsonl (pybamm for parameters, seconds)
    python experiments/sand/run.py bench      # fresh sweep: 4 cells x 6 currents x 17 designs x SPMe/DFN for 2 cycles (resumable)
    python experiments/sand/run.py report     # results.txt, summary.json (stdlib)

The predictor and H64 to H68 are fixed in ../../LOG.md (milestone 5i plan) before any r_ss was computed. Simulation,
design mapping, scaled current and copied degradation keys are milestone 5g's (../gate/run.py), imported unchanged.
"""
import importlib.util
import json
import math
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent

FRESH_CELLS = ("Ramadass2004", "Marquis2019", "Mohtat2020", "NCA_Kim2011")   # amended before the bench, see LOG
FRESH_RATES = (0.25, 0.5, 1.0, 1.5, 2.0, 3.0)
SOBOL_SEED = 7
N_LOG2 = 4
WORKERS = int(os.environ.get("WORKERS", "3"))
R_FLAG = 0.10


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


# ---------- the predictor (pure, stdlib; tested) ----------

def profile(Ln, Ls, Lp, en, es, ep, Dn, Ds, Dp, q, **_):
    """Steady linear electrolyte problem, uniform reaction in each electrode, zero flux at both collectors.
    Returns (u at x=0, u at x=L, porosity-weighted mean of u) for the discharge profile u with u(0) = 0;
    D* are effective diffusivities, q = (1 - t+) i / F the salt flux through the separator (mol/m2/s)."""
    u_n = -q * Ln / (2 * Dn)                  # at the negative/separator interface
    u_s = u_n - q * Ls / Ds                   # at the separator/positive interface
    u_L = u_s - q * Lp / (2 * Dp)
    I_n = -q * Ln ** 2 / (6 * Dn)
    I_s = Ls * u_n - q * Ls ** 2 / (2 * Ds)
    I_p = Lp * u_s - q * Lp ** 2 / (3 * Dp)
    mean = (en * I_n + es * I_s + ep * I_p) / (en * Ln + es * Ls + ep * Lp)
    return 0.0, u_L, mean


def r_ss(geo, q, c0):
    """Minimum steady salt ratio over discharge (minimum at the positive collector) and charge at the same current
    (the profile mirrored about c0, minimum at the negative collector)."""
    u0, uL, mean = profile(q=q, **geo)
    return min(1 + (uL - mean) / c0, 1 + (mean - u0) / c0)


def tau(geo):
    """Slowest-mode time constant: (sum L)^2 / pi^2 over the porosity-weighted mean of D_eff / eps."""
    L = geo["Ln"] + geo["Ls"] + geo["Lp"]
    w = [(geo["Ln"], geo["en"], geo["Dn"]), (geo["Ls"], geo["es"], geo["Ds"]), (geo["Lp"], geo["ep"], geo["Dp"])]
    # series resistance to diffusion, capacity sum of eps L: tau = (sum eps L)(sum L/D) / pi^2
    return sum(l * e for l, e, _ in w) * sum(l / d for l, _, d in w) / math.pi ** 2


def _w(Ln, Ls, Lp, bn, bs, bp, q, n=200):
    """Discharge profile of the Kirchhoff variable Phi(c) = int_0^c D_e, relative to x = 0, on a grid:
    the same piecewise shape as profile() with unit diffusivity scaled by eps^b. Returns [(x weight * eps, w)]."""
    pts = []
    for k, (L, tort) in enumerate(((Ln, bn), (Ls, bs), (Lp, bp))):
        for m in range(n):
            pts.append((k, L, tort, (m + 0.5) / n * L, L / n))
    u_n = -q * Ln / (2 * bn)
    u_s = u_n - q * Ls / bs
    out = []
    for k, L, tort, x, dx in pts:
        if k == 0:
            w = -q * x ** 2 / (2 * Ln * bn)
        elif k == 1:
            w = u_n - q * x / bs
        else:
            w = u_s - q * (x - x ** 2 / (2 * Lp)) / bp
        out.append((k, dx, w))
    end = u_s - q * Lp / (2 * bp)
    return out, end


def r_kt(geo_k, q, c0, cgrid, phigrid):
    """Post hoc (milestone 5i): steady state with concentration-dependent D_e(c) through the Kirchhoff transform.
    geo_k: Ln, Ls, Lp, en, es, ep, bn, bs, bp (bn = eps_n^brugg, tortuosity factor, no D_e). cgrid/phigrid tabulate
    Phi(c) = int_0^c D_e(c') dc' on c >= 0 (increasing); below 0 Phi is extended linearly with D_e(0), so a design
    that empties its electrolyte gets a negative, still ordered, value. Mass is conserved in c. Returns min c / c0
    over discharge and charge."""
    import bisect
    d0 = (phigrid[1] - phigrid[0]) / (cgrid[1] - cgrid[0])

    def c_of(phi):
        if phi <= 0:
            return phi / d0
        i = bisect.bisect_left(phigrid, phi)
        if i >= len(phigrid):
            i = len(phigrid) - 1
            return cgrid[i] + (phi - phigrid[i]) / ((phigrid[i] - phigrid[i - 1]) / (cgrid[i] - cgrid[i - 1]))
        f = (phi - phigrid[i - 1]) / (phigrid[i] - phigrid[i - 1])
        return cgrid[i - 1] + f * (cgrid[i] - cgrid[i - 1])

    eps = (geo_k["en"], geo_k["es"], geo_k["ep"])
    pts, end = _w(geo_k["Ln"], geo_k["Ls"], geo_k["Lp"], geo_k["bn"], geo_k["bs"], geo_k["bp"], q)
    tot = sum(eps[k] * dx for k, dx, _ in pts)
    res = []
    for sign in (1, -1):
        def mass(ref):
            return sum(eps[k] * dx * c_of(ref + sign * w) for k, dx, w in pts) / tot - c0
        lo, hi = -abs(end) - phigrid[-1], abs(end) + phigrid[-1] * 4
        for _ in range(100):
            mid = (lo + hi) / 2
            if mass(mid) > 0:
                hi = mid
            else:
                lo = mid
        ref = (lo + hi) / 2
        res.append(c_of(ref + (sign * end if sign == 1 else 0.0)) / c0 if sign == 1 else c_of(ref) / c0)
    return min(res)


def r_t(rss, t_d, tau_):
    return 1 - (1 - rss) * (1 - math.exp(-t_d / tau_))


def spearman(a, b):
    def rank(v):
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
    ra, rb = rank(a), rank(b)
    n = len(a)
    ma, mb = sum(ra) / n, sum(rb) / n
    cov = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    va, vb = sum((x - ma) ** 2 for x in ra), sum((y - mb) ** 2 for y in rb)
    return cov / math.sqrt(va * vb) if va > 0 and vb > 0 else float("nan")


def auc(score, label):
    """P(score of a positive > score of a negative), ties half."""
    pos = [s for s, l in zip(score, label) if l]
    neg = [s for s, l in zip(score, label) if not l]
    if not pos or not neg:
        return float("nan")
    return sum((p > n) + 0.5 * (p == n) for p in pos for n in neg) / (len(pos) * len(neg))


def crossing(rss_at_1):
    """Current multiple at which r_ss = R_FLAG, given r_ss at multiple 1 (r_ss is linear in current)."""
    d = 1 - rss_at_1
    return (1 - R_FLAG) / d if d > 0 else float("inf")


# ---------- parameters (pybamm) ----------

G = None


def _gate():
    global G
    if G is None:
        G = _mod("gate_run", EXP / "gate" / "run.py")
    return G


def geometry(x, pset, rate):
    """(geo, q, c0, t_d) for design x of parameter set pset at `rate` x 5b's areal current density."""
    import pybamm
    TR = _gate().TR
    pv, _, cur = TR.params(x, pset)
    cur *= rate
    p = pybamm.LithiumIonParameters()
    c0 = pv["Initial concentration in electrolyte [mol.m-3]"]
    T = pv["Initial temperature [K]"]
    De = float(pv.evaluate(p.D_e(pybamm.Scalar(c0), pybamm.Scalar(T))))
    tp = float(pv.evaluate(p.t_plus(pybamm.Scalar(c0), pybamm.Scalar(T))))
    geo = {}
    for k, (L, e) in {"n": ("Negative electrode thickness [m]", "Negative electrode porosity"),
                      "s": ("Separator thickness [m]", "Separator porosity"),
                      "p": ("Positive electrode thickness [m]", "Positive electrode porosity")}.items():
        name = {"n": "Negative electrode", "s": "Separator", "p": "Positive electrode"}[k]
        geo["L" + k], geo["e" + k] = float(pv[L]), float(pv[e])
        geo["b" + k] = geo["e" + k] ** float(pv[f"{name} Bruggeman coefficient (electrolyte)"])
        geo["D" + k] = De * geo["b" + k]
    i = cur / TR.area_parallel(pv)
    q = (1 - tp) * i / 96485.33212
    base = pybamm.ParameterValues(pset)
    load = lambda v: v["Positive electrode active material volume fraction"] * v["Positive electrode thickness [m]"]
    t_d = 3600 * base["Nominal cell capacity [A.h]"] * load(pv) / load(base) * (TR.area_parallel(pv) / TR.area_parallel(base)) / cur
    return geo, q, c0, t_d, cur


_PHI = {}


def phi_table(pset, n=400):
    """(c grid, Phi grid): Phi(c) = int_0^c D_e(c', T0) dc' over 0 to 3 c0, trapezoid; D_e floored at 1e-14."""
    if pset not in _PHI:
        import pybamm
        pv = pybamm.ParameterValues(pset)
        p = pybamm.LithiumIonParameters()
        c0, T = pv["Initial concentration in electrolyte [mol.m-3]"], pv["Initial temperature [K]"]
        cs = [3 * c0 * k / n for k in range(n + 1)]
        ds = [max(1e-14, float(pv.evaluate(p.D_e(pybamm.Scalar(c), pybamm.Scalar(T))))) for c in cs]
        ph = [0.0]
        for k in range(1, n + 1):
            ph.append(ph[-1] + 0.5 * (ds[k] + ds[k - 1]) * (cs[k] - cs[k - 1]))
        _PHI[pset] = (cs, ph)
    return _PHI[pset]


def predict(x, pset, rate):
    geo, q, c0, t_d, cur = geometry(x, pset, rate)
    rs = r_ss(geo, q, c0)
    ta = tau(geo)
    cs, ph = phi_table(pset)
    gk = {k: geo[k] for k in ("Ln", "Ls", "Lp", "en", "es", "ep", "bn", "bs", "bp")}
    rk = r_kt(gk, q, c0, cs, ph)
    return dict(r_ss=rs, r_kt=rk, r_t=r_t(rs, t_d, ta), tau=ta, t_d=t_d, current_A=cur)


# ---------- committed data ----------

def committed_conditions():
    """{condition: {(j, what): run}} for the 19 conditions of milestones 5b to 5h."""
    g = _gate()
    R = g.R
    by = {}
    for f in ("gate", "band"):
        for r in R._load(EXP / f / "bench.jsonl"):
            by.setdefault(r["cond"], {})[(r["j"], r["what"])] = r
    for s, runs in g.committed_cells().items():
        by[f"{s}@1x"] = runs
    return by


def _x(runs, j):
    for (jj, _), r in runs.items():
        if jj == j and r.get("x"):
            return r["x"]
    return None


def committed():
    g = _gate()
    SV, R = g.SV, g.R
    out = []
    for c, runs in committed_conditions().items():
        s, rate = g._parse(c)
        rows, dropped = g.pool(runs)
        byj = {r["j"]: r for r in rows}
        for j in sorted({j for j, _ in runs}):
            v0 = runs.get((j, "V0"))
            d = runs.get((j, "DFN"))
            x = _x(runs, j)
            if v0 is None or x is None:
                continue
            p = predict(x, s, rate)
            if v0.get("current_A") and abs(v0["current_A"] - p["current_A"]) > 1e-6 * p["current_A"]:
                raise SystemExit(f"current mismatch {c} {j}: {v0['current_A']} vs {p['current_A']}")
            fail = SV.kind(v0) == "fail"
            row = byj.get(j)
            out.append(dict(cond=c, set=s, rate=rate, j=j, **p,
                            spme_fail=fail, spme_r=None if fail else v0["r_min"],
                            dfn_r=d["r_min"] if d and SV.kind(d) != "fail" else None,
                            suspect=fail or v0["r_min"] <= R_FLAG,
                            in_pool=row is not None,
                            mis=R.mis_scored(row["score"], row["dfn"]) if row else None))
    (HERE / "committed.jsonl").write_text("".join(json.dumps(r) + "\n" for r in out))
    print(len(out), "designs")


# ---------- fresh sweep ----------

def designs():
    import numpy as np
    from scipy.stats import qmc
    from energy_cell import cell
    u = qmc.Sobol(d=4, scramble=True, seed=SOBOL_SEED).random_base2(N_LOG2)
    xs = [list(map(float, r)) for r in np.asarray(cell.BOUNDS[:, 0] + u * (cell.BOUNDS[:, 1] - cell.BOUNDS[:, 0]))]
    return xs + [list(map(float, cell.BASELINE))]      # j = 16 is the baseline design


def _run(job):
    s, rate, j, what, x = job
    r = _gate()._spawn(dict(x=x, set=s, rate=rate, what=what, cycles=2), timeout=900)
    r.pop("copied", None)
    return dict(set=s, rate=rate, j=j, what=what, x=x, **r)


def bench():
    g = _gate()
    path = HERE / "bench.jsonl"
    done = {(r["set"], r["rate"], r["j"], r["what"]) for r in g.R._load(path)}
    xs = designs()
    jobs = [(s, rate, j, w, xs[j]) for s in FRESH_CELLS for rate in FRESH_RATES for j in range(len(xs))
            for w in ("V0", "DFN") if (s, rate, j, w) not in done]
    with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as f:
        for r in ex.map(_run, jobs):
            if "exit -9" in (r.get("error") or ""):
                print(r["set"], r["rate"], r["j"], r["what"], "killed (-9), not recorded", flush=True)
                continue
            f.write(json.dumps(r) + "\n")
            f.flush()
            print(r["set"], r["rate"], r["j"], r["what"], r["ok"], r["ok_cycles"], r["seconds"] and round(r["seconds"], 1), flush=True)


def fresh_rows():
    g = _gate()
    SV = g.SV
    runs = {}
    for r in g.R._load(HERE / "bench.jsonl"):
        runs[(r["set"], r["rate"], r["j"], r["what"])] = r
    out = []
    for (s, rate, j, w), v0 in sorted(runs.items()):
        if w != "V0":
            continue
        d = runs.get((s, rate, j, "DFN"))
        fail = SV.kind(v0, cycles=2) == "fail"
        p = predict(v0["x"], s, rate)
        out.append(dict(set=s, rate=rate, j=j, **p, spme_fail=fail, spme_r=None if fail else v0["r_min"],
                        spme_cycles=v0.get("ok_cycles"),
                        dfn_ok=bool(d and SV.kind(d, cycles=2) == "ok"), dfn_r=d["r_min"] if d and d.get("ok") else None,
                        suspect=fail or v0["r_min"] <= R_FLAG))
    (HERE / "fresh.jsonl").write_text("".join(json.dumps(r) + "\n" for r in out))
    return out


# ---------- report (stdlib) ----------

def _load(name):
    p = HERE / name
    return [json.loads(l) for l in p.read_text().splitlines()] if p.exists() else []


def _f(v, d=2):
    return "nan" if v is None or (isinstance(v, float) and math.isnan(v)) else f"{v:.{d}f}"


def evaluate_committed(C):
    ran = [r for r in C if not r["spme_fail"]]
    conds = sorted({r["cond"] for r in C}, key=lambda c: [r["cond"] for r in C].index(c))
    per = {}
    for c in conds:
        rc = [r for r in C if r["cond"] == c]
        rr = [r for r in rc if not r["spme_fail"]]
        rng = (max(r["spme_r"] for r in rr) - min(r["spme_r"] for r in rr)) if rr else 0
        pool = [r for r in rc if r["in_pool"]]
        per[c] = dict(n=len(rc), rho=spearman([r["r_ss"] for r in rr], [r["spme_r"] for r in rr]) if len(rr) > 2 else float("nan"),
                      spme_r_range=rng,
                      share_obs=sum(r["suspect"] for r in rc) / len(rc),
                      share_pred=sum(r["r_ss"] <= R_FLAG for r in rc) / len(rc),
                      n_mis=sum(bool(r["mis"]) for r in pool), n_pool=len(pool),
                      rss_med=sorted(r["r_ss"] for r in rc)[len(rc) // 2],
                      spme_r_med=sorted(r["spme_r"] if r["spme_r"] is not None else 0.0 for r in rc)[len(rc) // 2])
    pool = [r for r in C if r["in_pool"]]
    mis = [bool(r["mis"]) for r in pool]
    dfn = [r for r in C if r["dfn_r"] is not None]
    s = dict(
        n=len(C), n_ran=len(ran), n_cond=len(conds),
        rho_pooled=spearman([r["r_ss"] for r in ran], [r["spme_r"] for r in ran]),
        rho_t_pooled=spearman([r["r_t"] for r in ran], [r["spme_r"] for r in ran]),
        rho_dfn_pooled=spearman([r["r_ss"] for r in dfn], [r["dfn_r"] for r in dfn]),
        n_cond_rho_06=sum(1 for c in conds if per[c]["rho"] >= 0.6),
        auc_suspect=auc([-r["r_ss"] for r in C], [r["suspect"] for r in C]),
        auc_suspect_t=auc([-r["r_t"] for r in C], [r["suspect"] for r in C]),
        miscls=sum((r["r_ss"] <= R_FLAG) != r["suspect"] for r in C) / len(C),
        miscls_t=sum((r["r_t"] <= R_FLAG) != r["suspect"] for r in C) / len(C),
        n_share_ok=sum(1 for c in conds if abs(per[c]["share_pred"] - per[c]["share_obs"]) <= 0.15),
        n_pool=len(pool), n_mis=sum(mis),
        auc_mis=auc([-r["r_ss"] for r in pool], mis),
        auc_mis_t=auc([-r["r_t"] for r in pool], mis),
        auc_mis_sim=auc([-(r["spme_r"] if r["spme_r"] is not None else 0.0) for r in pool], mis),
    )
    s.update(kt_metrics(C))
    for c in conds:
        rc = [r for r in C if r["cond"] == c]
        per[c]["share_kt"] = sum(r["r_kt"] <= R_FLAG for r in rc) / len(rc)
    s["n_share_ok_kt"] = sum(1 for c in conds if abs(per[c]["share_kt"] - per[c]["share_obs"]) <= 0.15)
    s["auc_mis_kt"] = auc([-r["r_kt"] for r in pool], mis)
    return s, per


def kt_metrics(rows):
    ran = [r for r in rows if not r["spme_fail"]]
    dfn = [r for r in rows if r["dfn_r"] is not None]
    wrong = [r for r in rows if (r["r_kt"] <= R_FLAG) != r["suspect"]]
    return dict(kt_rho=spearman([r["r_kt"] for r in ran], [r["spme_r"] for r in ran]) if len(ran) > 2 else float("nan"),
                kt_auc=auc([-r["r_kt"] for r in rows], [r["suspect"] for r in rows]),
                kt_miscls=len(wrong) / len(rows) if rows else float("nan"),
                kt_wrong=[(r.get("cond") or f"{r['set']}@{r['rate']:g}x", r["j"], round(r["r_kt"], 3),
                           None if r["spme_r"] is None else round(r["spme_r"], 3), r["spme_fail"]) for r in wrong],
                kt_mae=(sum(abs(max(r["r_kt"], 0) - max(r["spme_r"], 0)) for r in ran) / len(ran)) if ran else float("nan"),
                lin_mae=(sum(abs(max(r["r_ss"], 0) - max(r["spme_r"], 0)) for r in ran) / len(ran)) if ran else float("nan"),
                kt_rho_dfn=spearman([r["r_kt"] for r in dfn], [r["dfn_r"] for r in dfn]) if len(dfn) > 2 else float("nan"),
                kt_mae_dfn=(sum(abs(max(r["r_kt"], 0) - max(r["dfn_r"], 0)) for r in dfn) / len(dfn)) if dfn else float("nan"))


def evaluate_fresh(F):
    s = dict(n=len(F), auc=auc([-r["r_ss"] for r in F], [r["suspect"] for r in F]),
             auc_t=auc([-r["r_t"] for r in F], [r["suspect"] for r in F]),
             miscls=sum((r["r_ss"] <= R_FLAG) != r["suspect"] for r in F) / len(F) if F else float("nan"),
             n_suspect=sum(r["suspect"] for r in F))
    ran = [r for r in F if not r["spme_fail"]]
    s["rho"] = spearman([r["r_ss"] for r in ran], [r["spme_r"] for r in ran]) if len(ran) > 2 else float("nan")
    dfn = [r for r in F if r["dfn_r"] is not None]
    s["rho_dfn"] = spearman([r["r_ss"] for r in dfn], [r["dfn_r"] for r in dfn]) if len(dfn) > 2 else float("nan")
    cells = {}
    for c in FRESH_CELLS:
        b = sorted((r for r in F if r["set"] == c and r["j"] == 16), key=lambda r: r["rate"])
        if not b:
            continue
        r1 = [r for r in b if r["rate"] == 1.0]
        pred = crossing(r1[0]["r_ss"]) if r1 else float("nan")
        lo = max((r["rate"] for r in b if not r["suspect"]), default=None)
        hi = min((r["rate"] for r in b if r["suspect"]), default=None)
        # within a factor f of the bracket [lo, hi] (open ends when the sweep never or always crosses)
        def miss(f):
            if hi is not None and pred > hi * f:
                return True
            if lo is not None and pred < lo / f:
                return True
            return False
        sub = [r for r in F if r["set"] == c]
        cells[c] = dict(pred=pred, lo=lo, hi=hi, within_15=not miss(1.5), within_2=not miss(2.0),
                        rss_1x=r1[0]["r_ss"] if r1 else None,
                        auc=auc([-r["r_ss"] for r in sub], [r["suspect"] for r in sub]),
                        n_suspect=sum(r["suspect"] for r in sub), n=len(sub),
                        n_dfn_drop=sum(not r["dfn_ok"] for r in sub),
                        base=[(r["rate"], r["r_ss"], r["r_kt"], r["spme_r"], r["dfn_r"], r["suspect"]) for r in b])
    s["cells"] = cells
    s.update(kt_metrics(F))
    return s


def verdicts(s, f):
    v = {}
    v["H64"] = ("supported" if s["rho_pooled"] >= 0.8 and s["n_cond_rho_06"] >= 15 else
                "refuted" if s["rho_pooled"] < 0.6 else "mixed")
    v["H65"] = ("supported" if s["auc_suspect"] >= 0.90 and s["miscls"] <= 0.15 else
                "refuted" if s["auc_suspect"] < 0.80 or s["miscls"] > 0.25 else "mixed")
    v["H66"] = ("supported" if s["n_share_ok"] >= 15 else "refuted" if s["n_share_ok"] < 10 else "mixed")
    v["H67"] = ("supported" if s["auc_mis"] >= 0.80 and s["auc_mis"] >= s["auc_mis_sim"] - 0.05 else
                "refuted" if s["auc_mis"] < 0.70 else "mixed")
    if f and f.get("cells"):
        n15 = sum(c["within_15"] for c in f["cells"].values())
        n2miss = sum(not c["within_2"] for c in f["cells"].values())
        v["H69"] = ("supported" if f["kt_miscls"] <= 0.02 and f["kt_mae"] <= 0.02 else
                    "refuted" if f["kt_miscls"] > 0.05 or f["kt_mae"] > 0.05 else "mixed")
        v["H68"] = ("supported" if f["auc"] >= 0.90 and n15 == len(f["cells"]) else
                    "refuted" if f["auc"] < 0.80 or n2miss >= 2 else "mixed")
    return v


def report():
    C = _load("committed.jsonl")
    s, per = evaluate_committed(C)
    F = fresh_rows() if (HERE / "bench.jsonl").exists() else []
    f = evaluate_fresh(F) if F else None
    v = verdicts(s, f)
    L = ["Milestone 5i: closed-form steady salt depletion r_ss against committed and fresh SPMe labels", "",
         f"Committed: {s['n']} designs over {s['n_cond']} conditions ({s['n_ran']} where SPMe returned a run; {s['n_pool']} in 5e's pools, {s['n_mis']} mis-scored)",
         f"H64 {v['H64']}: Spearman(r_ss, SPMe r_min) pooled {_f(s['rho_pooled'])}; conditions with rho >= 0.6: {s['n_cond_rho_06']} of {s['n_cond']}",
         f"H65 {v['H65']}: AUC(-r_ss, suspect) {_f(s['auc_suspect'], 3)}; rule r_ss <= 0.10 misclassifies {_f(s['miscls'], 3)}",
         f"H66 {v['H66']}: predicted share within 0.15 of observed on {s['n_share_ok']} of {s['n_cond']}",
         f"H67 {v['H67']}: AUC(-r_ss, mis-scored) {_f(s['auc_mis'], 3)}; SPMe's own r_min {_f(s['auc_mis_sim'], 3)}",
         f"No verdict: r_t AUC suspect {_f(s['auc_suspect_t'], 3)}, misclassification {_f(s['miscls_t'], 3)}, AUC mis-scored {_f(s['auc_mis_t'], 3)};"
         f" Spearman r_t {_f(s['rho_t_pooled'])}; Spearman(r_ss, DFN r_min) {_f(s['rho_dfn_pooled'])}",
         f"Post hoc r_kt (D_e(c), Kirchhoff; written after H64 to H67): Spearman {_f(s['kt_rho'], 3)}; AUC suspect {_f(s['kt_auc'], 4)};"
         f" misclassifies {_f(s['kt_miscls'], 4)} ({len(s['kt_wrong'])} designs: {s['kt_wrong']}); share within 0.15 on {s['n_share_ok_kt']} of {s['n_cond']};"
         f" AUC mis-scored {_f(s['auc_mis_kt'], 3)}; mean |r_kt - r_SPMe| {_f(s['kt_mae'], 4)} (linear r_ss {_f(s['lin_mae'], 4)});"
         f" against DFN r_min: Spearman {_f(s['kt_rho_dfn'], 3)}, mean abs {_f(s['kt_mae_dfn'], 3)}", "",
         "Per condition: n, Spearman, SPMe r_min range, observed share, predicted share (r_ss; r_kt), median r_ss, median SPMe r_min, mis-scored/pool"]
    for c, p in per.items():
        L.append(f"  {c:18s} {p['n']:3d} rho {_f(p['rho'])} range {_f(p['spme_r_range'])} share obs {_f(p['share_obs'])} pred {_f(p['share_pred'])}; {_f(p['share_kt'])}"
                 f" med r_ss {_f(p['rss_med'])} med r {_f(p['spme_r_med'])} mis {p['n_mis']}/{p['n_pool']}")
    if f:
        L += ["", f"Fresh sweep: {f['n']} SPMe runs, {f['n_suspect']} suspect",
              f"H68 {v.get('H68')}: AUC(-r_ss, suspect) {_f(f['auc'], 3)} (r_t {_f(f['auc_t'], 3)}); misclassification {_f(f['miscls'], 3)};"
              f" Spearman SPMe {_f(f['rho'])}, DFN {_f(f['rho_dfn'])}",
              f"H69 {v.get('H69')}: r_kt <= 0.10 misclassifies {_f(f['kt_miscls'], 4)} ({len(f['kt_wrong'])}: {f['kt_wrong']}); mean |r_kt - r_SPMe| {_f(f['kt_mae'], 4)}"
              f" (linear {_f(f['lin_mae'], 4)}); AUC {_f(f['kt_auc'], 4)}; against DFN r_min Spearman {_f(f['kt_rho_dfn'], 3)}, mean abs {_f(f['kt_mae_dfn'], 3)}"]
        for c, d in f["cells"].items():
            L.append(f"  {c}: predicted crossing {_f(d['pred'])}x (r_ss at 1x {_f(d['rss_1x'], 3)}); observed bracket ({d['lo']}, {d['hi']});"
                     f" within 1.5x {d['within_15']}, within 2x {d['within_2']}; AUC {_f(d['auc'], 3)}; suspect {d['n_suspect']}/{d['n']}; DFN not finished {d['n_dfn_drop']}")
            for rate, rs, rk, sr, dr, su in d["base"]:
                L.append(f"     baseline {rate:g}x: r_ss {_f(rs, 3)} r_kt {_f(rk, 3)} SPMe r_min {_f(sr, 3)} DFN r_min {_f(dr, 3)} suspect {su}")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(committed=s, per_condition=per, fresh=f, verdicts=v), indent=1, default=str) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "report"
    {"committed": committed, "bench": bench, "report": report}[cmd]()
