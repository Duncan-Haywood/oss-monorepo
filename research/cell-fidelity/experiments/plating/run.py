"""Milestone 5q: predict the DFN designs' 100-cycle fade from two cheap cycles that see lithium plating, and cut the pool with it.

    python experiments/plating/run.py predict   # 2-cycle SPMe with SEI + plating on every committed design (resumable) -> predict.jsonl
    python experiments/plating/run.py dev       # replay on the 36 committed conditions, verdicts on the 24 unseen (stdlib) -> dev.txt, dev.json

Milestone 5p found that every fade number from 5b to 5o is lithium plating (OKane2022's plating parameters), not SEI, and that
SEI contributes nothing measurable over 20 cycles. 5o's zero-simulation (U, r_kt) front misses by up to 4.7% where fade decides
the best design (low-current Ai2020, best on layers 4 to 7), because it ranks high energy first and high energy fades fastest.
This milestone measures plating directly in the cheapest model that has it: SPMe with the programme's options
(TR.OPTS: solvent-diffusion SEI and irreversible plating) for two cycles, the lithium lost in cycle 2 as a share of the
inventory (p2), and SPMe's cycle-2 energy per stack mass (w2). Predictors, cuts and H100 to H103 are in ../../LOG.md (5q
plan), registered before the predictor's results on 24 of the 36 conditions were read; no fresh DFN bench was run (the
predictor failed on the committed pools). Pools, protocol and current mapping are 5m's, unchanged.
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

WORKERS = int(os.environ.get("WORKERS", "3"))
BATCH = 24       # designs per predictor child process (one pybamm import per batch)
CYCLES = 2       # predictor cycles (cycle 1 starts from the set's own initial state; cycle 2's loss is the rate)
KINDS = ("w2", "linear", "limited")
# conditions whose predictor results were read before the 5q plan (scratch); H100 to H103 score the other 24
SEEN = ("Ai2020@0.25x", "Ai2020@0.275x", "Ai2020@0.3x", "Ai2020@0.35x", "Ai2020@0.375x", "Ai2020@0.4375x", "Ai2020@0.5x",
        "Ai2020@0.625x", "Ai2020@0.75x", "Ai2020@0.875x", "Ai2020@1x", "Chen2020@0.5x")


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


F_CONST = 96485.33212
R_GAS = 8.314462618


def ocp_grid(theta):
    """The stoichiometries the negative OCP is stored at: theta_end down in steps of 0.005 (121 points, floored at 1e-4)."""
    return [max(theta - 0.005 * k, 1e-4) for k in range(121)]


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
    Ll = self_limited_loss(r2, q["theta_end"], q["q_neg_mol"], q.get("ocp_grid") or ocp_grid(q["theta_end"]), q["ocp_u"], q["alpha_plating"], q["T"], n)
    return dict(w2=w2, linear=w2 * max(0.0, 1 - (n - 2) * r2 * to_ah / ah2), limited=w2 * max(0.0, 1 - Ll * to_ah / ah2),
                fade_limited=Ll * to_ah / ah2, fade_linear=(n - 2) * r2 * to_ah / ah2)


def rank_of(vals, i):
    """1-based rank of entry i when vals are sorted high to low, ties counted against it (a predictor that ties every
    design, as `linear` does once it clips them all to 0, ranks the best last, not first)."""
    return sum(1 for v in vals if v >= vals[i])


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
            grid = ocp_grid(th)
            f = pv["Negative electrode OCP [V]"]
            u = [float(np.asarray(pv.evaluate(f(pybamm.Scalar(g)))).ravel()[0]) for g in grid]
            out.update(theta_end=th, q_neg_mol=q_neg, alpha_plating=float(pv["Lithium plating transfer coefficient"]),
                       T=float(pv["Ambient temperature [K]"]), ocp_u=[round(v, 7) for v in u])
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
    """Attach the predictor record to every dev row (pred None where the 2-cycle SPMe run failed); returns
    {cond: rows}, {cond: j whose predictor run failed}."""
    pr = {(r["cond"], r["j"]): r for r in _load(path)}
    out, failed = {}, {}
    for c, rows in D.items():
        keep = []
        for r in rows:
            q = pr.get((c, r["j"]))
            ok = bool(q and q["ok"] and "theta_end" in q)
            keep.append(r | dict(pred=predict_score(q) if ok else None, p2=p2_of(q["lost_mol"], q["n_li_init"]) if ok else None,
                                 t_pred=(q or {}).get("seconds")))
            if not ok:
                failed.setdefault(c, []).append(r["j"])
        out[c] = keep
    return out, failed


def condition(allrows):
    """Spearman and ranks over the designs whose predictor ran; gaps against the whole pool's DFN@100 best. A design
    whose predictor failed is never in a top-K list and is always kept by the share cut (it goes to the union screen)."""
    rows = [r for r in allrows if r["pred"] is not None]
    t_all = sum(cost_to(r, 100) for r in allrows)
    tp = statistics.median(r["t_pred"] for r in allrows if r["t_pred"] is not None)
    best_all = max(r["score"] for r in allrows)
    sc = [r["score"] for r in rows]
    ib = max(range(len(rows)), key=lambda i: sc[i])
    fade = [1 - r["wh"][99] / r["wh"][1] for r in rows]
    pv = {k: [r["pred"][k] for r in rows] for k in KINDS}
    out = dict(n=len(allrows), n_pred=len(rows), t_all=t_all, t_pred=tp, t_pred_share=tp * len(allrows) / t_all,
               best_failed=max(sc) < best_all, best_j=max(allrows, key=lambda r: r["score"])["j"],
               rho_p2_fade=spearman([r["p2"] for r in rows], fade),
               rho_limited_fade=spearman([r["pred"]["fade_limited"] for r in rows], fade),
               fade_median=statistics.median(fade), fade_limited_median=statistics.median(r["pred"]["fade_limited"] for r in rows),
               rho={k: spearman(v, sc) for k, v in pv.items()} | dict(u=spearman([r["u"] for r in rows], sc)),
               best_rank={k: rank_of(v, ib) for k, v in pv.items()} | dict(u=rank_of([r["u"] for r in rows], ib)))
    out["topk"] = {}
    for k, v in pv.items():
        out["topk"][k] = {}
        for K in (3, 4, 6, 8):
            g, t = topk_dfn(rows, v, K, 0.0)
            out["topk"][k][K] = dict(gap=1 - (1 - g) * max(sc) / best_all, t_ratio=(t + tp * len(allrows)) / t_all)
    out["keep"] = {}
    failed = [r for r in allrows if r["pred"] is None]
    for k, v in pv.items():
        out["keep"][k] = {}
        for q in (0.25, 0.5):
            n = max(N.M, math.ceil(q * len(rows)))
            sub = [rows[i] for i in sorted(range(len(rows)), key=lambda i: -v[i])[:n]] + failed
            _, picked, t = N.union_screen(sub)
            out["keep"][k][str(q)] = dict(gap=1 - max(sub[i]["score"] for i in picked) / best_all,
                                          t_ratio=(t + tp * len(allrows)) / t_all, kept=len(sub))
    gu, _, tu = N.union_screen(allrows)
    out["union"] = dict(gap=gu, t_ratio=tu / t_all)
    gf, _, tf, _ = FC.floor_union(allrows)
    out["floor"] = dict(gap=gf, t_ratio=tf / t_all)
    return out


def verdicts(C):
    """H100 to H103 as registered in the 5q plan (LOG.md), on the conditions not in SEEN."""
    v = R.verdict
    U = [d for c, d in C.items() if c not in SEEN]
    lower = sum(1 for d in U if d["rho"]["limited"] < d["rho"]["w2"])
    return dict(
        H100=v([d["rho_p2_fade"] for d in U], lambda x: x >= 0.5, lambda x: x < 0.3),
        H101=("untested" if not U else "supported" if lower == 0 else "refuted" if lower > len(U) / 2 else "mixed"),
        H102=v([d["keep"]["limited"]["0.5"]["gap"] for d in U], lambda x: x <= 0.01, lambda x: x > 0.03),
        H103=v([d["keep"]["limited"]["0.5"]["t_ratio"] / d["union"]["t_ratio"] for d in U], lambda x: x <= 0.6, lambda x: x > 0.8))


def _f(x, f="+.2f"):
    return "n/a" if x is None else format(x, f)


def _line(c, d):
    tk = lambda k: "; ".join(f"K{K} {d['topk'][k][K]['gap']:.4f} ({d['topk'][k][K]['t_ratio']:.3f})" for K in (3, 4, 6, 8))
    kp = lambda k: "; ".join(f"{q} {v['gap']:.4f} ({v['t_ratio']:.3f})" for q, v in d["keep"][k].items())
    return (f"{c}{' (seen)' if c in SEEN else ''}: n {d['n']}, predictor ran on {d['n_pred']}"
            f"{' (not on the DFN-best design)' if d['best_failed'] else ''}; Spearman with DFN@100: " + ", ".join(f"{k} {_f(v)}" for k, v in d["rho"].items())
            + f"; best design's rank: " + ", ".join(f"{k} {v}" for k, v in d["best_rank"].items())
            + f"\n  Spearman(p2, DFN fade 2->100) {_f(d['rho_p2_fade'])}, (limited fade, DFN fade) {_f(d['rho_limited_fade'])};"
              f" median DFN fade {d['fade_median']:.3f}, limited's {d['fade_limited_median']:.3f}\n"
            + "".join(f"  top-K DFN@100 by {k}: {tk(k)}\n  keep share by {k} then union: {kp(k)}\n" for k in KINDS)
            + f"  5n union {d['union']['gap']:.4f} ({d['union']['t_ratio']:.3f}); 5o floor {d['floor']['gap']:.4f} ({d['floor']['t_ratio']:.3f});"
              f" predictor {d['t_pred']:.2f} s per design, {d['t_pred_share']:.3f} of all-DFN@100 on the pool")


def _pooled(C, names):
    out = {}
    get = dict(rho_w2=lambda d: d["rho"]["w2"], rho_limited=lambda d: d["rho"]["limited"], rho_linear=lambda d: d["rho"]["linear"],
               rho_p2_fade=lambda d: d["rho_p2_fade"], keep50_gap=lambda d: d["keep"]["limited"]["0.5"]["gap"],
               keep50_over_union_t=lambda d: d["keep"]["limited"]["0.5"]["t_ratio"] / d["union"]["t_ratio"],
               top8_limited_gap=lambda d: d["topk"]["limited"][8]["gap"], top8_w2_gap=lambda d: d["topk"]["w2"][8]["gap"],
               union_gap=lambda d: d["union"]["gap"], t_pred_share=lambda d: d["t_pred_share"])
    for k, g in get.items():
        xs = [g(C[c]) for c in names if g(C[c]) is not None]
        out[k] = dict(median=statistics.median(xs), min=min(xs), max=max(xs), n=len(xs)) if xs else None
    return out


def lithium_to_energy():
    """5p's committed bench, plating-only runs: energy fade (cycle 2 to 20) per unit of lithium lost (share of the initial
    inventory over the same cycles), design by design."""
    out = {}
    for r in _load(EXP / "attribution" / "bench.jsonl"):
        if r["variant"] != "plating" or not r["ok"] or len(r.get("cycle_wh") or []) < 20:
            continue
        li = (r["lost_mol"][19] - r["lost_mol"][1]) / r["n_li_init"]
        if li > 1e-4:
            out.setdefault(r["cond"], []).append(dict(j=r["j"], fade=1 - r["cycle_wh"][19] / r["cycle_wh"][1], li=li,
                                                       ratio=(1 - r["cycle_wh"][19] / r["cycle_wh"][1]) / li))
    return out


def dev():
    D = dev_conditions()
    A, failed = attach(D, HERE / "predict.jsonl")
    C = {c: condition(rows) for c, rows in sorted(A.items()) if sum(r["pred"] is not None for r in rows) >= 8}
    vd = verdicts(C)
    unseen = [c for c in C if c not in SEEN]
    pooled = dict(unseen=_pooled(C, unseen), seen=_pooled(C, [c for c in C if c in SEEN]))
    le = lithium_to_energy()
    L = ["cell-fidelity milestone 5q, development: 2-cycle SPMe with SEI + plating on the committed designs of 36 seen conditions"
         " (gap to the pool's DFN@100 best, and wall time / all-DFN@100 in brackets; the predictor's measured time is charged on"
         " every design)", ""]
    L += [_line(c, C[c]) for c in C]
    L += ["", "Pooled (median, min, max over conditions):"]
    for name, p in pooled.items():
        L += [f"  {name} ({len(unseen) if name == 'unseen' else len(C) - len(unseen)} conditions):"] + [
            f"    {k}: {_f(d['median'], '.4f')}, {_f(d['min'], '.4f')}, {_f(d['max'], '.4f')}" for k, d in p.items() if d]
    L += ["", "5p's plating-only runs: energy fade per unit of lithium lost (share of inventory), cycles 2 to 20:"]
    L += [f"  {c}: " + ", ".join(f"j{e['j']} {e['ratio']:.2f} (fade {e['fade']:.3f}, Li {e['li']:.3f})" for e in es) for c, es in sorted(le.items())]
    L += ["", "Designs whose predictor run failed (dropped): " + ("; ".join(f"{c} {js}" for c, js in sorted(failed.items())) or "none"),
          "", "Verdicts (on the 24 unseen conditions): " + ", ".join(f"{k} {w}" for k, w in vd.items())]
    (HERE / "dev.txt").write_text("\n".join(L) + "\n")
    (HERE / "dev.json").write_text(json.dumps(dict(conditions=C, pooled=pooled, verdicts=vd, seen=SEEN, failed=failed,
                                                   lithium_to_energy=le), indent=1) + "\n")
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
