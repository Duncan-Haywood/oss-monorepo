"""Milestone 5o: cut the pool with the zero-simulation (U, r_kt) front before any DFN run, then run 5n's union screen on what is left.

    python experiments/frontcut/run.py urkt     # U and r_kt (pybamm parameter values only) for every design of the 33 seen conditions -> urkt.jsonl
    python experiments/frontcut/run.py dev      # replay on the 33 seen conditions (5b to 5n), stdlib -> dev.txt, dev.json
    python experiments/frontcut/run.py probe    # baseline design, SPMe and DFN for 2 cycles at each fresh condition -> probe.json
    python experiments/frontcut/run.py bench    # 64 Sobol (seed 13) designs x one DFN run resumed in 10-cycle chunks to 100 (resumable)
    python experiments/frontcut/run.py report   # results.txt, summary.json (pybamm for U and r_kt of the fresh designs)

5n's union screen (DFN to cycle 10 on every design; resume to 100 the top 4 by raw cycle-10 Wh/kg and the top 4 by a
sqrt(cycle) extrapolation of cycles 5 to 10) was within 0.32% of the DFN best on all 33 conditions seen, but it cannot cost
less than the first ten cycles of every design, 0.15 to 0.17 of all-DFN on slow Ai2020 runs. 5k's two closed-form numbers,
thermodynamic energy U and the salt number r_kt, cost about 0.1 s per design and need no simulation. This milestone keeps
only the first L Pareto layers of (U, r_kt) before any DFN run, then runs 5n's union screen on those. Fixed on development
data before the fresh bench; plan and H92 to H96 in ../../LOG.md (milestone 5o plan). Simulation, pools and the resumed
run are 5m's, unchanged.
"""
import importlib.util
import json
import os
import statistics
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent

SOBOL_SEED = 13
WORKERS = int(os.environ.get("WORKERS", "3"))
LAYERS = 3      # Pareto layers of (U, r_kt) kept before any DFN run (fixed on development data; see the 5o plan)
CONDITIONS = ()  # fresh conditions: fixed in the 5o plan before any fresh run


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


N = _mod("latefade_run", EXP / "latefade" / "run.py")
H, E, P, G, R = N.H, N.E, N.P, N.G, N.R
spearman, cost_to, front = N.spearman, N.cost_to, N.E.front


# ---------- pure helpers (stdlib; tested) ----------

def cut_union(rows, layers=LAYERS, m=N.M, t_pred=0.0):
    """Keep the first `layers` Pareto layers of (U, r_kt), then 5n's union screen on them.
    rows: dicts with u, rkt, wh, m, score, t100, optionally seg. t_pred: seconds per design for U and r_kt (charged on all).
    Returns (gap, picked indices, seconds, kept indices)."""
    keep = front([(r["u"], r["rkt"]) for r in rows], layers)
    sub = [rows[i] for i in keep]
    _, picked_sub, t = N.union_screen(sub, m=m)
    picked = [keep[i] for i in picked_sub]
    best = max(r["score"] for r in rows)
    got = max(rows[i]["score"] for i in picked)
    return 1 - got / best, picked, t + t_pred * len(rows), keep


def front_only(rows, layers):
    """5k's procedure: DFN@100 on every design of the first `layers` layers. Returns (gap, seconds)."""
    keep = front([(r["u"], r["rkt"]) for r in rows], layers)
    best = max(r["score"] for r in rows)
    return 1 - max(rows[i]["score"] for i in keep) / best, sum(cost_to(rows[i], 100) for i in keep)


def layer_of(rows, i, cap=12):
    """1-based Pareto layer of design i in (U, r_kt), or None beyond `cap` layers."""
    pts = [(r["u"], r["rkt"]) for r in rows]
    for L in range(1, cap + 1):
        if i in front(pts, L):
            return L
    return None


def condition(rows, t_pred=0.0):
    t_all = sum(cost_to(r, 100) for r in rows)
    ib = max(range(len(rows)), key=lambda i: rows[i]["score"])
    g, picked, t, keep = cut_union(rows, t_pred=t_pred)
    out = dict(n=len(rows), t_all=t_all, gap=g, t_ratio=t / t_all, kept=len(keep), n_picked=len(picked),
               best_j=rows[ib]["j"], best_layer=layer_of(rows, ib),
               best_u_pct=sum(1 for r in rows if r["u"] <= rows[ib]["u"]) / len(rows), best_rkt=rows[ib]["rkt"])
    out["by_layers"] = {}
    for L in range(1, 7):
        gg, pp, tt, kk = cut_union(rows, layers=L, t_pred=t_pred)
        out["by_layers"][L] = dict(gap=gg, t_ratio=tt / t_all, kept=len(kk))
    gu, _, tu = N.union_screen(rows)
    out["union"] = dict(gap=gu, t_ratio=tu / t_all)
    gl, _, tl, _ = H.halving(rows)
    out["ladder"] = dict(gap=gl, t_ratio=tl / t_all)
    for L in (1, 2):
        gf, tf = front_only(rows, L)
        out[f"front{L}_dfn100"] = dict(gap=gf, t_ratio=tf / t_all)
    return out


def verdicts(C, ai):
    """H92 to H96 as registered in the 5o plan (LOG.md)."""
    raise NotImplementedError("written with the plan")


# ---------- development ----------

def _x_index():
    """{(condition, j): design vector} from every committed bench that stored one."""
    xs = {}
    for c, runs in P._sand().committed_conditions().items():
        for (j, _), r in runs.items():
            if r.get("x"):
                xs.setdefault((c, j), r["x"])
    for f in sorted(EXP.glob("*/bench.jsonl")):
        for r in R._load(f):
            if r.get("x") and "cond" in r:
                xs.setdefault((r["cond"], r["j"]), r["x"])
    return xs


