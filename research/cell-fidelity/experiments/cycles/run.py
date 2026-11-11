"""Milestone 2: is the cycle count a better fidelity axis than the model?

    python experiments/cycles/run.py prefix   # baseline: 10-cycle run vs the first 10 cycles of a 100-cycle run -> prefix.json
    python experiments/cycles/run.py bench    # 128 Sobol designs x SPM/SPMe/DFN, 100 cycles each -> bench.jsonl (resumable)
    python experiments/cycles/run.py cost     # baseline n-cycle wall time, n in 2/10/30/100, median of 3 -> cost.json
    python experiments/cycles/run.py report   # results.txt and summary.json

One 100-cycle run per (design, model) stores every cycle's discharge energy, so the score at cycle n
(Wh/kg of cycle n's discharge, energy_cell.cell.evaluate's rule) is read from the same run for every n.
Hypotheses were fixed in ../../LOG.md before the first run. Needs numpy, scipy, pybamm.
"""
import json
import math
import os
import random
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
RESEARCH = HERE.parents[2]
sys.path.insert(0, str(RESEARCH / "energy-cell" / "src"))

MODELS = ("SPM", "SPMe", "DFN")
NS = (2, 10, 30, 100)
N_SOBOL_LOG2 = 7       # 128 designs (LOG.md)
SOBOL_SEED = 0
TOP_K = 10
WORKERS = int(os.environ.get("WORKERS", "3"))
C0 = 1000.0


# ---------- pure analysis (stdlib only; tested) ----------

def ranks(a):
    order = sorted(range(len(a)), key=lambda i: a[i])
    r = [0.0] * len(a)
    i = 0
    while i < len(a):
        j = i
        while j + 1 < len(a) and a[order[j + 1]] == a[order[i]]:
            j += 1
        for k in range(i, j + 1):
            r[order[k]] = (i + j) / 2.0
        i = j + 1
    return r


def spearman(a, b):
    ra, rb = ranks(a), ranks(b)
    ma, mb = sum(ra) / len(ra), sum(rb) / len(rb)
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    den = math.sqrt(sum((x - ma) ** 2 for x in ra) * sum((y - mb) ** 2 for y in rb))
    return num / den if den else float("nan")


def score_at(run, n, mass):
    """Wh/kg of cycle n's discharge (1-based), 0 if the run did not complete n cycles or cycle 2 gave no energy."""
    e = run.get("cycle_wh") or []
    if not run.get("ok_cycles") or run["ok_cycles"] < n or len(e) < n or len(e) < 2 or e[1] <= 0:
        return 0.0
    return e[n - 1] / mass


def top_overlap(a, b, k):
    ia = set(sorted(range(len(a)), key=lambda i: -a[i])[:k])
    ib = set(sorted(range(len(b)), key=lambda i: -b[i])[:k])
    return len(ia & ib)


def screen_verify(screen, target, k):
    """Verify the top-k by screen with the target; return the best target value among them."""
    top = sorted(range(len(screen)), key=lambda i: -screen[i])[:k]
    return max(target[i] for i in top)


def bootstrap(stat, n_items, n=2000, seed=0):
    rng = random.Random(seed)
    out = []
    for _ in range(n):
        idx = [rng.randrange(n_items) for _ in range(n_items)]
        v = stat(idx)
        if not math.isnan(v):
            out.append(v)
    out.sort()
    return out[int(0.025 * len(out))], out[int(0.975 * len(out)) - 1]


# ---------- designs ----------

def designs():
    import numpy as np
    from scipy.stats import qmc
    from energy_cell import cell
    u = qmc.Sobol(d=4, scramble=True, seed=SOBOL_SEED).random_base2(N_SOBOL_LOG2)
    x = cell.BOUNDS[:, 0] + u * (cell.BOUNDS[:, 1] - cell.BOUNDS[:, 0])
    return [list(map(float, r)) for r in np.asarray(x)]


# ---------- simulation (pybamm) ----------

