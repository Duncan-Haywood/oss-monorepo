"""Milestone 5r: does an electrode-balance map turn the lithium a DFN design loses into the energy it loses?

    python experiments/balance/run.py bench    # fresh DFN bench: 8 conditions x designs 5 to 12 (by j) x {both, none}, 20 cycles -> bench.jsonl
    python experiments/balance/run.py tables   # per design: electrode capacities, cyclable lithium, OCP tables (pybamm, no simulation) -> balance.jsonl
    python experiments/balance/run.py report   # dev (5p's bench) and fresh verdicts, H104 to H107 (stdlib) -> results.txt, summary.json

5p found that lithium plating causes the DFN designs' fade; 5q found that energy lost per unit of lithium lost varies about
threefold between designs of one pool, so a lithium-loss rate alone cannot rank fade, and asked for an electrode-balance map.
This milestone builds that map with no simulation: from the parameter set and the design, the two electrodes' lithium
capacities Q_n and Q_p (mol), the cyclable lithium n_Li and the two OCP curves, it finds the open-circuit window between the
voltage cut-offs (U_p(y) - U_n(x) = V, with Q_n x + Q_p y = n_Li) and the energy F Q_n int (U_p - U_n) dx inside it. Fade
predicted from cycle 2 to cycle n is 1 - E(n_Li,2 - dL) / E(n_Li,2), with dL the lithium the DFN run itself lost in between.
It is the decomposition test: if the map is right, a cheap fade predictor needs only the lithium-loss rate. Plan and
H104 to H107 in ../../LOG.md (5r plan). Designs, mapping, current and protocol are 5p's (5g's), unchanged.
"""
import importlib.util
import json
import math
import os
import statistics
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent

CYCLES = 20
WORKERS = int(os.environ.get("WORKERS", "3"))
CONDITIONS = ("OKane2022@1x", "Ai2020@0.3x", "Ai2020@1x", "Chen2020@1x", "Ecker2015@1x", "NCA_Kim2011@1x",
              "Mohtat2020@1x", "Marquis2019@1x")   # 5p's eight
FRESH = range(4, 12)   # 5p ran the first 4 designs (by j) of each committed pool; the fresh bench runs the next 8
VARIANTS = {"both": {"SEI": "solvent-diffusion limited", "lithium plating": "irreversible"}, "none": {}}
F_CONST = 96485.33212
GRID = [1e-4 + k * (1 - 2e-4) / 400 for k in range(401)]   # stoichiometries the OCP tables are stored at
MIN_LLI = 0.03        # a design "fades" when it loses more than 3% of its cyclable lithium from cycle 2 to 20
K_DEV = 1.64         # proportional baseline: median DFN added fade per lithium share over the dev bench's 20 fading designs (1.636)
TOL = 0.05            # H104: |map - DFN degradation-added fade| within this


# ---------- pure helpers (stdlib; tested) ----------

def interp(gx, gy, x):
    """Linear interpolation on an increasing grid, clamped at both ends."""
    if x <= gx[0]:
        return gy[0]
    if x >= gx[-1]:
        return gy[-1]
    lo, hi = 0, len(gx) - 1
    while hi - lo > 1:
        m = (lo + hi) // 2
        if gx[m] <= x:
            lo = m
        else:
            hi = m
    w = (x - gx[lo]) / (gx[hi] - gx[lo])
    return gy[lo] + w * (gy[hi] - gy[lo])


def ocv(x, n_li, b):
    """Open-circuit voltage at negative stoichiometry x when the electrodes hold n_li mol of lithium between them."""
    y = (n_li - b["Qn"] * x) / b["Qp"]
    return interp(b["g"], b["Up"], y) - interp(b["g"], b["Un"], x)


def x_bounds(n_li, b):
    """The negative stoichiometries reachable with both x and y = (n_li - Qn x) / Qp inside the tabulated range."""
    g0, g1 = b["g"][0], b["g"][-1]
    return max(g0, (n_li - b["Qp"] * g1) / b["Qn"]), min(g1, (n_li - b["Qp"] * g0) / b["Qn"])


