"""Milestone 5a: do the post-hoc winners of parts 2b and 4b hold on 128 fresh designs?

    python experiments/fresh/run.py bench    # 128 Sobol (seed 1) designs x SPM/SPMe/DFN, 100 cycles -> bench.jsonl (resumable)
    python experiments/fresh/run.py report   # replays 15 frozen methods on seed-0 and fresh designs -> results.txt, summary.json
    python experiments/fresh/run.py extra    # sections C and D only, from summary.json (report runs it too)

The simulation is milestone 2's (`../cycles/run.py`: `simulate`, `_spawn`, `score_at`) with only the Sobol seed
changed; the searches are milestone 4b's (`../mfbo/run.py`) unchanged, charged milestone 2's baseline costs
(`../cycles/cost.json`, cost A). Plan and hypotheses H25 to H28 are in ../../LOG.md, written before this script.
Needs numpy, scipy and (for `bench`) pybamm.
"""
import importlib.util
import json
import math
import os
import random
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent

FRESH_SEED = 1
N_SEEDS = 30
POOLS = (16, 32, 64, 96)
TOL = 0.01
WORKERS = int(os.environ.get("WORKERS", "4"))
SCREENS = ["screen SPM@2", "screen SPM@100", "screen DFN@2", "screen SPMe@2", "screen SPMe@10",
           "screen SPMe@30", "screen SPMe@100"]
COKRIG = ["coKrig aEI SPM@2", "coKrig aEI DFN@2", "coKrig MF-UCB SPM@2", "coKrig MF-UCB DFN@2"]
METHODS = ["GP-EI DFN@100"] + SCREENS + COKRIG + [m + " cheap-start" for m in COKRIG]
CHEAP = "coKrig MF-UCB DFN@2 cheap-start"


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


CR = _mod("cycles_run", EXP / "cycles" / "run.py")


# ---------- pure helpers (stdlib; tested) ----------

def scores(rows):
    """{(model, n): [Wh/kg at cycle n]} over the designs in rows ({j: {model: run}}), milestone 2's rule."""
    js = sorted(rows)
    sc = {}
    for m in CR.MODELS:
        for n in CR.NS:
            sc[(m, n)] = [CR.score_at(rows[j][m], n, rows[j][m]["mass_kg"]) if rows[j][m].get("mass_kg") else 0.0
                          for j in js]
    return sc


def nn_dist(A, B, lo, hi):
    """For each row of A, the Euclidean distance to the nearest row of B, in bound-normalised units."""
    def u(x):
        return [(x[k] - lo[k]) / (hi[k] - lo[k]) for k in range(len(x))]
    UB = [u(b) for b in B]
    out = []
    for a in A:
        ua = u(a)
        out.append(min(math.sqrt(sum((p - q) ** 2 for p, q in zip(ua, ub))) for ub in UB))
    return out


def rank_of_best(screen, target):
    """1-based rank, under screen (descending), of the design with the highest target."""
    b = max(range(len(target)), key=lambda i: target[i])
    order = sorted(range(len(screen)), key=lambda i: -screen[i])
    return order.index(b) + 1


def spearman_diff_ci(a, b, t, n=2000, seed=0):
    """Point and 95% bootstrap interval of Spearman(a, t) - Spearman(b, t)."""
    sp = CR.spearman
    d0 = sp(a, t) - sp(b, t)
    rng = random.Random(seed)
    N = len(t)
    out = []
    for _ in range(n):
        idx = [rng.randrange(N) for _ in range(N)]
        v = sp([a[i] for i in idx], [t[i] for i in idx]) - sp([b[i] for i in idx], [t[i] for i in idx])
        if not math.isnan(v):
            out.append(v)
    out.sort()
    return d0, out[int(0.025 * len(out))], out[int(0.975 * len(out)) - 1]


# ---------- benchmark ----------

def fresh_designs():
    CR.SOBOL_SEED = FRESH_SEED
    try:
        return CR.designs()
    finally:
        CR.SOBOL_SEED = 0


