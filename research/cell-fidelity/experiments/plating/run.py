"""Milestone 5q: predict the DFN designs' 100-cycle fade from two cheap cycles that see lithium plating, and cut the pool with it.

    python experiments/plating/run.py predict   # 2-cycle SPMe with SEI + plating on every committed design (resumable) -> predict.jsonl
    python experiments/plating/run.py dev       # development replay on the 36 seen conditions (stdlib) -> dev.txt, dev.json
    python experiments/plating/run.py probe     # baseline design, SPMe and DFN for 2 cycles at each fresh condition -> probe.json
    python experiments/plating/run.py bench     # 64 Sobol (seed 14) designs x one DFN run resumed in 10-cycle chunks to 100 (resumable)
    python experiments/plating/run.py fresh     # the 2-cycle SPMe predictor on the fresh designs -> fresh_predict.jsonl
    python experiments/plating/run.py report    # results.txt, summary.json (stdlib)

Milestone 5p found that every fade number from 5b to 5o is lithium plating (OKane2022's plating parameters), not SEI, and that
SEI contributes nothing measurable over 20 cycles. 5o's zero-simulation (U, r_kt) front misses by up to 4.7% where fade decides
the best design (low-current Ai2020, best on layers 4 to 7), because it ranks high energy first and high energy fades fastest.
This milestone measures plating directly in the cheapest model that has it: SPMe with the programme's options
(TR.OPTS: solvent-diffusion SEI and irreversible plating) for two cycles, the lithium lost in cycle 2 as a share of the
inventory (p2), and SPMe's cycle-2 energy per stack mass (w2). The cut fixed on development data, before the fresh bench, is
in ../../LOG.md (5q plan). Pools, protocol, current mapping and the resumed DFN run are 5m's, unchanged.
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

SOBOL_SEED = 14
WORKERS = int(os.environ.get("WORKERS", "3"))
BATCH = 24       # designs per predictor child process (one pybamm import per batch)
CYCLES = 2       # predictor cycles (cycle 1 starts from the set's own initial state; cycle 2's loss is the rate)
CONDITIONS = ()  # fresh conditions, fixed in the 5q plan before any fresh run (set below)


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


FC = _mod("frontcut_run", EXP / "frontcut" / "run.py")
N, H, E, P, G, R = FC.N, FC.H, FC.E, FC.P, FC.G, FC.R
spearman, cost_to, front = N.spearman, N.cost_to, E.front


# ---------- pure helpers (stdlib; tested) ----------

def p2_of(lost, n0):
    """Lithium lost during cycle 2 as a share of the initial inventory (cycle 1's loss includes the start transient)."""
    return (lost[1] - lost[0]) / n0


def _load(path):
    return [json.loads(l) for l in path.read_text().splitlines() if l.strip()] if path.exists() else []


def predictors(w2, p2, n=100):
    """Cycle-100 Wh/kg predicted from SPMe's cycle-2 energy w2 and cycle-2 lithium loss share p2: w2 alone, w2 with the
    loss carried on linearly (one share of energy per share of lithium, n - 2 more cycles), and compounded."""
    return dict(w2=w2, lin=w2 * max(0.0, 1.0 - (n - 2) * p2), pow=w2 * (1.0 - min(p2, 1.0)) ** (n - 2))


F_CONST = 96485.33212
R_GAS = 8.314462618


def interp_down(grid, vals, g):
    """Linear interpolation on a grid that decreases from grid[0]; clamped at both ends."""
    if g >= grid[0]:
        return vals[0]
    for k in range(1, len(grid)):
        if g >= grid[k]:
            w = (grid[k - 1] - g) / (grid[k - 1] - grid[k])
            return vals[k - 1] + w * (vals[k] - vals[k - 1])
    return vals[-1]


def self_limited_loss(r2, theta, q_neg, grid, u, alpha, T, n=100, sub=10):
    """Lithium (mol) lost from the end of cycle 2 to the end of cycle n under irreversible plating that limits itself.
    PyBaMM's irreversible plating current is j0 exp(-alpha F (delta_phi + eta_sei) / RT); lithium lost to it leaves the
    negative electrode emptier at the end of each charge (the positive still stops at the voltage cut-off), by L / q_neg in
    stoichiometry, which raises its OCP and so delta_phi by U(theta - L / q_neg) - U(theta). With everything else held at
    cycle 2's values, the per-cycle loss is r2 exp(-alpha F [U(theta - L / q_neg) - U(theta)] / RT). Integrated with `sub`
    Euler steps per cycle."""
    k = alpha * F_CONST / (R_GAS * T)
    u0 = interp_down(grid, u, theta)
    L, h = 0.0, 1.0 / sub
    for _ in range((n - 2) * sub):
        L += h * r2 * math.exp(-k * (interp_down(grid, u, theta - L / q_neg) - u0))
    return L


def predict_score(q, n=100):
    """Predicted cycle-n Wh/kg from one 2-cycle SPMe record q: cycle-2 Wh/kg times (1 - the lost lithium's share of the
    cycle-2 discharge capacity), with the loss self-limited ('limited') or carried on at cycle 2's rate ('linear')."""
    w2 = q["cycle_wh"][1] / q["mass_kg"]
    r2 = q["lost_mol"][1] - q["lost_mol"][0]
    ah2 = q["cycle_ah"][1]
    to_ah = F_CONST / 3600.0
    Ll = self_limited_loss(r2, q["theta_end"], q["q_neg_mol"], q["ocp_grid"], q["ocp_u"], q["alpha_plating"], q["T"], n)
    return dict(w2=w2, linear=w2 * max(0.0, 1 - (n - 2) * r2 * to_ah / ah2), limited=w2 * max(0.0, 1 - Ll * to_ah / ah2),
                fade_limited=Ll * to_ah / ah2, fade_linear=(n - 2) * r2 * to_ah / ah2)


def rank_of(vals, i):
    """1-based rank of entry i when vals are sorted high to low."""
    return 1 + sum(1 for v in vals if v > vals[i])


def topk_dfn(rows, vals, k, t_pred):
    """DFN@100 on the top k designs by vals, the best of them is the answer. Returns (gap, seconds)."""
    idx = sorted(range(len(rows)), key=lambda i: -vals[i])[:k]
    best = max(r["score"] for r in rows)
    return 1 - max(rows[i]["score"] for i in idx) / best, sum(cost_to(rows[i], 100) for i in idx) + t_pred * len(rows)


def keep_union(rows, vals, q, t_pred):
    """Keep the top share q of designs by vals (zero DFN), then 5n's union screen on them. Returns (gap, seconds, kept)."""
    n = max(N.M, math.ceil(q * len(rows)))
    keep = sorted(range(len(rows)), key=lambda i: -vals[i])[:n]
    sub = [rows[i] for i in keep]
    _, picked_sub, t = N.union_screen(sub)
    best = max(r["score"] for r in rows)
    return 1 - max(sub[i]["score"] for i in picked_sub) / best, t + t_pred * len(rows), len(keep)


# ---------- predictor (pybamm) ----------

def _predict_one(x, s, rate, pybamm, np, cell, TR):
    x = cell.clip(x)
    pv, _, cur = TR.params(x, s)
    cur *= rate
    vlo, vhi = pv["Lower voltage cut-off [V]"], pv["Upper voltage cut-off [V]"]
    out = dict(ok=True, error=None, mass_kg=float(TR.stack_mass(x, pv)), current_A=cur)
    exp = pybamm.Experiment([(f"Discharge at {cur:.6g} A until {vlo} V", f"Charge at {cur:.6g} A until {vhi} V")] * CYCLES)
    t0 = time.perf_counter()
    try:
        sol = pybamm.Simulation(pybamm.lithium_ion.SPMe(TR.OPTS), parameter_values=pv, experiment=exp).solve(initial_soc=1.0)
        wh, ah, lost = [], [], []
        for cy in sol.cycles:
            d = cy.steps[0]
            wh.append(float(np.trapezoid(d["Terminal voltage [V]"].entries * d["Current [A]"].entries, d["Time [s]"].entries)) / 3600)
            ah.append(float(np.trapezoid(d["Current [A]"].entries, d["Time [s]"].entries)) / 3600)
            lost.append(float(cy["Total lithium lost [mol]"].entries[-1]))
        out.update(cycle_wh=wh, cycle_ah=ah, lost_mol=lost, n_li_init=float(sol["Total lithium [mol]"].entries[0]),
                   ok_cycles=len(sol.cycles))
        out["ok"] = len(sol.cycles) >= CYCLES
        if out["ok"]:
            # what the self-limiting plating model needs: the negative's average stoichiometry at the end of cycle 2's
            # charge, its lithium capacity (mol, parallel count included), the plating transfer coefficient, and its OCP
            # on a grid below that stoichiometry (lost lithium leaves the negative emptier at the end of each charge)
            th = float(sol.cycles[1].steps[1]["Average negative particle stoichiometry"].entries[-1])
            q_neg = (float(pv["Maximum concentration in negative electrode [mol.m-3]"])
                     * float(pv["Negative electrode active material volume fraction"])
                     * float(pv["Negative electrode thickness [m]"]) * TR.area_parallel(pv))
            grid = [max(th - 0.005 * k, 1e-4) for k in range(121)]
            f = pv["Negative electrode OCP [V]"]
            u = [float(np.asarray(pv.evaluate(f(pybamm.Scalar(g)))).ravel()[0]) for g in grid]
            out.update(theta_end=th, q_neg_mol=q_neg, alpha_plating=float(pv["Lithium plating transfer coefficient"]),
                       T=float(pv["Ambient temperature [K]"]), ocp_grid=grid, ocp_u=u)
    except Exception as ex:
        out.update(ok=False, error=f"{type(ex).__name__}: {str(ex)[:160]}", ok_cycles=0)
    out["seconds"] = time.perf_counter() - t0
    return out


def _child(batch):
    """batch: [[cond, j, x], ...]; prints one JSON line per design."""
    import numpy as np
    import pybamm
    from energy_cell import cell
    pybamm.set_logging_level("ERROR")
    for c, j, x in batch:
        s, rate = G._parse(c)
        r = _predict_one(x, s, rate, pybamm, np, cell, G.TR)
        print(json.dumps(dict(cond=c, j=j, x=list(map(float, x))) | r), flush=True)


def _spawn(batch, timeout=1800):
    try:
        p = subprocess.run([sys.executable, __file__, "child", json.dumps(batch)], capture_output=True, text=True, timeout=timeout)
        got = [json.loads(l) for l in p.stdout.splitlines() if l.startswith("{")]
        err = None if p.returncode == 0 else f"exit {p.returncode}: {p.stderr.strip()[-160:]}"
    except subprocess.TimeoutExpired:
        got, err = [], f"timeout {timeout}s"
    seen = {(r["cond"], r["j"]) for r in got}
    # a crash fails the design it was on; the rest of the batch is retried on the next pass
    return got, [b for b in batch if (b[0], b[1]) not in seen], err


def _run_predict(path, items):
    done = {(r["cond"], r["j"]) for r in _load(path)}
    todo = [it for it in items if (it[0], it[1]) not in done]
    print(f"{len(todo)} designs to go", flush=True)
    for _ in range(3):
        if not todo:
            break
        batches = [todo[i:i + BATCH] for i in range(0, len(todo), BATCH)]
        left = []
        with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as fh:
            for got, rest, err in ex.map(_spawn, batches):
                for r in got:
                    fh.write(json.dumps(r) + "\n")
                fh.flush()
                if rest:
                    # the first missing design is the one the child died on: record it as failed, retry the others
                    c, j, x = rest[0]
                    fh.write(json.dumps(dict(cond=c, j=j, x=x, ok=False, error=err or "child died", ok_cycles=0, seconds=None)) + "\n")
                    left += rest[1:]
                print(f"batch: {len(got)} ok, {len(rest)} left ({err})", flush=True)
        todo = left


def dev_conditions():
    """5o's 33 development conditions plus 5o's three fresh ones (measured segments); every row carries u and r_kt."""
    D = FC.dev_conditions()
    FC._attach(D, EXP / "frontcut" / "urkt.jsonl")
    S = json.loads((EXP / "frontcut" / "summary.json").read_text())
    for c, e in S["extra"].items():
        D[c] = [dict(j=r["j"], score=r["score"], wh=r["wh_kg"], m=1.0, t100=r["t100"], seg=r["seg"], u=r["u"], rkt=r["rkt"])
                for r in e["rows"]]
    return D


def _xs():
    xs = FC._x_index()
    for r in _load(EXP / "frontcut" / "bench.jsonl"):
        xs.setdefault((r["cond"], r["j"]), r["x"])
    return xs


def predict():
    D, xs = dev_conditions(), _xs()
    _run_predict(HERE / "predict.jsonl", [(c, r["j"], xs[(c, r["j"])]) for c in sorted(D) for r in D[c]])


def attach(D, path):
    """Attach SPMe@2's w2, p2 and seconds to the dev rows; returns {cond: rows with a predictor}, {cond: dropped j}."""
    pr = {(r["cond"], r["j"]): r for r in _load(path)}
    out, dropped = {}, {}
    for c, rows in D.items():
        keep = []
        for r in rows:
            q = pr.get((c, r["j"]))
            if q and q["ok"] and len(q.get("cycle_wh") or []) >= CYCLES:
                keep.append(r | dict(w2=q["cycle_wh"][1] / q["mass_kg"], p2=p2_of(q["lost_mol"], q["n_li_init"]), t_pred=q["seconds"]))
            else:
                dropped.setdefault(c, []).append(r["j"])
        out[c] = keep
    return out, dropped


def condition(rows):
    t_all = sum(cost_to(r, 100) for r in rows)
    tp = statistics.median(r["t_pred"] for r in rows)
    sc = [r["score"] for r in rows]
    ib = max(range(len(rows)), key=lambda i: sc[i])
    fade = [1 - r["wh"][99] / r["wh"][1] for r in rows]
    pv = {k: [predictors(r["w2"], r["p2"])[k] for r in rows] for k in ("w2", "lin", "pow")}
    out = dict(n=len(rows), t_all=t_all, t_pred=tp, best_j=rows[ib]["j"], best_p2=rows[ib]["p2"],
               rho_p2_fade=spearman([r["p2"] for r in rows], fade),
               rho={k: spearman(v, sc) for k, v in pv.items()} | dict(u=spearman([r["u"] for r in rows], sc)),
               best_rank={k: rank_of(v, ib) for k, v in pv.items()} | dict(u=rank_of([r["u"] for r in rows], ib)))
    out["topk"] = {k: {K: dict(zip(("gap", "t_ratio"), (lambda g, t: (g, t / t_all))(*topk_dfn(rows, v, K, tp))))
                       for K in (3, 4, 6, 8)} for k, v in pv.items()}
    out["keep"] = {k: {str(q): (lambda g, t, n: dict(gap=g, t_ratio=t / t_all, kept=n))(*keep_union(rows, v, q, tp))
                       for q in (0.25, 0.5)} for k, v in pv.items()}
    gu, _, tu = N.union_screen(rows)
    out["union"] = dict(gap=gu, t_ratio=tu / t_all)
    gf, _, tf, _ = FC.floor_union(rows)
    out["floor"] = dict(gap=gf, t_ratio=tf / t_all)
    return out


def _line(c, d):
    tk = lambda k: "; ".join(f"K{K} {d['topk'][k][K]['gap']:.4f} ({d['topk'][k][K]['t_ratio']:.3f})" for K in (3, 4, 6, 8))
    kp = lambda k: "; ".join(f"{q} {v['gap']:.4f} ({v['t_ratio']:.3f})" for q, v in d["keep"][k].items())
    return (f"{c}: n {d['n']}; Spearman with DFN@100: " + ", ".join(f"{k} {v:+.2f}" for k, v in d["rho"].items())
            + f"; Spearman(p2, DFN fade 2->100) {d['rho_p2_fade']:+.2f}; best design's rank: "
            + ", ".join(f"{k} {v}" for k, v in d["best_rank"].items()) + f"; best p2 {d['best_p2']:.4f}\n"
            + "".join(f"  top-K DFN@100 by {k}: {tk(k)}\n  keep share by {k} then union: {kp(k)}\n" for k in ("w2", "lin", "pow"))
            + f"  5n union {d['union']['gap']:.4f} ({d['union']['t_ratio']:.3f}); 5o floor {d['floor']['gap']:.4f} ({d['floor']['t_ratio']:.3f});"
              f" predictor {d['t_pred']:.2f} s per design, all-DFN@100 {d['t_all']:.0f} s")


def dev():
    D = dev_conditions()
    A, dropped = attach(D, HERE / "predict.jsonl")
    C = {c: condition(rows) for c, rows in sorted(A.items()) if len(rows) >= 8}
    L = ["cell-fidelity milestone 5q, development: SPMe@2 with SEI + plating on the committed designs of 36 seen conditions"
         " (gap to the pool's DFN@100 best, and wall time / all-DFN@100 in brackets; predictor time charged on every design)", ""]
    L += [_line(c, C[c]) for c in C]
    L += ["", f"Designs whose predictor run failed (dropped): " + ("; ".join(f"{c} {js}" for c, js in sorted(dropped.items())) or "none")]
    (HERE / "dev.txt").write_text("\n".join(L) + "\n")
    (HERE / "dev.json").write_text(json.dumps(dict(conditions=C, dropped=dropped), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    cmd = sys.argv[1:2]
    if cmd == ["child"]:
        _child(json.loads(sys.argv[2]))
    elif cmd == ["predict"]:
        predict()
    elif cmd == ["dev"]:
        dev()
    else:
        print(__doc__)