def _root(fn, lo, hi, it=60):
    """Bisection for an increasing fn; returns the bound when fn does not change sign on [lo, hi]."""
    if fn(lo) >= 0:
        return lo
    if fn(hi) <= 0:
        return hi
    for _ in range(it):
        m = 0.5 * (lo + hi)
        if fn(m) < 0:
            lo = m
        else:
            hi = m
    return 0.5 * (lo + hi)


def window(n_li, b):
    """(x0, x1): the negative stoichiometry at the lower and the upper voltage cut-off (OCV rises with x)."""
    lo, hi = x_bounds(n_li, b)
    if hi <= lo:
        return lo, lo
    return (_root(lambda x: ocv(x, n_li, b) - b["vlo"], lo, hi),
            _root(lambda x: ocv(x, n_li, b) - b["vhi"], lo, hi))


def ocv_energy(n_li, b, n=200):
    """Open-circuit energy (Wh) and capacity (Ah) between the cut-offs: F Qn int_{x0}^{x1} OCV dx (midpoint rule)."""
    x0, x1 = window(n_li, b)
    if x1 <= x0:
        return 0.0, 0.0
    h = (x1 - x0) / n
    s = sum(ocv(x0 + (k + 0.5) * h, n_li, b) for k in range(n)) * h
    return F_CONST * b["Qn"] * s / 3600.0, F_CONST * b["Qn"] * (x1 - x0) / 3600.0


def map_fade(b, lost, lo=2, hi=CYCLES):
    """Predicted energy fade from cycle lo to cycle hi (1-based) given the run's lithium lost by the end of each cycle.
    Cycle k's discharge starts after cycle k-1's charge, so it holds n_Li - lost[k-2] (cycle 1 holds n_Li)."""
    n_lo = b["n_li"] - (lost[lo - 2] if lo >= 2 else 0.0)
    n_hi = b["n_li"] - (lost[hi - 2] if hi >= 2 else 0.0)
    e_lo, _ = ocv_energy(n_lo, b)
    e_hi, _ = ocv_energy(n_hi, b)
    return 1.0 - e_hi / e_lo if e_lo > 0 else None


def lli_share(b, lost, lo=2, hi=CYCLES):
    """Cyclable lithium lost between cycle lo's discharge and cycle hi's, as a share of n_Li."""
    return ((lost[hi - 2] if hi >= 2 else 0.0) - (lost[lo - 2] if lo >= 2 else 0.0)) / b["n_li"]


def fade(wh, lo=2, hi=CYCLES):
    return 1.0 - wh[hi - 1] / wh[lo - 1]


