"""Milestone 5n: read late fade off the first ten cycles with a sqrt(cycle) fit, and keep its picks next to the raw picks.

    python experiments/latefade/run.py dev      # replay on the 30 seen conditions (5b to 5m), stdlib -> dev.txt, dev.json
    python experiments/latefade/run.py probe    # baseline design, SPMe and DFN for 2 cycles at each fresh condition -> probe.json
    python experiments/latefade/run.py bench    # 64 Sobol (seed 12) designs x one DFN run resumed at 10, 20, 50, 100 cycles (resumable)
    python experiments/latefade/run.py report   # results.txt, summary.json (stdlib)

5m found that on Ai2020 below about 0.4x the designs that start best fade fastest, so the cycle-10 energy ranks the
100-cycle score badly (Spearman 0.08 to 0.24) and any rank cut at cycle 10 loses the best design. SEI growth, the fade
PyBaMM's submodel puts first, goes roughly as the square root of time, so the screen tested here extrapolates each
design's cycles 5 to 10 with a least-squares line in sqrt(cycle) to cycle 100, and resumes to cycle 100 the union of the top
4 by raw cycle-10 Wh/kg and the top 4 by that extrapolation (4 to 8 designs). The raw picks guard the cells where the
extrapolation is noisy (NCA_Kim2011, Chen2020 in development); the extrapolated picks catch the designs that start lower
and fade slower. Fixed on development data before the fresh bench; plan and H87 to H91 in ../../LOG.md (milestone 5n
plan). Simulation, pools and the resumed run are 5m's, unchanged.
"""
import importlib.util
import json
import math
import os
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent

SOBOL_SEED = 12
WORKERS = int(os.environ.get("WORKERS", "3"))
K = 10          # cycles every design is run to
LO = 5          # first cycle of the fit window (after the first-cycle transient)
M = 4           # designs kept from each list
# fresh conditions, fixed before any run: Ai2020 at two currents no milestone ran, inside the low-current regime where every
# rank cut at cycle 10 missed (0.25x, 0.3x, 0.375x), and NCA_Kim2011 at a current no milestone ran, the cell where the sqrt
# extrapolation alone ranked worst in development (its picks there are the ones the union must not be hurt by)
CONDITIONS = (("Ai2020", 0.275), ("Ai2020", 0.35), ("NCA_Kim2011", 1.25))


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


H = _mod("halving_run", EXP / "halving" / "run.py")
E, P, G, R = H.E, H.P, H.G, H.R
spearman, at, cost_to = H.spearman, H.at, H.cost_to


# ---------- pure helpers (stdlib; tested) ----------

def lsq(xs, ys):
    """Least-squares line: (intercept, slope)."""
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    return my - b * mx, b


def extrapolate(wh_kg, k=K, lo=LO, to=100, form="sqrt"):
    """Fit cycles lo..k of a per-cycle energy curve with a line in sqrt(n) (or log n) and read it at cycle `to`."""
    n = list(range(lo, k + 1))
    y = [wh_kg[i - 1] for i in n]
    f = math.sqrt if form == "sqrt" else math.log
    a, b = lsq([f(i) for i in n], y)
    return a + b * f(to)


def ranked(vals, idx):
    return sorted(idx, key=lambda i: -vals[i])


def union_screen(rows, k=K, lo=LO, m=M, form="sqrt"):
    """DFN to cycle k on every design; resume to 100 the top m by raw cycle-k Wh/kg and the top m by the extrapolated
    cycle-100 Wh/kg. Returns (gap, picked, seconds)."""
    idx = range(len(rows))
    raw = [at(r, k) for r in rows]
    ext = [extrapolate([w / r["m"] for w in r["wh"]], k, lo, 100, form) for r in rows]
    picked = sorted(set(ranked(raw, idx)[:m]) | set(ranked(ext, idx)[:m]))
    best = max(r["score"] for r in rows)
    got = max(rows[i]["score"] for i in picked)
    t = sum(cost_to(r, k) for r in rows) + sum(cost_to(rows[i], 100) - cost_to(rows[i], k) for i in picked)
    return 1 - got / best, picked, t