def dev_conditions():
    """5n's 30 development conditions plus 5n's three fresh ones (measured segments)."""
    D = N.dev_conditions()
    S = json.loads((EXP / "latefade" / "summary.json").read_text())
    for c, e in S["extra"].items():
        D[c] = [dict(j=r["j"], score=r["score"], wh=r["wh_kg"], m=1.0, t100=r["t100"], seg=r["seg"]) for r in e["rows"]]
    return D


def u_rkt_one(x, s, rate, S, TR, pybamm, cell, theo):
    xc = cell.clip(x)
    pv, _, _ = TR.params(xc, s)
    return theo(pv) / TR.stack_mass(xc, pv), S.predict(x, s, rate)["r_kt"]


def _pyb():
    import pybamm
    from energy_cell import cell
    from pybamm.models.full_battery_models.lithium_ion.electrode_soh import calculate_theoretical_energy
    pybamm.set_logging_level("ERROR")
    return P._sand(), G.TR, pybamm, cell, calculate_theoretical_energy


def urkt():
    D = dev_conditions()
    xs = _x_index()
    S, TR, pybamm, cell, theo = _pyb()
    path = HERE / "urkt.jsonl"
    done = {(r["cond"], r["j"]) for r in R._load(path)} if path.exists() else set()
    with path.open("a") as fh:
        for c in sorted(D):
            s, rate = G._parse(c)
            for row in D[c]:
                j = row["j"]
                if (c, j) in done:
                    continue
                t0 = time.perf_counter()
                u, k = u_rkt_one(xs[(c, j)], s, rate, S, TR, pybamm, cell, theo)
                fh.write(json.dumps(dict(cond=c, j=j, u=u, rkt=k, seconds=time.perf_counter() - t0)) + "\n")
            fh.flush()
            print(c, flush=True)


def _attach(D, path):
    ur = {(r["cond"], r["j"]): r for r in R._load(path)}
    secs = [r["seconds"] for r in ur.values()]
    for c, rows in D.items():
        for r in rows:
            r["u"], r["rkt"] = ur[(c, r["j"])]["u"], ur[(c, r["j"])]["rkt"]
    return statistics.median(secs)


def _line(name, c):
    bl = "; ".join(f"L{L} {d['gap']:.4f} ({d['t_ratio']:.3f}, {d['kept']})" for L, d in c["by_layers"].items())
    return (f"{name}: n {c['n']}; best design {c['best_j']} on (U, r_kt) layer {c['best_layer']}, U percentile {c['best_u_pct']:.2f},"
            f" r_kt {c['best_rkt']:+.2f}\n"
            f"  cut to {LAYERS} layers then union: gap {c['gap']:.4f}, wall / all-DFN@100 {c['t_ratio']:.3f}, kept {c['kept']}, resumed {c['n_picked']}\n"
            f"  by layers, gap (time ratio, kept): {bl}\n"
            f"  5n union {c['union']['gap']:.4f} ({c['union']['t_ratio']:.3f}); 5m ladder {c['ladder']['gap']:.4f} ({c['ladder']['t_ratio']:.3f});"
            f" 5k front L1 DFN@100 {c['front1_dfn100']['gap']:.4f} ({c['front1_dfn100']['t_ratio']:.3f}),"
            f" L2 {c['front2_dfn100']['gap']:.4f} ({c['front2_dfn100']['t_ratio']:.3f})")


def _pooled(C):
    out = {}
    getters = [("gap", lambda c: c["gap"]), ("t_ratio", lambda c: c["t_ratio"]),
               ("union_gap", lambda c: c["union"]["gap"]), ("union_t_ratio", lambda c: c["union"]["t_ratio"]),
               ("ladder_gap", lambda c: c["ladder"]["gap"]), ("ladder_t_ratio", lambda c: c["ladder"]["t_ratio"])]
    for L in range(1, 7):
        getters += [(f"L{L}_gap", lambda c, L=L: c["by_layers"][L]["gap"]), (f"L{L}_t_ratio", lambda c, L=L: c["by_layers"][L]["t_ratio"])]
    for name, get in getters:
        xs = [get(c) for c in C.values()]
        out[name] = dict(median=statistics.median(xs), max=max(xs), exact=sum(1 for x in xs if x < 1e-12))
    return out


def dev():
    D = dev_conditions()
    tp = _attach(D, HERE / "urkt.jsonl")
    C = {c: condition(rows, t_pred=tp) for c, rows in sorted(D.items())}
    p = _pooled(C)
    L = [f"cell-fidelity milestone 5o, development (33 conditions seen by milestones 5b to 5n; 5b to 5l charged k/100 of each"
         f" DFN@100 run's time, 5m's and 5n's six at their measured segments; U and r_kt charged {tp:.3f} s per design, the median measured)", ""]
    L += [_line(c, C[c]) for c in C]
    L += ["", "Pooled over conditions (median, max, exact):"] + [
        f"  {k}: {d['median']:.4f}, {d['max']:.4f}, {d['exact']} of {len(C)}" for k, d in p.items()]
    (HERE / "dev.txt").write_text("\n".join(L) + "\n")
    (HERE / "dev.json").write_text(json.dumps(dict(t_pred=tp, conditions=C, pooled=p), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    cmd = sys.argv[1:2]
    if cmd == ["urkt"]:
        urkt()
    elif cmd == ["dev"]:
        dev()
    else:
        print(__doc__)
