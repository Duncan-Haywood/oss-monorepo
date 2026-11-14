"""Milestone 5o: cut the pool with the zero-simulation (U, r_kt) front before any DFN run, then run 5n's union screen on what is left.

    python experiments/frontcut/run.py urkt     # U and r_kt (pybamm parameter values only) for every design of the 33 seen conditions -> urkt.jsonl
    python experiments/frontcut/run.py rkt_time # seconds for r_kt alone on 32 designs per seen condition -> rkt_time.json
    python experiments/frontcut/run.py dev      # replay on the 33 seen conditions (5b to 5n), stdlib -> dev.txt, dev.json
    python experiments/frontcut/run.py probe    # baseline design, SPMe and DFN for 2 cycles at each fresh condition -> probe.json
    python experiments/frontcut/run.py bench    # 64 Sobol (seed 13) designs x one DFN run resumed in 10-cycle chunks to 100 (resumable)
    python experiments/frontcut/run.py report   # results.txt, summary.json (pybamm for U and r_kt of the fresh designs)

5n's union screen (DFN to cycle 10 on every design; resume to 100 the top 4 by raw cycle-10 Wh/kg and the top 4 by a
sqrt(cycle) extrapolation of cycles 5 to 10) was within 0.32% of the DFN best on all 33 conditions seen, but it cannot cost
less than the first ten cycles of every design, 0.15 to 0.17 of all-DFN on slow Ai2020 runs. 5k's two closed-form numbers,
thermodynamic energy U and the salt number r_kt, cost about 0.1 s per design and need no simulation. This milestone keeps
only the first L Pareto layers of (U, r_kt) before any DFN run, then runs 5n's union screen on those. Development showed the
front cut misses by up to 4.7% where fade decides (the best design sits on layers 4 to 7), so the procedure tested on fresh
data is a salt floor instead: drop designs with r_kt < -0.2, then the union screen. Fixed on development
data before the fresh bench; plan and H92 to H95 in ../../LOG.md (milestone 5o plan). Simulation, pools and the resumed
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
LAYERS = 3      # Pareto layers of (U, r_kt) for the front cut (development only: it misses where fade decides)
TAU = -0.2      # salt floor: designs with r_kt below it are dropped before any DFN run (fixed on development data)
# fresh conditions, fixed before any run: currents no milestone ran, chosen only by the floor's predicted share on the
# seed-13 designs (zero simulation: NCA_Kim2011@0.875x 0.55, Chen2020@1.75x 0.41, Ai2020@0.875x 0.39), so the floor bites
CONDITIONS = (("NCA_Kim2011", 0.875), ("Chen2020", 1.75), ("Ai2020", 0.875))


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


def floor_union(rows, tau=TAU, m=N.M, t_pred=0.0):
    """Drop designs with r_kt < tau (closed form, no simulation), then 5n's union screen on the rest.
    Returns (gap, picked indices, seconds, kept indices)."""
    keep = [i for i, r in enumerate(rows) if r["rkt"] >= tau]
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
    gf, pf, tf, kf = floor_union(rows, t_pred=t_pred)
    out["floor"] = dict(gap=gf, t_ratio=tf / t_all, kept=len(kf), n_picked=len(pf), best_kept=rows[ib]["rkt"] >= TAU)
    out["by_tau"] = {str(tau): dict(zip(("gap", "t_ratio"), (lambda g, p, t, k: (g, t / t_all))(*floor_union(rows, tau, t_pred=t_pred))))
                     for tau in (-0.5, -0.3, -0.2, -0.15, -0.1, 0.0)}
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


def verdicts(C):
    """H92 to H95 as registered in the 5o plan (LOG.md)."""
    v = R.verdict
    rel = [c["floor"]["t_ratio"] / c["union"]["t_ratio"] for c in C.values()]
    return dict(
        H92=v([c["floor"]["gap"] for c in C.values()], lambda x: x <= 0.01, lambda x: x > 0.03),
        H93=("supported" if all(c["best_rkt"] >= TAU for c in C.values()) else "refuted"),
        H94=v(rel, lambda x: x <= 0.80, lambda x: x > 0.95),
        H95=v([c["floor"]["gap"] - c["union"]["gap"] for c in C.values()], lambda x: x <= 0.0, lambda x: x > 0.01))


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


def u_rkt_one(x, s, rate, S, TR, pybamm, cell, theo, timed=False):
    """(U, r_kt) for one design; timed=True also returns the seconds r_kt alone took (the floor needs only r_kt)."""
    xc = cell.clip(x)
    pv, _, _ = TR.params(xc, s)
    u = theo(pv) / TR.stack_mass(xc, pv)
    t0 = time.perf_counter()
    k = S.predict(x, s, rate)["r_kt"]
    return (u, k, time.perf_counter() - t0) if timed else (u, k)


def rkt_time():
    """Seconds for r_kt alone: the first 32 designs of each seen condition's pool, timed -> rkt_time.json."""
    D = dev_conditions()
    xs = _x_index()
    S, TR, pybamm, cell, theo = _pyb()
    out = {}
    for c in sorted(D):
        s, rate = G._parse(c)
        out[c] = statistics.median(u_rkt_one(xs[(c, r["j"])], s, rate, S, TR, pybamm, cell, theo, timed=True)[2] for r in D[c][:32])
    (HERE / "rkt_time.json").write_text(json.dumps(dict(per_condition=out, median=statistics.median(out.values())), indent=1) + "\n")
    print(out)


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
    """Attach U and r_kt to the dev rows; returns the median measured seconds of r_kt alone (rkt_time.json)."""
    ur = {(r["cond"], r["j"]): r for r in R._load(path)}
    for c, rows in D.items():
        for r in rows:
            r["u"], r["rkt"] = ur[(c, r["j"])]["u"], ur[(c, r["j"])]["rkt"]
    return json.loads((HERE / "rkt_time.json").read_text())["median"]