def bench():
    path = HERE / "bench.jsonl"
    done = set()
    if path.exists():
        done = {(r["j"], r["model"]) for r in map(json.loads, path.read_text().splitlines())}
    xs = fresh_designs()
    jobs = [(j, m) for m in ("DFN", "SPMe", "SPM") for j in range(len(xs)) if (j, m) not in done]

    def go(job):
        j, m = job
        return dict(j=j, model=m, x=xs[j], **CR._spawn(xs[j], m, 100))

    with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as f:
        for r in ex.map(go, jobs):
            if "exit -9" in (r.get("error") or ""):   # killed by the session's memory limit, not a model failure: rerun later
                print(r["j"], r["model"], "killed (-9), not recorded", flush=True)
                continue
            f.write(json.dumps(r) + "\n")
            f.flush()
            print(r["j"], r["model"], r["ok"], r["ok_cycles"], r["seconds"] and round(r["seconds"], 1), flush=True)


def load_rows(path):
    rows = {}
    for r in map(json.loads, Path(path).read_text().splitlines()):
        rows.setdefault(r["j"], {})[r["model"]] = r
    return rows


def make_D(rows, cost):
    js = sorted(rows)
    sc = scores(rows)
    xs = [rows[j]["DFN"]["x"] for j in js]
    lo = [min(x[k] for x in xs) for k in range(4)]
    hi = [max(x[k] for x in xs) for k in range(4)]
    return dict(sc=sc, x=xs, cost=cost, n=len(js), target=sc[("DFN", 100)],
                rmin=[rows[j]["SPMe"]["r_min"] for j in js],
                u=[[(x[k] - lo[k]) / (hi[k] - lo[k]) for k in range(4)] for x in xs])


def replay(D, MF):
    cf = lambda cell, i: D["cost"][cell]   # cost A
    res = {}
    for P in POOLS:
        for m in METHODS:
            res[(P, m)] = []
        for s in range(N_SEEDS):
            pool = random.Random(s).sample(range(D["n"]), P)
            thr = (1 - TOL) * max(D["target"][i] for i in pool)
            for m in METHODS:
                tr = MF.run_method(m, pool, D, cf, thr, s)
                res[(P, m)].append(MF.S.t_hit(tr.pts, thr))
        print("pool", P, "done", flush=True)
    return res


