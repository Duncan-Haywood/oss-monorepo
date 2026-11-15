"""Milestone 5s: does 5r's electrode-balance map, fed a power-law extrapolation of a design's own ten-cycle DFN lithium
loss, predict its 100-cycle DFN energy well enough to be the union screen's fade list?

    python experiments/mapscreen/run.py bench    # DFN (SEI + plating) to cycle 10 on every design of the 17 conditions -> bench.jsonl (resumable)
    python experiments/mapscreen/run.py tables   # 5r's balance tables for those designs (pybamm, no simulation) -> balance.jsonl, ocp.json
    python experiments/mapscreen/run.py report   # H108 to H111 (stdlib) -> results.txt, summary.json

5r showed fade splits into a design-only map (lost lithium -> lost open-circuit energy, no fitted constant) and a
lithium-loss rate, but fed the map DFN's own 20-cycle loss. 5n's union screen already runs every design to cycle 10 and
resumes to 100 the top 4 by raw cycle-10 Wh/kg plus the top 4 by a sqrt(cycle) extrapolation of the energy. This
milestone replaces the energy extrapolation with: L(n) = a n^b fitted (log-log least squares) to the run's own lithium
lost by the end of cycles 2 to 10, read at n = 99, and

    predicted Wh/kg at cycle 100 = Wh/kg at cycle 10 x E_ocv(n_Li - L(99)) / E_ocv(n_Li - lost by end of cycle 9)

with E_ocv 5r's open-circuit energy between the cut-offs. The ten-cycle runs are the union screen's own, so the only extra
cost is the map (about 0.05 s per design plus one OCP table per set). Truth: the committed 100-cycle DFN runs of each pool
(already read by earlier milestones; the predictor's output on them has not been). Plan in ../../LOG.md (5s plan).
"""
import importlib.util
import json
import math
import os
import statistics
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent

K = 10                 # cycles every design runs to (the union screen's first rung)
FIT = range(2, K + 1)  # cycles whose end-of-cycle lithium loss the power law is fitted to
TO = 100
M = 4                  # designs resumed from each list (5n's union)
WORKERS = int(os.environ.get("WORKERS", "4"))
# fixed by a rule on committed data before any run: median DFN fade from cycle 10 to 100 >= 0.2 and the pool's DFN-best
# design ranked below 4th by raw cycle-10 energy (so the union's fade list has to carry it)
CONDITIONS = ("Ai2020@0.25x", "Ai2020@0.275x", "Ai2020@0.3x", "Ai2020@0.35x", "Ai2020@0.375x", "Ai2020@0.4375x",
              "Ai2020@0.5x", "Ai2020@0.625x", "Chen2020@0.5x", "Chen2020@1x", "Chen2020@2x", "NCA_Kim2011@0.5x",
              "NCA_Kim2011@0.75x", "NCA_Kim2011@1x", "OKane2022@1x", "OKane2022@1.25x", "OKane2022@2x")


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


B = _mod("balance_run", EXP / "balance" / "run.py")
spearman, ocv_energy = B.spearman, B.ocv_energy


# ---------- pure helpers (stdlib; tested) ----------