def _line(name, c):
    bl = "; ".join(f"L{L} {d['gap']:.4f} ({d['t_ratio']:.3f}, {d['kept']})" for L, d in c["by_layers"].items())
    return (f"{name}: n {c['n']}; best design {c['best_j']} on (U, r_kt) layer {c['best_layer']}, U percentile {c['best_u_pct']:.2f},"
            f" r_kt {c['best_rkt']:+.2f}\n"
            f"  salt floor r_kt >= {TAU} then union: gap {c['floor']['gap']:.4f}, wall / all-DFN@100 {c['floor']['t_ratio']:.3f},"
            f" kept {c['floor']['kept']}, resumed {c['floor']['n_picked']}; floor / union time {c['floor']['t_ratio'] / c['union']['t_ratio']:.2f}\n"
            f"  by floor, gap (time ratio): " + "; ".join(f"{k} {d['gap']:.4f} ({d['t_ratio']:.3f})" for k, d in c["by_tau"].items()) + "\n"
            f"  cut to {LAYERS} layers then union: gap {c['gap']:.4f}, wall / all-DFN@100 {c['t_ratio']:.3f}, kept {c['kept']}, resumed {c['n_picked']}\n"
            f"  by layers, gap (time ratio, kept): {bl}\n"
            f"  5n union {c['union']['gap']:.4f} ({c['union']['t_ratio']:.3f}); 5m ladder {c['ladder']['gap']:.4f} ({c['ladder']['t_ratio']:.3f});"
            f" 5k front L1 DFN@100 {c['front1_dfn100']['gap']:.4f} ({c['front1_dfn100']['t_ratio']:.3f}),"
            f" L2 {c['front2_dfn100']['gap']:.4f} ({c['front2_dfn100']['t_ratio']:.3f})")