def report():
    import numpy as np  # noqa: F401  (mfbo needs it)
    MF = _mod("mfbo_run", EXP / "mfbo" / "run.py")
    S = MF.S
    cost = {(m, int(n)): sorted(v)[1] for m, d in json.loads((EXP / "cycles" / "cost.json").read_text()).items()
            for n, v in d.items()}
    old_rows, new_rows = load_rows(EXP / "cycles" / "bench.jsonl"), load_rows(HERE / "bench.jsonl")
    assert len(new_rows) == 128 and all(len(v) == 3 for v in new_rows.values()), "fresh bench incomplete"
    D0, D1 = make_D(old_rows, cost), make_D(new_rows, cost)
    from energy_cell import cell
    lo, hi = list(cell.BOUNDS[:, 0]), list(cell.BOUNDS[:, 1])
    nn = sorted(nn_dist(D1["x"], D0["x"], lo, hi))
    R0, R1 = replay(D0, MF), replay(D1, MF)
    med = S.med
    t1 = D1["target"]
    N = D1["n"]
    L = ["cell-fidelity milestone 5a: the post-hoc winners of parts 2b and 4b on 128 fresh designs (Sobol seed 1)",
         f"fresh designs {N}; nearest seed-0 design, normalised distance: min {nn[0]:.3f}, median {nn[N // 2]:.3f}, max {nn[-1]:.3f}",
         "fails (stopped before cycle 100), per model: " +
         ", ".join(f"{m} {sum(1 for j in new_rows if new_rows[j][m]['ok_cycles'] < 100)}" for m in CR.MODELS),
         f"DFN@100 fresh: best {max(t1):.1f}, median {sorted(t1)[N // 2]:.1f}, zeros {sum(1 for v in t1 if v == 0)}; "
         f"seed 0: best {max(D0['target']):.1f}, median {sorted(D0['target'])[N // 2]:.1f}",
         f"SPMe r_min fresh: median {sorted(D1['rmin'])[N // 2]:.3f}, 10th pct {sorted(D1['rmin'])[N // 10]:.3f}, "
         f"<= 0.1: {sum(1 for r in D1['rmin'] if r <= 0.1)}", ""]
    L.append("A. each cell as a screen for DFN@100: Spearman (fresh / seed 0) and rank of the DFN-best design (fresh / seed 0)")
    cells = {}
    for m in CR.MODELS:
        for n in CR.NS:
            c = (m, n)
            v = dict(rho1=CR.spearman(D1["sc"][c], t1), rho0=CR.spearman(D0["sc"][c], D0["target"]),
                     rank1=rank_of_best(D1["sc"][c], t1), rank0=rank_of_best(D0["sc"][c], D0["target"]))
            cells[f"{m}@{n}"] = v
            L.append(f"  {m + '@' + str(n):<10} {v['rho1']:6.3f} / {v['rho0']:6.3f}   rank {v['rank1']:3d} / {v['rank0']:3d}")
    d, dlo, dhi = spearman_diff_ci(D1["sc"][("SPMe", 10)], D1["sc"][("SPMe", 100)], t1)
    L += ["", f"Spearman(SPMe@10) - Spearman(SPMe@100), fresh: {d:.3f} (95% CI {dlo:.3f} to {dhi:.3f})", ""]
    L.append("B. median T1 (charged s, cost A), 30 pools per size; fresh (seed 0 in brackets); p = paired Wilcoxon against GP-EI, fresh")
    L.append(f"{'method':<34}" + "".join(f"{'N=' + str(P):>20}" for P in POOLS))
    tab = {}
    for m in METHODS:
        row = f"{m:<34}"
        for P in POOLS:
            a, b = med(R1[(P, m)]), med(R0[(P, m)])
            p = S.wilcoxon(R1[(P, m)], R1[(P, "GP-EI DFN@100")]) if m != "GP-EI DFN@100" else float("nan")
            tab[f"{P}|{m}"] = dict(fresh=a, seed0=b, p_vs_gp=p)
            row += f"{a:8.1f} ({b:6.1f}) {p:7.2g}" if m != "GP-EI DFN@100" else f"{a:8.1f} ({b:6.1f})        "
        L.append(row)
    L.append("")
    # hypotheses
    gp64, spm2_64, s10_64 = R1[(64, "GP-EI DFN@100")], R1[(64, "screen SPM@2")], R1[(64, "screen SPMe@10")]
    p_gp, p_spm2 = S.wilcoxon(s10_64, gp64), S.wilcoxon(s10_64, spm2_64)
    m10, mgp, mspm2 = med(s10_64), med(gp64), med(spm2_64)
    h25 = "supported" if (m10 < mgp and m10 < mspm2 and p_gp < 0.05 and p_spm2 < 0.05) else (
        "refuted" if (m10 >= mgp or m10 >= mspm2) else "not supported (medians lower, p >= 0.05)")
    h26 = "supported" if dlo > 0 else ("refuted" if d <= 0 else "not supported (CI includes 0)")
    h27_parts = []
    ok27, refute27 = True, False
    for P in POOLS:
        mc, mg = med(R1[(P, CHEAP)]), med(R1[(P, "GP-EI DFN@100")])
        p = S.wilcoxon(R1[(P, CHEAP)], R1[(P, "GP-EI DFN@100")])
        bs = min(SCREENS, key=lambda s: med(R1[(P, s)]))
        ratio = mc / med(R1[(P, bs)])
        good = mc < mg and p < 0.05 and ratio <= 1.2
        ok27 &= good
        refute27 |= not good
        h27_parts.append(f"N={P}: {mc:.1f} s vs GP-EI {mg:.1f} (p {p:.2g}); best screen {bs} {med(R1[(P, bs)]):.1f}, ratio {ratio:.2f}")
    h27 = "supported" if ok27 else "refuted"
    m0 = [med(R0[(64, m)]) for m in METHODS]
    m1 = [med(R1[(64, m)]) for m in METHODS]
    rho28 = CR.spearman(m0, m1)
    h28 = "supported" if rho28 >= 0.7 else ("refuted" if rho28 < 0.5 else "inconclusive")
    L += ["H. hypotheses (fixed in LOG.md before the run)",
          f"H25 {h25}: SPMe@10 screen {m10:.1f} s vs GP-EI {mgp:.1f} (p {p_gp:.2g}) and SPM@2 screen {mspm2:.1f} (p {p_spm2:.2g}), pools of 64",
          f"H26 {h26}: difference {d:.3f}, CI {dlo:.3f} to {dhi:.3f}",
          f"H27 {h27}: " + "; ".join(h27_parts),
          f"H28 {h28}: Spearman of 15 methods' median T1 at 64, seed 0 vs fresh, {rho28:.3f}"]
    best_fresh = {P: min(METHODS, key=lambda m: med(R1[(P, m)])) for P in POOLS}
    L += ["", "fastest method per pool size, fresh: " + ", ".join(f"{P}: {m} {med(R1[(P, m)]):.1f}" for P, m in best_fresh.items())]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    summ = dict(n=N, nn_seed0=dict(min=nn[0], median=nn[N // 2], max=nn[-1]), cells=cells,
                spearman_diff=dict(point=d, lo=dlo, hi=dhi), t1=tab,
                hypotheses=dict(H25=h25, H26=h26, H27=h27, H28=h28, rho28=rho28),
                raw={f"{P}|{m}": dict(fresh=R1[(P, m)], seed0=R0[(P, m)]) for P in POOLS for m in METHODS})
    (HERE / "summary.json").write_text(json.dumps(summ, indent=1, default=lambda v: None) + "\n")
    print("\n".join(L))
    extra()


def worst_ratio(t1, methods, pools, key):
    """Per method, the largest ratio of its median T1 to the fastest method's at the same pool size."""
    best = {P: min(t1[f"{P}|{m}"][key] for m in methods) for P in pools}
    return {m: max(t1[f"{P}|{m}"][key] / best[P] for P in pools) for m in methods}


def extra():
    """Section C (extra, after the verdicts, no hypothesis): which method stays near the fastest at every pool size."""
    summ = json.loads((HERE / "summary.json").read_text())
    t1 = summ["t1"]
    w = {k: worst_ratio(t1, METHODS, POOLS, k) for k in ("fresh", "seed0")}
    L = (HERE / "results.txt").read_text().rstrip("\n").split("\n")
    L = L[:L.index("C. (extra, no verdict) worst ratio to the fastest method over pool sizes 16 to 96")] if \
        "C. (extra, no verdict) worst ratio to the fastest method over pool sizes 16 to 96" in L else L
    L += ["", "C. (extra, no verdict) worst ratio to the fastest method over pool sizes 16 to 96",
          f"{'method':<34} {'fresh':>6} {'seed 0':>7}"]
    for m in sorted(METHODS, key=lambda m: w["fresh"][m]):
        L.append(f"{m:<34} {w['fresh'][m]:6.2f} {w['seed0'][m]:7.2f}")
    L += ["", "D. median T1 (s) by pool size, fresh designs (for the figure)",
          "pool GP-EI SPM@100 DFN@2 SPMe@2 SPMe@10 cheapMFUCB"]
    for P in POOLS:
        L.append(f"{P} " + " ".join(f"{t1[f'{P}|{m}']['fresh']:.1f}" for m in
                                    ["GP-EI DFN@100", "screen SPM@100", "screen DFN@2", "screen SPMe@2", "screen SPMe@10", CHEAP]))
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    summ["worst_ratio"] = w
    (HERE / "summary.json").write_text(json.dumps(summ, indent=1) + "\n")
    print("\n".join(L[-20:]))


if __name__ == "__main__":
    if sys.argv[1:2] == ["child"]:
        CR.child(*sys.argv[2:5])
    elif sys.argv[1:2] == ["bench"]:
        bench()
    elif sys.argv[1:2] == ["report"]:
        report()
    elif sys.argv[1:2] == ["extra"]:
        extra()
    else:
        print(__doc__)