def lsq(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    return my - b * mx, b


def power_fit(lost, fit=FIT):
    """(a, b) of L(n) = a n^b through the run's lithium lost by the end of cycle n (lost[n-1]), n in fit; None when fewer
    than three positive points."""
    pts = [(n, lost[n - 1]) for n in fit if n - 1 < len(lost) and lost[n - 1] > 0]
    if len(pts) < 3:
        return None
    la, b = lsq([math.log(n) for n, _ in pts], [math.log(v) for _, v in pts])
    return math.exp(la), b


def power_at(fit_ab, n):
    a, b = fit_ab
    return a * n ** b


def map_predict(bal, lost, wh10, k=K, to=TO):
    """Predicted cycle-`to` discharge energy (same unit as wh10). Cycle n's discharge holds n_Li minus the lithium lost by
    the end of cycle n-1. Falls back to wh10 (no fade) when the loss curve has no power law (no lithium lost)."""
    ab = power_fit(lost)
    if ab is None:
        return wh10
    l_k = lost[k - 2]
    l_to = max(power_at(ab, to - 1), l_k)
    e_k, _ = ocv_energy(bal["n_li"] - l_k, bal)
    e_to, _ = ocv_energy(bal["n_li"] - l_to, bal)
    return wh10 * e_to / e_k if e_k > 0 else 0.0


def sqrt_extrapolate(wh, k=K, lo=5, to=TO):
    """5n's fade fit: a line in sqrt(n) through cycles lo..k of the energy, read at `to`."""
    n = list(range(lo, k + 1))
    a, b = lsq([math.sqrt(i) for i in n], [wh[i - 1] for i in n])
    return a + b * math.sqrt(to)


def union(rows, key, m=M):
    """Top m by raw cycle-10 Wh/kg together with the top m by rows[key]; returns (gap to the pool's DFN best, picked)."""
    idx = range(len(rows))
    raw = sorted(idx, key=lambda i: -rows[i]["raw10"])[:m]
    ext = sorted(idx, key=lambda i: -rows[i][key])[:m]
    picked = sorted(set(raw) | set(ext))
    best = max(r["score"] for r in rows)
    return 1 - max(rows[i]["score"] for i in picked) / best, picked


def verdict(ok, bad):
    return "supported" if ok else ("refuted" if bad else "mixed")


# ---------- pybamm: bench and tables ----------

def _pools():
    """{cond: committed rows (j, wh per cycle in Wh, m kg, score = DFN@100 Wh/kg, t100)} and {(cond, j): x}."""
    fc = B._fc()
    D, xs = fc.dev_conditions(), fc._x_index()
    return {c: D[c] for c in CONDITIONS}, xs


def _child(job):
    B.CYCLES = K
    return B.simulate(job)


def _spawn(job, timeout=1800):
    import subprocess
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
    done = {(r["cond"], r["j"]) for r in B._load(path)}
    P, xs = _pools()
    todo = [(c, r["j"], "both", xs[(c, r["j"])]) for c in CONDITIONS for r in P[c] if (c, r["j"]) not in done]
    print(f"{len(todo)} runs to go", flush=True)
    with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as fh:
        for r in ex.map(_spawn, todo):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            print(r["cond"], r["j"], "ok" if r["ok"] else r["error"], flush=True)


def tables():
    import numpy as np
    import pybamm
    fc, cache, rows = B._fc(), {}, []
    from energy_cell import cell   # on sys.path once the frontcut chain has loaded
    pybamm.set_logging_level("ERROR")
    P, xs = _pools()
    t0 = time.perf_counter()
    for c in CONDITIONS:
        for r in P[c]:
            t1 = time.perf_counter()
            b = B.balance(c, xs[(c, r["j"])], pybamm, np, fc, cell, cache)
            t_map = time.perf_counter() - t1
            xc = cell.clip(xs[(c, r["j"])])
            pv, _, _ = fc.G.TR.params(xc, fc.G._parse(c)[0])
            # stack mass (kg, parallel count included): 5m's and 5n's committed pools store Wh/kg with m = 1
            rows.append(dict(cond=c, j=r["j"]) | b | dict(seconds=t_map, mass_kg=float(fc.G.TR.stack_mass(xc, pv))))
    with (HERE / "balance.jsonl").open("w") as fh:
        for r in rows:
            fh.write(json.dumps(r) + "\n")
    (HERE / "ocp.json").write_text(json.dumps(dict(grid=B.GRID, sets={s: dict(Un=u[0], Up=u[1]) for s, u in cache.items()})))
    print(f"{len(rows)} designs, {len(cache)} sets, {time.perf_counter() - t0:.1f} s")


DIAG = ("Ai2020@0.3x", "NCA_Kim2011@1x", "Chen2020@0.5x", "OKane2022@1x")   # post hoc: which error source


def _child100(job):
    B.CYCLES = TO
    return B.simulate(job)


def diag():
    """Post hoc, after the verdicts: DFN to cycle 100 with the lithium curve on the first 8 designs (by j) of four
    conditions, to split the predictor's error into the power-law extrapolation and the map."""
    import subprocess
    path = HERE / "diag.jsonl"
    done = {(r["cond"], r["j"]) for r in B._load(path)}
    P, xs = _pools()
    todo = [(c, r["j"], "both", xs[(c, r["j"])]) for c in DIAG for r in sorted(P[c], key=lambda r: r["j"])[:8] if (c, r["j"]) not in done]

    def one(job):
        c, j, v, x = job
        p = subprocess.run([sys.executable, __file__, "child100", json.dumps([c, j, v, list(map(float, x))])], capture_output=True, text=True)
        return json.loads(p.stdout.strip().splitlines()[-1]) if p.returncode == 0 else dict(cond=c, j=j, ok=False, error=p.stderr[-160:])
    with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as fh:
        for r in ex.map(one, todo):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            print(r["cond"], r["j"], r["ok"], flush=True)


# ---------- report (stdlib) ----------

def score_condition(c, pool, runs, bal, ocp):
    """Rows for designs whose committed run reached cycle 100 and whose fresh ten-cycle run completed."""
    out, repro = [], []
    for r in pool:
        f = runs.get((c, r["j"]))
        if not f or not f["ok"] or len(f.get("cycle_wh", [])) < K or len(r["wh"]) < TO or (c, r["j"]) not in bal:
            continue
        b = dict(bal[(c, r["j"])]) | dict(g=ocp["grid"]) | ocp["sets"][bal[(c, r["j"])]["pset"]]
        mass = bal[(c, r["j"])]["mass_kg"]
        wh10 = f["cycle_wh"][K - 1]
        committed10 = r["wh"][K - 1] / r["m"]   # Wh/kg (5m's and 5n's pools store Wh/kg with m = 1)
        repro.append(abs(wh10 / mass - committed10) / abs(committed10) if committed10 else None)
        ab = power_fit(f["lost_mol"])
        pred = map_predict(b, f["lost_mol"], wh10)
        out.append(dict(j=r["j"], score=r["score"], raw10=wh10 / mass, map=pred / mass,
                        sqrt=sqrt_extrapolate([w / mass for w in f["cycle_wh"]]),
                        fade_dfn=1 - r["wh"][TO - 1] / r["wh"][K - 1] if r["wh"][K - 1] else None,
                        fade_map=1 - pred / wh10 if wh10 else None,
                        fade_sqrt=1 - sqrt_extrapolate(f["cycle_wh"]) / wh10 if wh10 else None,
                        b=ab[1] if ab else None, lli10=f["lost_mol"][K - 1] / b["n_li"],
                        t10=f["seconds"], t_map=bal[(c, r["j"])].get("seconds")))
    return out, [x for x in repro if x is not None]


def condition(rows):
    sc = [r["score"] for r in rows]
    ib = max(range(len(rows)), key=lambda i: sc[i])
    rank = lambda key: sorted(range(len(rows)), key=lambda i: -rows[i][key]).index(ib) + 1
    gm, pm = union(rows, "map")
    gs, ps = union(rows, "sqrt")
    fm = [abs(r["fade_map"] - r["fade_dfn"]) for r in rows if r["fade_dfn"] is not None]
    fs = [abs(r["fade_sqrt"] - r["fade_dfn"]) for r in rows if r["fade_dfn"] is not None]
    return dict(n=len(rows), rho_raw=spearman([r["raw10"] for r in rows], sc), rho_map=spearman([r["map"] for r in rows], sc),
                rho_sqrt=spearman([r["sqrt"] for r in rows], sc), mae_fade_map=statistics.median(fm), mae_fade_sqrt=statistics.median(fs),
                gap_map=gm, gap_sqrt=gs, n_map=len(pm), n_sqrt=len(ps), best_rank_raw=rank("raw10"), best_rank_map=rank("map"),
                best_rank_sqrt=rank("sqrt"), median_b=statistics.median(r["b"] for r in rows if r["b"] is not None),
                fade_dfn_median=statistics.median(r["fade_dfn"] for r in rows if r["fade_dfn"] is not None),
                fade_map_median=statistics.median(r["fade_map"] for r in rows if r["fade_map"] is not None))


def verdicts(C):
    n = len(C)
    w108 = sum(c["rho_map"] > c["rho_sqrt"] for c in C.values())
    w109 = sum(c["mae_fade_map"] < c["mae_fade_sqrt"] for c in C.values())
    g = [c["gap_map"] for c in C.values()]
    d = [c["gap_map"] - c["gap_sqrt"] for c in C.values()]
    return dict(
        H108=verdict(w108 >= 12, w108 <= n // 2), H108_wins=w108,
        H109=verdict(w109 >= 12, w109 <= n // 2), H109_wins=w109,
        H110=verdict(all(x <= 0.01 for x in g), any(x > 0.03 for x in g)),
        H111=verdict(all(x <= 0.0 for x in d), any(x > 0.01 for x in d)))


def diag_report(P, bal, ocp):
    """Post hoc split of the error on the 100-cycle diagnostic runs: the power law's L(99) against DFN's own, and the map
    fed DFN's own L(99) (5r's decomposition at 100 cycles) against the map fed the power law."""
    rows = []
    com = {(c, r["j"]): r for c in DIAG for r in P[c]}
    for r in B._load(HERE / "diag.jsonl"):
        key = (r["cond"], r["j"])
        if not r["ok"] or len(r.get("cycle_wh", [])) < TO:
            continue
        b = dict(bal[key]) | dict(g=ocp["grid"]) | ocp["sets"][bal[key]["pset"]]
        L, wh = r["lost_mol"], r["cycle_wh"]
        ab = power_fit(L[:K])
        e9, _ = ocv_energy(b["n_li"] - L[K - 2], b)
        e_true, _ = ocv_energy(b["n_li"] - L[TO - 2], b)
        e_pow, _ = ocv_energy(b["n_li"] - max(power_at(ab, TO - 1), L[K - 2]), b)
        rows.append(dict(cond=r["cond"], j=r["j"], l_ratio=power_at(ab, TO - 1) / L[TO - 2], b10=ab[1],
                         b_late=math.log(L[TO - 2] / L[49]) / math.log((TO - 1) / 50), fade_dfn=1 - wh[TO - 1] / wh[K - 1],
                         map_true=1 - e_true / e9, map_pow=1 - e_pow / e9,
                         repro=abs(wh[TO - 1] / bal[key]["mass_kg"] - com[key]["score"]) / com[key]["score"]))
    L = [f"Post hoc diagnostic (after the verdicts): DFN to cycle {TO} on the first 8 designs of {', '.join(DIAG)}; "
         f"{len(rows)} of {len(B._load(HERE / 'diag.jsonl'))} completed (the rest were killed for memory, not by the solver)",
         f"{'condition':16s}{'j':>3s}{'Lpow/Ltrue':>11s}{'b 2-10':>8s}{'b 50-99':>8s}{'fade DFN':>9s}{'map(true L)':>12s}{'map(pow L)':>11s}"]
    for r in rows:
        L.append(f"{r['cond']:16s}{r['j']:3d}{r['l_ratio']:11.2f}{r['b10']:8.2f}{r['b_late']:8.2f}{r['fade_dfn']:9.3f}{r['map_true']:12.3f}{r['map_pow']:11.3f}")
    by = {}
    for r in rows:
        by.setdefault(r["cond"], []).append(r)
    for c, g in by.items():
        L.append(f"  {c:16s} n={len(g)} median Lpow/Ltrue {statistics.median(r['l_ratio'] for r in g):.2f}; "
                 f"MAE map(true L) {statistics.mean(abs(r['map_true'] - r['fade_dfn']) for r in g):.3f}, "
                 f"map(pow L) {statistics.mean(abs(r['map_pow'] - r['fade_dfn']) for r in g):.3f}")
    if rows:
        L.append(f"  all: MAE map(true L) {statistics.mean(abs(r['map_true'] - r['fade_dfn']) for r in rows):.3f}, map(pow L) "
                 f"{statistics.mean(abs(r['map_pow'] - r['fade_dfn']) for r in rows):.3f}; max reproduction difference of the committed "
                 f"cycle-100 Wh/kg {max(r['repro'] for r in rows):.1e}")
    return L, rows


def report():
    P, _ = _pools()
    runs = {(r["cond"], r["j"]): r for r in B._load(HERE / "bench.jsonl")}
    bal = {(r["cond"], r["j"]): r for r in B._load(HERE / "balance.jsonl")}
    ocp = json.loads((HERE / "ocp.json").read_text())
    C, R, repro_all, t10, tmap = {}, {}, [], [], []
    for c in CONDITIONS:
        rows, rep = score_condition(c, P[c], runs, bal, ocp)
        R[c], repro_all = rows, repro_all + rep
        t10 += [r["t10"] for r in rows if r["t10"]]
        tmap += [r["t_map"] for r in rows if r["t_map"]]
        if len(rows) >= 8:
            C[c] = condition(rows)
    V = verdicts(C)
    fails = sum(1 for r in runs.values() if not r["ok"])
    L = [f"cell-fidelity milestone 5s: 5r's balance map fed a power-law extrapolation of ten DFN cycles' lithium loss, as the union screen's fade list",
         f"{len(runs)} ten-cycle DFN runs ({fails} failed); reproduction of committed cycle-10 Wh/kg: max relative difference "
         f"{max(repro_all):.2e}, median {statistics.median(repro_all):.2e} over {len(repro_all)}",
         f"median seconds: ten DFN cycles {statistics.median(t10):.2f}, map tables {statistics.median(tmap):.3f} per design", "",
         f"{'condition':18s}{'n':>4s}{'rho raw':>9s}{'rho map':>9s}{'rho sqrt':>9s}{'|fade| map':>11s}{'sqrt':>7s}"
         f"{'gap map':>9s}{'gap sqrt':>9s}{'rank raw/map/sqrt':>19s}{'b':>6s}{'fade dfn':>9s}{'map':>6s}"]
    for c, d in C.items():
        L.append(f"{c:18s}{d['n']:4d}{d['rho_raw']:9.3f}{d['rho_map']:9.3f}{d['rho_sqrt']:9.3f}{d['mae_fade_map']:11.3f}"
                 f"{d['mae_fade_sqrt']:7.3f}{d['gap_map']:9.4f}{d['gap_sqrt']:9.4f}"
                 f"{d['best_rank_raw']:>9d}/{d['best_rank_map']:d}/{d['best_rank_sqrt']:d}{d['median_b']:6.2f}{d['fade_dfn_median']:9.3f}{d['fade_map_median']:6.3f}")
    L += ["", f"H108 (map ranks DFN@100 better than the sqrt fit on >= 12 of {len(C)}): {V['H108']} ({V['H108_wins']} of {len(C)})",
          f"H109 (map's median |fade error| below the sqrt fit's on >= 12): {V['H109']} ({V['H109_wins']} of {len(C)})",
          f"H110 (union raw + map within 1% of the pool's DFN best on every condition): {V['H110']} (worst {max(c['gap_map'] for c in C.values()):.4f})",
          f"H111 (union raw + map no worse than 5n's union raw + sqrt on every condition): {V['H111']} "
          f"(worst excess {max(c['gap_map'] - c['gap_sqrt'] for c in C.values()):+.4f})"]
    intended = [c for c, d in C.items() if d["best_rank_raw"] > M]
    V["intended"] = dict(conditions=intended, H108_wins=sum(C[c]["rho_map"] > C[c]["rho_sqrt"] for c in intended),
                         H109_wins=sum(C[c]["mae_fade_map"] < C[c]["mae_fade_sqrt"] for c in intended),
                         worst_gap_map=max(C[c]["gap_map"] for c in intended), worst_gap_sqrt=max(C[c]["gap_sqrt"] for c in intended))
    I = V["intended"]
    L += ["", f"Selection slip (found after the verdicts): the rule ranked committed cycle-10 energy in Wh, not Wh/kg, so {len(C) - len(intended)} of the {len(C)} "
          f"have the DFN best in the raw top {M}. On the {len(intended)} that meet the rule as meant ({', '.join(intended)}): map beats sqrt "
          f"on ranking {I['H108_wins']} of {len(intended)}, on fade size {I['H109_wins']}; worst union gap map {I['worst_gap_map']:.4f}, "
          f"sqrt {I['worst_gap_sqrt']:.4f}. No verdict changes.", ""]
    DL, drows = diag_report(P, bal, ocp) if (HERE / "diag.jsonl").exists() else ([], [])
    L += DL
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(conditions=C, verdicts=V, rows=R, diag=drows,
                                                       repro_max=max(repro_all), repro_median=statistics.median(repro_all)), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "report"
    if cmd == "child":
        c, j, v, x = json.loads(sys.argv[2])
        print(json.dumps(_child((c, j, v, x))))
    elif cmd == "child100":
        c, j, v, x = json.loads(sys.argv[2])
        print(json.dumps(_child100((c, j, v, x))))
    elif cmd == "diag":
        diag()
    elif cmd == "bench":
        bench()
    elif cmd == "tables":
        tables()
    else:
        report()