def _pooled(C):
    out = {}
    getters = [("floor_gap", lambda c: c["floor"]["gap"]), ("floor_t_ratio", lambda c: c["floor"]["t_ratio"]),
               ("floor_over_union_t", lambda c: c["floor"]["t_ratio"] / c["union"]["t_ratio"]),
               ("gap", lambda c: c["gap"]), ("t_ratio", lambda c: c["t_ratio"]),
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
         f" DFN@100 run's time, 5m's and 5n's six at their measured segments; r_kt charged {tp:.3f} s per design, the median measured, on every design)", ""]
    L += [_line(c, C[c]) for c in C]
    L += ["", "Pooled over conditions (median, max, exact):"] + [
        f"  {k}: {d['median']:.4f}, {d['max']:.4f}, {d['exact']} of {len(C)}" for k, d in p.items()]
    (HERE / "dev.txt").write_text("\n".join(L) + "\n")
    (HERE / "dev.json").write_text(json.dumps(dict(t_pred=tp, conditions=C, pooled=p), indent=1) + "\n")
    print("\n".join(L))


# ---------- fresh conditions (pybamm) ----------

def bench():
    kept = json.loads((HERE / "probe.json").read_text())["kept"]
    path = HERE / "bench.jsonl"
    xs = G.designs()
    done = {(r["cond"], r["j"], r["what"]) for r in R._load(path)}
    jobs = [(c, j, "RES", xs[j]) for c in kept for j in range(len(xs))]
    G._run = H._run
    G._write(path, [jb for jb in jobs if (jb[0], jb[1], jb[2]) not in done])


def report():
    kept = json.loads((HERE / "probe.json").read_text())["kept"]
    by = {}
    for r in R._load(HERE / "bench.jsonl"):
        by.setdefault(r["cond"], {})[r["j"]] = r
    Sx, TR, pybamm, cell, theo = _pyb()
    L = ["cell-fidelity milestone 5o: a closed-form salt floor before 5n's union screen, on fresh conditions", "",
         "Probe (baseline design, 2 cycles): " + ", ".join(f"{G.cid(s, r)} {'ok' if G.cid(s, r) in kept else 'fails'}" for s, r in CONDITIONS), ""]
    C, extra = {}, {}
    for c in kept:
        s, rate = G._parse(c)
        rows, dropped, secs = [], [], []
        for j, r in sorted(by.get(c, {}).items()):
            wh = r.get("cycle_wh") or []
            if not r.get("ok") or len(wh) < 100 or wh[0] <= 0:
                dropped.append(j)
                continue
            u, k, tk = u_rkt_one(r["x"], s, rate, Sx, TR, pybamm, cell, theo, timed=True)
            secs.append(tk)
            rows.append(dict(j=j, wh=wh[:100], m=r["mass_kg"], score=wh[99] / r["mass_kg"], seg=r["seg"], t100=r["seconds"], u=u, rkt=k))
        if not rows:
            continue
        tp = statistics.median(secs)
        C[c] = condition(rows, t_pred=tp)
        extra[c] = dict(dropped=dropped, t_pred=tp,
                        rows=[{k: r[k] for k in ("j", "score", "seg", "t100", "u", "rkt")} | {"wh_kg": [x / r["m"] for x in r["wh"]]} for r in rows])
        L.append(_line(c, C[c]) + f"\n  dropped: {dropped}; r_kt median {tp:.3f} s per design")
    vd = verdicts(C) if C else {}
    p = _pooled(C) if C else {}
    L += ["", "Pooled over conditions (median, max, exact):"] + [
        f"  {k}: {d['median']:.4f}, {d['max']:.4f}, {d['exact']} of {len(C)}" for k, d in p.items()]
    L += ["", "Verdicts: " + ", ".join(f"{k} {w}" for k, w in vd.items())]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(kept=kept, conditions=C, pooled=p, verdicts=vd, extra=extra), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    cmd = sys.argv[1:2]
    if cmd == ["urkt"]:
        urkt()
    elif cmd == ["rkt_time"]:
        rkt_time()
    elif cmd == ["dev"]:
        dev()
    elif cmd in (["probe"], ["bench"]):
        P._use_gate_machinery(CONDITIONS)
        G.HERE, G.SOBOL_SEED, G.WORKERS = HERE, SOBOL_SEED, WORKERS
        G.probe() if cmd == ["probe"] else bench()
    elif cmd == ["report"]:
        report()
    else:
        print(__doc__)