def extrap_only(rows, k=K, lo=LO, m=3, form="sqrt"):
    idx = range(len(rows))
    ext = [extrapolate([w / r["m"] for w in r["wh"]], k, lo, 100, form) for r in rows]
    picked = ranked(ext, idx)[:m]
    return 1 - max(rows[i]["score"] for i in picked) / max(r["score"] for r in rows)


def condition(rows):
    t_all = sum(cost_to(r, 100) for r in rows)
    sc = [r["score"] for r in rows]
    gap, picked, t = union_screen(rows)
    ext = [extrapolate([w / r["m"] for w in r["wh"]]) for r in rows]
    out = dict(n=len(rows), t_all=t_all, gap=gap, t_ratio=t / t_all, n_picked=len(picked),
               picked=[rows[i]["j"] for i in picked], best_j=max(rows, key=lambda r: r["score"])["j"],
               rho_raw10=spearman([at(r, K) for r in rows], sc), rho_ext10=spearman(ext, sc),
               rho_log10=spearman([extrapolate([w / r["m"] for w in r["wh"]], form="log") for r in rows], sc),
               rho_raw20=spearman([at(r, 20) for r in rows], sc), ext_only3=extrap_only(rows))
    g, _, tt, _ = H.halving(rows)
    out["ladder"] = dict(gap=g, t_ratio=tt / t_all)
    g, _, tt = H.fixed(rows, 10, 3)
    out["fixed10"] = dict(gap=g, t_ratio=tt / t_all)
    g, _, tt = union_screen(rows, form="log")
    out["union_log"] = dict(gap=g, t_ratio=tt / t_all)
    return out


def verdicts(C, ai):
    """H87 to H91 as registered in the 5n plan (LOG.md)."""
    v = R.verdict
    hard = [c for c in ai if c in C]
    better = [C[c]["rho_ext10"] - C[c]["rho_raw10"] for c in hard]
    return dict(
        H87=v([c["gap"] for c in C.values()], lambda x: x <= 0.01, lambda x: x > 0.03),
        H88=("supported" if better and all(d > 0 for d in better) else
             "refuted" if better and all(d <= 0 for d in better) else "mixed"),
        H89=v([c["t_ratio"] for c in C.values()], lambda x: x <= 0.30, lambda x: x > 0.40),
        H90=v([c["gap"] - c["ladder"]["gap"] for c in C.values()], lambda x: x <= 0.0, lambda x: x > 0.01),
        H91=("supported" if any(C[c]["rho_raw10"] < 0.85 for c in hard)
             else "refuted" if all(C[c]["rho_raw10"] >= 0.92 for c in hard) else "mixed"))


# ---------- development ----------

def dev_conditions():
    """{condition: rows}: the 27 conditions of 5b to 5l (DFN@100 runs, cost k/100) plus 5m's three (measured segments)."""
    D = H.dev_conditions()
    S = json.loads((EXP / "halving" / "summary.json").read_text())
    for c, e in S["extra"].items():
        D[c] = [dict(j=r["j"], score=r["score"], wh=r["wh_kg"], m=1.0, t100=r["t100"], seg=r["seg"]) for r in e["rows"]]
    return D


def _line(name, c):
    return (f"{name}: n {c['n']}; Spearman with DFN@100: raw cycle 10 {c['rho_raw10']:+.2f}, sqrt-extrapolated {c['rho_ext10']:+.2f},"
            f" log-extrapolated {c['rho_log10']:+.2f}, raw cycle 20 {c['rho_raw20']:+.2f}\n"
            f"  union screen (top {M} raw + top {M} sqrt): gap {c['gap']:.4f}, wall / all-DFN@100 {c['t_ratio']:.3f},"
            f" {c['n_picked']} resumed {c['picked']}, best {c['best_j']}\n"
            f"  5m ladder {c['ladder']['gap']:.4f} ({c['ladder']['t_ratio']:.3f}); fixed DFN@10 top 3 {c['fixed10']['gap']:.4f}"
            f" ({c['fixed10']['t_ratio']:.3f}); union with log {c['union_log']['gap']:.4f} ({c['union_log']['t_ratio']:.3f});"
            f" sqrt top 3 alone {c['ext_only3']:.4f}")