def simulate(x, model_name, cycles):
    import numpy as np
    import pybamm
    from energy_cell import cell
    pybamm.set_logging_level("ERROR")
    x = cell.clip(x)
    pv = cell._params(x)
    out = dict(ok=True, error=None, mass_kg=float(cell.stack_mass_kg(x, pv)))
    opts = {"SEI": "solvent-diffusion limited", "lithium plating": "irreversible"}
    model = getattr(pybamm.lithium_ion, model_name)(opts)
    exp = pybamm.Experiment([(f"Discharge at {cell.I_DISCHARGE} A until 2.5 V",
                              f"Charge at {cell.I_CHARGE} A until 4.2 V")] * cycles)
    t0 = time.perf_counter()
    try:
        sol = pybamm.Simulation(model, parameter_values=pv, experiment=exp).solve(initial_soc=1.0)
        wh = []
        for c in sol.cycles:
            d = c.steps[0]
            v, i, t = d["Terminal voltage [V]"].entries, d["Current [A]"].entries, d["Time [s]"].entries
            wh.append(float(np.trapezoid(v * i, t)) / 3600.0)
        out["cycle_wh"] = wh
        # a cycle counts as done only if its charge step ran too (evaluate() counts len(sol.cycles))
        out["ok_cycles"] = len(sol.cycles)
        out["r_min"] = float(np.min(sol["Electrolyte concentration [mol.m-3]"].entries)) / C0
    except Exception as ex:
        out.update(ok=False, error=f"{type(ex).__name__}: {str(ex)[:160]}", cycle_wh=[], ok_cycles=0, r_min=0.0)
    out["seconds"] = time.perf_counter() - t0
    return out


def child(x_json, model_name, cycles):
    print(json.dumps(simulate(json.loads(x_json), model_name, int(cycles))))


def _spawn(x, model_name, cycles, timeout=1800):
    try:
        p = subprocess.run([sys.executable, __file__, "child", json.dumps(x), model_name, str(cycles)],
                           capture_output=True, text=True, timeout=timeout)
        if p.stdout.strip():
            return json.loads(p.stdout.strip().splitlines()[-1])
        err = f"process exit {p.returncode}: {p.stderr[-160:]}"
    except subprocess.TimeoutExpired:
        err = f"timeout {timeout} s"
    return dict(ok=False, error=err, cycle_wh=[], ok_cycles=0, r_min=0.0, seconds=None)


def prefix():
    from energy_cell import cell
    x = list(map(float, cell.BASELINE))
    out = {}
    for m in MODELS:
        a, b = _spawn(x, m, 10), _spawn(x, m, 100)
        d = max(abs(p - q) / abs(q) for p, q in zip(a["cycle_wh"], b["cycle_wh"][:10]))
        out[m] = dict(max_rel_diff_first10=d, score100=score_at(b, 100, b["mass_kg"]),
                      cycles10=a["ok_cycles"], cycles100=b["ok_cycles"])
        print(m, out[m], flush=True)
    (HERE / "prefix.json").write_text(json.dumps(out, indent=1) + "\n")


def bench():
    path = HERE / "bench.jsonl"
    done = set()
    if path.exists():
        done = {(r["j"], r["model"]) for r in map(json.loads, path.read_text().splitlines())}
    xs = designs()
    jobs = [(j, m) for m in ("DFN", "SPMe", "SPM") for j in range(len(xs)) if (j, m) not in done]

    def go(job):
        j, m = job
        r = _spawn(xs[j], m, 100)
        return dict(j=j, model=m, x=xs[j], **r)

    with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as f:
        for r in ex.map(go, jobs):
            f.write(json.dumps(r) + "\n")
            f.flush()
            print(r["j"], r["model"], r["ok"], r["ok_cycles"], r["seconds"] and round(r["seconds"], 1), flush=True)


def cost():
    from energy_cell import cell
    x = list(map(float, cell.BASELINE))
    out = {}
    for m in MODELS:
        out[m] = {}
        for n in NS:
            ts = [_spawn(x, m, n)["seconds"] for _ in range(3)]
            out[m][str(n)] = ts
            print(m, n, ts, flush=True)
    (HERE / "cost.json").write_text(json.dumps(out, indent=1) + "\n")