def ranks(a):
    order = sorted(range(len(a)), key=lambda i: a[i])
    r = [0.0] * len(a)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and a[order[j + 1]] == a[order[i]]:
            j += 1
        for k in range(i, j + 1):
            r[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return r


def spearman(a, b):
    if len(a) < 3:
        return None
    ra, rb = ranks(a), ranks(b)
    ma, mb = sum(ra) / len(ra), sum(rb) / len(rb)
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    den = math.sqrt(sum((x - ma) ** 2 for x in ra) * sum((y - mb) ** 2 for y in rb))
    return num / den if den else None


# ---------- pybamm: tables and bench ----------

def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _fc():
    return _mod("frontcut_run", EXP / "frontcut" / "run.py")


def designs():
    """[(cond, j, x, fresh)]: 5p's four (dev) and the next eight (fresh) designs by j of each committed pool."""
    fc = _fc()
    D, xs = fc.dev_conditions(), fc._x_index()
    out = []
    for c in CONDITIONS:
        js = sorted(r["j"] for r in D[c] if (c, r["j"]) in xs)
        out += [(c, j, xs[(c, j)], False) for j in js[:4]]
        out += [(c, j, xs[(c, j)], True) for j in [js[k] for k in FRESH if k < len(js)]]
    return out


def _ocp_table(pybamm, np, pv, key):
    f = pv[key]
    T = pv["Reference temperature [K]"]
    out = []
    for x in GRID:
        try:
            v = f(pybamm.Scalar(x))
        except TypeError:
            v = f(pybamm.Scalar(x), pybamm.Scalar(T))
        out.append(round(float(np.asarray(pv.evaluate(v)).ravel()[0]), 7))
    return out


def balance(c, x, pybamm, np, fc, cell, cache):
    """Electrode balance of one design: lithium capacities (mol, parallel count included), cyclable lithium (mol, both
    particles' initial concentrations, which PyBaMM's initial_soc keeps), cut-offs, and the set's OCP tables."""
    s, _ = fc.G._parse(c)
    pv, _, _ = fc.G.TR.params(cell.clip(x), s)
    A = fc.G.TR.area_parallel(pv)
    vn = pv["Negative electrode active material volume fraction"] * pv["Negative electrode thickness [m]"] * A
    vp = pv["Positive electrode active material volume fraction"] * pv["Positive electrode thickness [m]"] * A
    if s not in cache:
        cache[s] = (_ocp_table(pybamm, np, pv, "Negative electrode OCP [V]"), _ocp_table(pybamm, np, pv, "Positive electrode OCP [V]"))
    return dict(Qn=float(pv["Maximum concentration in negative electrode [mol.m-3]"] * vn),
                Qp=float(pv["Maximum concentration in positive electrode [mol.m-3]"] * vp),
                n_li=float(pv["Initial concentration in negative electrode [mol.m-3]"] * vn
                           + pv["Initial concentration in positive electrode [mol.m-3]"] * vp),
                vlo=float(pv["Lower voltage cut-off [V]"]), vhi=float(pv["Upper voltage cut-off [V]"]), pset=s)


def tables():
    import numpy as np
    import pybamm
    fc, cache, rows = _fc(), {}, []
    from energy_cell import cell
    pybamm.set_logging_level("ERROR")
    t0 = time.perf_counter()
    for c, j, x, fresh in designs():
        rows.append(dict(cond=c, j=j, fresh=fresh) | balance(c, x, pybamm, np, fc, cell, cache))
    with (HERE / "balance.jsonl").open("w") as fh:
        for r in rows:
            fh.write(json.dumps(r) + "\n")
    (HERE / "ocp.json").write_text(json.dumps(dict(grid=GRID, sets={s: dict(Un=u[0], Up=u[1]) for s, u in cache.items()})))
    print(f"{len(rows)} designs, {len(cache)} sets, {time.perf_counter() - t0:.1f} s")


def simulate(job):
    import numpy as np
    import pybamm
    fc = _fc()
    from energy_cell import cell
    pybamm.set_logging_level("ERROR")
    c, j, v, x = job
    s, rate = fc.G._parse(c)
    x = cell.clip(x)
    S, TR = fc.P._sand(), fc.G.TR
    _, _, _, _, cur = S.geometry(x, s, rate)
    pv, _, _ = TR.params(x, s)
    vlo, vhi = pv["Lower voltage cut-off [V]"], pv["Upper voltage cut-off [V]"]
    out = dict(cond=c, j=j, variant=v, x=list(map(float, x)), current_A=cur, ok=True, error=None)
    exp = pybamm.Experiment([(f"Discharge at {cur:.6g} A until {vlo} V", f"Charge at {cur:.6g} A until {vhi} V")] * CYCLES)
    t0 = time.perf_counter()
    try:
        sol = pybamm.Simulation(pybamm.lithium_ion.DFN(VARIANTS[v]), parameter_values=pv, experiment=exp).solve(initial_soc=1.0)
        wh, ah, lost, part = [], [], [], []
        for cy in sol.cycles:
            d = cy.steps[0]
            i, t = d["Current [A]"].entries, d["Time [s]"].entries
            wh.append(float(np.trapezoid(d["Terminal voltage [V]"].entries * i, t)) / 3600)
            ah.append(float(np.trapezoid(i, t)) / 3600)
            lost.append(float(cy["Total lithium lost [mol]"].entries[-1]))
            part.append(float(cy["Total lithium in particles [mol]"].entries[-1]))
        out.update(cycle_wh=wh, cycle_ah=ah, lost_mol=lost, particle_mol=part,
                   particle_mol_init=float(sol["Total lithium in particles [mol]"].entries[0]), ok_cycles=len(sol.cycles))
    except Exception as ex:
        out.update(ok=False, error=f"{type(ex).__name__}: {str(ex)[:160]}")
    out["seconds"] = time.perf_counter() - t0
    return out


def _load(path):
    return [json.loads(l) for l in path.read_text().splitlines() if l.strip()] if path.exists() else []


def _spawn(job, timeout=1800):
    """One fresh process per run, as 5p: a solver crash fails one run, not the bench."""
    c, j, v, x = job
    try:
        p = subprocess.run([sys.executable, __file__, "child", json.dumps([c, j, v, list(map(float, x))])],
                           capture_output=True, text=True, timeout=timeout)
        if p.returncode == 0 and p.stdout.strip():
            return json.loads(p.stdout.strip().splitlines()[-1])
        err = f"exit {p.returncode}: {p.stderr.strip()[-160:]}"
    except subprocess.TimeoutExpired:
        err = f"timeout {timeout}s"
    return dict(cond=c, j=j, variant=v, x=list(map(float, x)), ok=False, error=err, seconds=None)


def bench():
    path = HERE / "bench.jsonl"
    done = {(r["cond"], r["j"], r["variant"]) for r in _load(path)}
    todo = [(c, j, v, x) for c, j, x, fresh in designs() if fresh for v in VARIANTS if (c, j, v) not in done]
    print(f"{len(todo)} runs to go", flush=True)
    with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as fh:
        for r in ex.map(_spawn, todo):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            print(r["cond"], r["j"], r["variant"], "ok" if r["ok"] else r["error"], flush=True)


# ---------- report (stdlib) ----------

def verdict(ok, bad):
    return "supported" if ok else ("refuted" if bad else "mixed")


def score(runs, bal, ocp):
    """Per design with both variants complete to CYCLES: DFN degradation-added fade, the map's fade from the 'both' run's
    lithium loss, the lithium share lost, and DFN's cycle-2 energy over the map's open-circuit energy (how far the
    design sits from open circuit at this current)."""
    by = {}
    for r in runs:
        by.setdefault((r["cond"], r["j"]), {})[r["variant"]] = r
    out = []
    for key, vs in sorted(by.items()):
        if key not in bal or not all(v in vs and vs[v]["ok"] and len(vs[v]["cycle_wh"]) >= CYCLES for v in VARIANTS):
            continue
        b = dict(bal[key]) | dict(g=ocp["grid"]) | ocp["sets"][bal[key]["pset"]]
        lost = vs["both"]["lost_mol"]
        e2, _ = ocv_energy(b["n_li"] - lost[0], b)
        out.append(dict(cond=key[0], j=key[1], dfn=fade(vs["both"]["cycle_wh"]) - fade(vs["none"]["cycle_wh"]),
                        dfn_both=fade(vs["both"]["cycle_wh"]), map=map_fade(b, lost), lli=lli_share(b, lost),
                        open_ratio=vs["both"]["cycle_wh"][1] / e2 if e2 > 0 else None))
    return out


def evaluate(rows, k):
    """H104 to H107 on rows (designs losing more than MIN_LLI of their lithium)."""
    f = [r for r in rows if r["lli"] > MIN_LLI and r["map"] is not None]
    if not f:
        return dict(n=0)
    err_map = [abs(r["map"] - r["dfn"]) for r in f]
    err_k = [abs(k * r["lli"] - r["dfn"]) for r in f]
    within = sum(e <= TOL for e in err_map) / len(f)
    conds = sorted({r["cond"] for r in f})
    per = {}
    for c in conds:
        g = [r for r in f if r["cond"] == c]
        per[c] = dict(n=len(g), s_map=spearman([r["map"] for r in g], [r["dfn"] for r in g]),
                      s_lli=spearman([r["lli"] for r in g], [r["dfn"] for r in g]),
                      mae_map=statistics.mean(abs(r["map"] - r["dfn"]) for r in g),
                      mae_k=statistics.mean(abs(k * r["lli"] - r["dfn"]) for r in g))
    scored = [c for c in conds if per[c]["s_map"] is not None and per[c]["s_lli"] is not None]
    wins = sum(per[c]["s_map"] >= per[c]["s_lli"] for c in scored)
    s_err = spearman([r["open_ratio"] for r in f], err_map)
    return dict(n=len(f), within=within, mae_map=statistics.mean(err_map), mae_k=statistics.mean(err_k),
                med_map=statistics.median(err_map), med_k=statistics.median(err_k), per=per, wins=wins,
                n_scored=len(scored), s_err_open=s_err,
                H104=verdict(within >= 0.75, within < 0.5),
                H105=verdict(statistics.mean(err_map) < 0.75 * statistics.mean(err_k), statistics.mean(err_map) >= statistics.mean(err_k)),
                H106=verdict(wins > len(scored) / 2 and wins == len(scored), wins <= len(scored) / 2) if scored else "untested",
                H107=verdict(s_err is not None and s_err <= -0.3, s_err is None or s_err >= 0.0))


def report():
    ocp = json.loads((HERE / "ocp.json").read_text())
    bal = {(r["cond"], r["j"]): r for r in _load(HERE / "balance.jsonl")}
    dev = score(_load(EXP / "attribution" / "bench.jsonl"), bal, ocp)
    fresh = score(_load(HERE / "bench.jsonl"), bal, ocp)
    k = K_DEV
    D, Fr = evaluate(dev, k), evaluate(fresh, k)
    L = [f"cell-fidelity milestone 5r: an electrode-balance map from lost lithium to lost energy, DFN fade from cycle 2 to {CYCLES}",
         f"proportional baseline k = {k} (fade per lithium share, median over the dev bench's fading designs, fixed in the plan)",
         f"fading = lithium lost from cycle 2 to {CYCLES} above {MIN_LLI:.0%} of n_Li; H104 tolerance {TOL}", ""]
    for name, rows, E in (("dev (5p's bench, seen before the plan)", dev, D), ("fresh (verdicts)", fresh, Fr)):
        L.append(f"== {name}: {len(rows)} designs scored, {E.get('n', 0)} fading")
        L.append(f"{'cond':16s}{'j':>4s}{'LLI':>8s}{'DFN add':>9s}{'map':>8s}{'k*LLI':>8s}{'E2/Eocv':>9s}")
        for r in rows:
            L.append(f"{r['cond']:16s}{r['j']:4d}{r['lli']:8.4f}{r['dfn']:9.4f}{(r['map'] if r['map'] is not None else float('nan')):8.4f}"
                     f"{k * r['lli']:8.4f}{(r['open_ratio'] or float('nan')):9.3f}")
        if E.get("n"):
            L.append(f"within {TOL}: {E['within']:.2f}; MAE map {E['mae_map']:.4f} vs k*LLI {E['mae_k']:.4f} "
                     f"(median {E['med_map']:.4f} vs {E['med_k']:.4f}); Spearman(map wins over LLI) {E['wins']} of {E['n_scored']}; "
                     f"Spearman(E2/Eocv, |map error|) {E['s_err_open'] if E['s_err_open'] is None else round(E['s_err_open'], 3)}")
            for c, p in E["per"].items():
                fmt = lambda v: "  nan" if v is None else f"{v:+.2f}"
                L.append(f"  {c:16s} n={p['n']} Spearman map {fmt(p['s_map'])} LLI {fmt(p['s_lli'])}  MAE map {p['mae_map']:.4f} k {p['mae_k']:.4f}")
            L.append("  " + "  ".join(f"{h} {E[h]}" for h in ("H104", "H105", "H106", "H107")))
        L.append("")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    strip = lambda E: {kk: vv for kk, vv in E.items()}
    (HERE / "summary.json").write_text(json.dumps(dict(k=k, dev=strip(D), fresh=strip(Fr), dev_rows=dev, fresh_rows=fresh), indent=1))
    print("\n".join(L))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "report"
    if cmd == "child":
        c, j, v, x = json.loads(sys.argv[2])
        print(json.dumps(simulate((c, j, v, x))))
    elif cmd == "bench":
        bench()
    elif cmd == "tables":
        tables()
    else:
        report()