def _pooled(C):
    out = {}
    for name, get in (("gap", lambda c: c["gap"]), ("t_ratio", lambda c: c["t_ratio"]),
                      ("ladder_gap", lambda c: c["ladder"]["gap"]), ("ladder_t_ratio", lambda c: c["ladder"]["t_ratio"]),
                      ("fixed10_gap", lambda c: c["fixed10"]["gap"]), ("union_log_gap", lambda c: c["union_log"]["gap"]),
                      ("ext_only3_gap", lambda c: c["ext_only3"])):
        xs = [get(c) for c in C.values()]
        out[name] = dict(median=statistics.median(xs), max=max(xs), exact=sum(1 for x in xs if x < 1e-12))
    return out


def dev():
    D = dev_conditions()
    C = {c: condition(rows) for c, rows in sorted(D.items())}
    p = _pooled(C)
    L = ["cell-fidelity milestone 5n, development (30 conditions seen by milestones 5b to 5m; 5b to 5l charged k/100 of each"
         " DFN@100 run's time, 5m's three at their measured segments)", ""] + [_line(c, C[c]) for c in C]
    L += ["", "Pooled over conditions (median, max, exact):"] + [
        f"  {k}: {d['median']:.4f}, {d['max']:.4f}, {d['exact']} of {len(C)}" for k, d in p.items()]
    (HERE / "dev.txt").write_text("\n".join(L) + "\n")
    (HERE / "dev.json").write_text(json.dumps(dict(conditions=C, pooled=p), indent=1) + "\n")
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
    L = ["cell-fidelity milestone 5n: sqrt(cycle) fade extrapolation from ten DFN cycles, on fresh conditions", "",
         "Probe (baseline design, 2 cycles): " + ", ".join(f"{G.cid(s, r)} {'ok' if G.cid(s, r) in kept else 'fails'}" for s, r in CONDITIONS), ""]
    C, extra = {}, {}
    for c in kept:
        rows, dropped = [], []
        for j, r in sorted(by.get(c, {}).items()):
            wh = r.get("cycle_wh") or []
            if not r.get("ok") or len(wh) < 100 or wh[0] <= 0:
                dropped.append(j)
                continue
            rows.append(dict(j=j, wh=wh[:100], m=r["mass_kg"], score=wh[99] / r["mass_kg"], seg=r["seg"], t100=r["seconds"]))
        if not rows:
            continue
        C[c] = condition(rows)
        extra[c] = dict(dropped=dropped, seg_median=[statistics.median(r["seg"][i] for r in rows) for i in range(len(H.RUNGS))],
                        rows=[{k: r[k] for k in ("j", "score", "seg", "t100")} | {"wh_kg": [x / r["m"] for x in r["wh"]]} for r in rows])
        L.append(_line(c, C[c]) + f"\n  dropped: {dropped}; median segment seconds {[round(s, 1) for s in extra[c]['seg_median']]}")
    ai = [c for c in C if c.startswith("Ai2020")]
    vd = verdicts(C, ai) if C else {}
    p = _pooled(C) if C else {}
    L += ["", "Pooled over conditions (median, max, exact):"] + [
        f"  {k}: {d['median']:.4f}, {d['max']:.4f}, {d['exact']} of {len(C)}" for k, d in p.items()]
    L += ["", "Verdicts: " + ", ".join(f"{k} {w}" for k, w in vd.items())]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(kept=kept, conditions=C, pooled=p, verdicts=vd, extra=extra), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    cmd = sys.argv[1:2]
    if cmd == ["dev"]:
        dev()
    elif cmd in (["probe"], ["bench"]):
        P._use_gate_machinery(CONDITIONS)
        G.HERE, G.SOBOL_SEED, G.WORKERS = HERE, SOBOL_SEED, WORKERS
        G.probe() if cmd == ["probe"] else bench()
    elif cmd == ["report"]:
        report()
    else:
        print(__doc__)