def load():
    runs = {}
    for r in map(json.loads, (HERE / "bench.jsonl").read_text().splitlines()):
        runs[(r["j"], r["model"])] = r
    js = sorted({j for j, _ in runs})
    sc = {}
    for m in MODELS:
        for n in NS:
            sc[(m, n)] = [score_at(runs[(j, m)], n, runs[(j, m)]["mass_kg"]) if (j, m) in runs and runs[(j, m)].get("mass_kg")
                          else 0.0 for j in js]
    return js, runs, sc


def report():
    js, runs, sc = load()
    N = len(js)
    target = sc[("DFN", 100)]
    best = max(target)
    cpath = HERE / "cost.json"
    cost_med = {}
    if cpath.exists():
        c = json.loads(cpath.read_text())
        cost_med = {(m, int(n)): sorted(v)[1] for m, d in c.items() for n, v in d.items()}
    L = ["cell-fidelity milestone 2: the cycle count as a fidelity axis",
         f"designs: {N} (scrambled Sobol, seed {SOBOL_SEED}, energy-cell bounds); target DFN@100 (Wh/kg at cycle 100)",
         "fails (run stopped before cycle 100 or solver error), per model: " +
         ", ".join(f"{m} {sum(1 for j in js if runs[(j, m)]['ok_cycles'] < 100)}" for m in MODELS),
         f"DFN@100: best {best:.1f}, median {sorted(target)[N // 2]:.1f}, zeros {sum(1 for v in target if v == 0)}", ""]
    pj = HERE / "prefix.json"
    if pj.exists():
        p = json.loads(pj.read_text())
        L.append("prefix check (baseline, 10-cycle run vs first 10 cycles of the 100-cycle run), max relative difference: " +
                 ", ".join(f"{m} {v['max_rel_diff_first10']:.1e}" for m, v in p.items()))
        L.append("baseline 100-cycle score: " + ", ".join(f"{m} {v['score100']:.2f}" for m, v in p.items()) +
                 " (energy-cell-dfn: SPMe 109.14, DFN 116.26)")
        L.append("")
    L.append("A. each (model, cycles) cell as a screen for DFN@100")
    L.append(f"{'cell':<10} {'Spearman':>8} {'95% CI':>15} {'top10 overlap':>13} {'best of top10':>13} {'regret %':>8} {'cost s':>7}")
    summary = dict(n=N, best=best, cells={})
    for m in MODELS:
        for n in NS:
            s = sc[(m, n)]
            rho = spearman(s, target)
            lo, hi = bootstrap(lambda idx: spearman([s[i] for i in idx], [target[i] for i in idx]), N)
            ov = top_overlap(s, target, TOP_K)
            b = screen_verify(s, target, TOP_K)
            reg = 100 * (best - b) / best
            cm = cost_med.get((m, n))
            L.append(f"{m + '@' + str(n):<10} {rho:8.3f} {lo:7.3f}-{hi:<7.3f} {ov:>13} {b:13.1f} {reg:8.2f} {cm if cm is None else round(cm, 1):>7}")
            summary["cells"][f"{m}@{n}"] = dict(spearman=rho, ci=[lo, hi], overlap=ov, best_topk=b, regret_pct=reg, cost_s=cm)
    d10, s100 = sc[("DFN", 10)], sc[("SPMe", 100)]
    diff = spearman(d10, target) - spearman(s100, target)
    dlo, dhi = bootstrap(lambda idx: spearman([d10[i] for i in idx], [target[i] for i in idx]) -
                         spearman([s100[i] for i in idx], [target[i] for i in idx]), N)
    L += ["", "B. hypotheses",
          f"H1 Spearman(DFN@10) - Spearman(SPMe@100) = {diff:+.3f} (paired bootstrap 95% {dlo:+.3f} to {dhi:+.3f}); "
          f"supported if >= 0, refuted if < -0.05"]
    summary["h1"] = dict(diff=diff, ci=[dlo, dhi])
    if cost_med:
        r2 = cost_med[("DFN", 10)] / cost_med[("SPMe", 100)]
        L.append(f"H2 cost DFN@10 / SPMe@100 on the baseline = {cost_med[('DFN', 10)]:.1f} / {cost_med[('SPMe', 100)]:.1f} s = {r2:.2f}; "
                 f"supported if <= 1, refuted if > 1.5")
        summary["h2"] = r2
    reg = summary["cells"]["DFN@10"]["regret_pct"]
    L.append(f"H3 regret of DFN@10 screen + top-{TOP_K} DFN@100 verify: {reg:.2f}% (SPMe@100 screen: "
             f"{summary['cells']['SPMe@100']['regret_pct']:.2f}%); supported if <= 1%, refuted if > 2%")
    summary["h3"] = reg
    # extra (not in the plan): regret against k for the main screens
    L += ["", "C. (extra, not in the plan) regret % of top-k verify, by k"]
    ks = (1, 3, 5, 10, 20)
    L.append(f"{'cell':<10} " + " ".join(f"{'k=' + str(k):>6}" for k in ks))
    for cell_ in (("SPM", 100), ("SPMe", 100), ("DFN", 2), ("DFN", 10), ("DFN", 30), ("SPMe", 10)):
        s = sc[cell_]
        L.append(f"{cell_[0] + '@' + str(cell_[1]):<10} " +
                 " ".join(f"{100 * (best - screen_verify(s, target, k)) / best:6.2f}" for k in ks))
    # extra (not in the plan): is SPMe's low rank agreement only its solver failures? and milestone 1's flag out of sample
    ok = [k for k, j in enumerate(js) if runs[(j, "SPMe")]["ok_cycles"] >= 100]
    L += ["", f"D. (extra, not in the plan) over the {len(ok)} designs SPMe ran for 100 cycles, Spearman with DFN@100: " +
          ", ".join(f"{m}@{n} {spearman([sc[(m, n)][k] for k in ok], [target[k] for k in ok]):.3f}"
                    for m, n in (("SPM", 100), ("SPMe", 100), ("SPMe", 2), ("DFN", 10)))]
    s100 = sc[("SPMe", 100)]
    gap = [(target[k] - s100[k]) / target[k] for k in range(N)]
    unt = [s100[k] <= 0 or gap[k] > 0.25 for k in range(N)]
    rmin = [runs[(j, "SPMe")]["r_min"] for j in js]
    pos = [-rmin[k] for k in range(N) if unt[k]]
    neg = [-rmin[k] for k in range(N) if not unt[k]]
    a = sum((p > q) + 0.5 * (p == q) for p in pos for q in neg) / (len(pos) * len(neg))
    L.append(f"   untrusted by milestone 1's label (SPMe 0 or gap > 0.25): {len(pos)} of {N}; ROC AUC of -r_min "
             f"(min over the whole 100-cycle SPMe run, not milestone 1's 2-cycle run): {a:.3f}")
    for thr in (0.0, 0.1):
        fl = [k for k in range(N) if rmin[k] <= thr]
        L.append(f"   flag r_min <= {thr:.1f}: {len(fl)} flagged, {sum(unt[k] for k in fl)} of {len(pos)} caught")
    kb = max(range(N), key=lambda k: target[k])
    L.append(f"   DFN@100 best (design {js[kb]}, x = {[round(v, 3) for v in runs[(js[kb], 'DFN')]['x']]}): "
             f"DFN {target[kb]:.1f}, SPMe {s100[kb]:.1f} (gap {gap[kb]:.2f}), SPM {sc[('SPM', 100)][kb]:.1f}, "
             f"SPMe rank {1 + sorted(range(N), key=lambda k: -s100[k]).index(kb)} of {N}")
    med = lambda v: sorted(v)[len(v) // 2]
    L.append(f"   median score minus DFN@100 (Wh/kg): SPM@100 {med([sc[('SPM', 100)][k] - target[k] for k in range(N)]):+.1f}, "
             f"SPMe@100 over its {len(ok)} {med([s100[k] - target[k] for k in ok]):+.1f}")
    summary["extra"] = dict(n_spme_ok=len(ok), n_untrusted=len(pos), auc_rmin100=a)
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(summary, indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "child":
        child(*sys.argv[2:5])
    else:
        {"prefix": prefix, "bench": bench, "cost": cost, "report": report}[cmd]()
