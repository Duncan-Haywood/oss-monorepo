"""Milestone 5u: on fresh pools whose truth and lithium curves no milestone has seen, does 5t's balance map, with the
lithium-loss law chosen per pool from the ten-cycle curve itself, rank the 100-cycle DFN energy and carry the union screen?

    python experiments/freshlaw/run.py tables   # balance tables and stack mass of the fresh designs (pybamm, no simulation)
    WORKERS=3 python experiments/freshlaw/run.py bench   # DFN (SEI + plating) to cycle 100 with the lithium curve (resumable)
    python experiments/freshlaw/run.py report   # H117 to H121 (stdlib) -> results.txt, summary.json

5t's sqrt(n) law ranked better than 5s's power law on 12 of 13 committed pools but was chosen on 27 designs of the same
family, scored against truth earlier milestones had read, and over-predicted NCA_Kim2011's decelerating loss. Here the
law is picked per pool before any fit is scored: the median over the pool's designs of the power-law exponent b of the
lithium lost by the end of cycles 2 to 10 (5s's fit); b_med >= 0.6 takes L(n) = a + b sqrt(n) (5t), b_med < 0.6 the
power law a n^b (5s). On 5s's 17 pools b_med was 0.84 to 0.96 on every graphite pool and 0.23 to 0.30 on NCA_Kim2011,
so 0.6 sits in the gap; nothing was tuned on fade. Designs: 64 scrambled Sobol (seed 14, unused by any milestone), the
energy-cell bounds. The screen reads cycles 1 to 10 of the same 100-cycle run (5s checked that a separate ten-cycle run
reproduces them exactly). Plan in ../../LOG.md (5u plan), written before any run.
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

SOBOL_SEED = 14
N_LOG2 = 6
WORKERS = int(os.environ.get("WORKERS", "2"))   # three 100-cycle runs exceeded 15 GB
B_SPLIT = 0.6          # pool-median ten-cycle exponent at or above which the sqrt law is used
# fixed before any run: three Ai2020 currents (0.4x is new; 0.3x and 0.5x are seen currents with unseen designs), the
# fade-limited cell the next-step note names, and NCA_Kim2011 at a current no milestone ran, where the selector must switch
CONDITIONS = ("Ai2020@0.3x", "Ai2020@0.4x", "Ai2020@0.5x", "NCA_Kim2011@0.625x")


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


L5 = _mod("losslaw_run", EXP / "losslaw" / "run.py")
S, B = L5.S, L5.B
K, TO, M = S.K, S.TO, S.M
spearman, ocv_energy, sign_p = B.spearman, B.ocv_energy, L5.sign_p


# ---------- pure helpers (stdlib; tested) ----------

def pool_exponent(curves):
    """Median over designs of the power-law exponent of the lithium lost by the end of cycles 2 to 10 (designs with no
    fit are skipped); None when no design fits."""
    bs = [ab[1] for ab in (S.power_fit(c[:K]) for c in curves) if ab]
    return statistics.median(bs) if bs else None


def choose_law(b_med, split=B_SPLIT):
    return "sqrt" if b_med is not None and b_med >= split else "power"


def law_l(lost, law, n):
    """The chosen law fitted to lost[:K] (cycles 2 to 10), read at cycle n; None when it cannot be fitted."""
    if law == "sqrt":
        ab = L5.sqrt_law_fit(lost[:K])
        return L5.sqrt_law_at(ab, n) if ab else None
    ab = S.power_fit(lost[:K])
    return S.power_at(ab, n) if ab else None


def map_predict(bal, lost, wh10, law, k=K, to=TO):
    """5s's map with the chosen law: wh10 x E_ocv(n_Li - L(to-1)) / E_ocv(n_Li - lost by end of cycle k-1), L floored at
    the cycle-(k-1) loss; no fade when no law can be fitted."""
    l = law_l(lost, law, to - 1)
    if l is None:
        return wh10
    l_k = lost[k - 2]
    e_k, _ = ocv_energy(bal["n_li"] - l_k, bal)
    e_to, _ = ocv_energy(bal["n_li"] - max(l, l_k), bal)
    return wh10 * e_to / e_k if e_k > 0 else 0.0


def map_true(bal, lost, k=K, to=TO):
    """The same map fed the run's own lithium loss at cycle to-1 (5s's decomposition check)."""
    e_k, _ = ocv_energy(bal["n_li"] - lost[k - 2], bal)
    e_to, _ = ocv_energy(bal["n_li"] - lost[to - 2], bal)
    return e_to / e_k if e_k > 0 else 0.0


def gap_of(rows, picked):
    best = max(r["score"] for r in rows)
    return 1 - max(rows[i]["score"] for i in picked) / best


def top(rows, key, m=M):
    return set(sorted(range(len(rows)), key=lambda i: -rows[i][key])[:m])


# ---------- pybamm: designs, tables, bench ----------

def designs():
    import numpy as np
    from scipy.stats import qmc
    fc = B._fc()   # loads the chain that puts energy_cell on sys.path
    from energy_cell import cell
    u = qmc.Sobol(d=4, scramble=True, seed=SOBOL_SEED).random_base2(N_LOG2)
    return fc, cell, [list(map(float, r)) for r in np.asarray(cell.BOUNDS[:, 0] + u * (cell.BOUNDS[:, 1] - cell.BOUNDS[:, 0]))]


def tables():
    import numpy as np
    import pybamm
    pybamm.set_logging_level("ERROR")
    fc, cell, xs = designs()
    cache, rows = {}, []
    for c in CONDITIONS:
        for j, x in enumerate(xs):
            b = B.balance(c, x, pybamm, np, fc, cell, cache)
            xc = cell.clip(x)
            pv, _, _ = fc.G.TR.params(xc, fc.G._parse(c)[0])
            rows.append(dict(cond=c, j=j, x=x) | b | dict(mass_kg=float(fc.G.TR.stack_mass(xc, pv))))
    with (HERE / "balance.jsonl").open("w") as fh:
        for r in rows:
            fh.write(json.dumps(r) + "\n")
    (HERE / "ocp.json").write_text(json.dumps(dict(grid=B.GRID, sets={s: dict(Un=u[0], Up=u[1]) for s, u in cache.items()})))
    print(f"{len(rows)} designs, {len(cache)} sets")


def _child100(job):
    B.CYCLES = TO
    return B.simulate(job)


def bench():
    import subprocess
    path = HERE / "bench.jsonl"
    # a run the kernel killed for memory (exit -9) is retried; the report keeps the last record per design
    done = {(r["cond"], r["j"]) for r in B._load(path) if not str(r.get("error") or "").startswith("exit -9")} if path.exists() else set()
    rows = B._load(HERE / "balance.jsonl")
    only = os.environ.get("ONLY")
    todo = [(r["cond"], r["j"], "both", r["x"]) for r in rows if (r["cond"], r["j"]) not in done and (not only or r["cond"] == only)]
    print(f"{len(todo)} runs to go", flush=True)

    def one(job):
        c, j, v, x = job
        try:
            p = subprocess.run([sys.executable, __file__, "child100", json.dumps([c, j, v, x])], capture_output=True, text=True,
                               timeout=1800)
            if p.returncode == 0 and p.stdout.strip():
                return json.loads(p.stdout.strip().splitlines()[-1])
            err = f"exit {p.returncode}: {p.stderr.strip()[-160:]}"
        except subprocess.TimeoutExpired:
            err = "timeout 1800s"
        return dict(cond=c, j=j, variant=v, x=x, ok=False, error=err, seconds=None)
    with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as fh:
        for r in ex.map(one, todo):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            print(r["cond"], r["j"], "ok" if r["ok"] else r["error"], r.get("seconds"), flush=True)


# ---------- report (stdlib) ----------

def score(c, runs, bal, ocp):
    """Rows for designs whose run reached cycle 100; the screen sees cycles 1 to 10 only."""
    good = [(j, f) for (cc, j), f in sorted(runs.items()) if cc == c and f["ok"] and len(f.get("cycle_wh", [])) >= TO
            and f["cycle_wh"][0] > 0]
    b_med = pool_exponent([f["lost_mol"] for _, f in good])
    law = choose_law(b_med)
    out = []
    for j, f in good:
        bl = bal[(c, j)]
        b = dict(bl) | dict(g=ocp["grid"]) | ocp["sets"][bl["pset"]]
        m, wh, lost = bl["mass_kg"], f["cycle_wh"], f["lost_mol"]
        wh10 = wh[K - 1]
        pred = map_predict(b, lost, wh10, law)
        alt = map_predict(b, lost, wh10, "power" if law == "sqrt" else "sqrt")
        l_law = law_l(lost, law, TO - 1)
        sq = S.sqrt_extrapolate([w / m for w in wh])
        out.append(dict(j=j, score=wh[TO - 1] / m, raw10=wh10 / m, sqrt=sq, law=pred / m, alt=alt / m,
                        true_map=wh10 * map_true(b, lost) / m,
                        fade_dfn=1 - wh[TO - 1] / wh10, fade_law=1 - pred / wh10, fade_sqrt=1 - sq * m / wh10,
                        fade_true_map=1 - map_true(b, lost),
                        l_ratio=(l_law / lost[TO - 2]) if l_law and lost[TO - 2] > 0 else None,
                        e2_eocv=wh[1] / ocv_energy(b["n_li"] - lost[0], b)[0] if ocv_energy(b["n_li"] - lost[0], b)[0] else None,
                        t100=f["seconds"]))
    return out, b_med, law, sum(cc == c for cc, _ in runs) - len(good)


def condition(rows, b_med, law, dropped):
    sc = [r["score"] for r in rows]
    ib = max(range(len(rows)), key=lambda i: sc[i])
    rank = lambda key: sorted(range(len(rows)), key=lambda i: -rows[i][key]).index(ib) + 1
    raw, sq, lw = top(rows, "raw10"), top(rows, "sqrt"), top(rows, "law")
    med = lambda k: statistics.median(abs(r[k] - r["fade_dfn"]) for r in rows)
    lr = [r["l_ratio"] for r in rows if r["l_ratio"]]
    return dict(n=len(rows), dropped=dropped, b_med=b_med, law=law,
                rho_raw=spearman([r["raw10"] for r in rows], sc), rho_sqrt=spearman([r["sqrt"] for r in rows], sc),
                rho_law=spearman([r["law"] for r in rows], sc), rho_alt=spearman([r["alt"] for r in rows], sc),
                rho_true_map=spearman([r["true_map"] for r in rows], sc),
                mae_fade_sqrt=med("fade_sqrt"), mae_fade_law=med("fade_law"), mae_fade_true_map=med("fade_true_map"),
                gap_5n=gap_of(rows, raw | sq), n_5n=len(raw | sq), gap_law=gap_of(rows, raw | lw), n_law=len(raw | lw),
                gap_tri=gap_of(rows, raw | sq | lw), n_tri=len(raw | sq | lw), gap_raw8=gap_of(rows, top(rows, "raw10", 8)),
                best_rank_raw=rank("raw10"), best_rank_sqrt=rank("sqrt"), best_rank_law=rank("law"),
                l_ratio_median=statistics.median(lr) if lr else None,
                fade_dfn_median=statistics.median(r["fade_dfn"] for r in rows),
                fade_law_median=statistics.median(r["fade_law"] for r in rows),
                t100_median=statistics.median(r["t100"] for r in rows))


def verdicts(C):
    T = list(C.values())
    ai = [C[c] for c in C if c.startswith("Ai2020")]
    n = len(T)
    w117 = sum(c["rho_law"] > c["rho_sqrt"] for c in T)
    g = [c["gap_law"] for c in T]
    d = [c["gap_law"] - c["gap_5n"] for c in T]
    w120 = sum(c["mae_fade_law"] < c["mae_fade_sqrt"] for c in T)
    lr = [c["l_ratio_median"] for c in ai]
    sel = all(C[c]["law"] == ("power" if c.startswith("NCA") else "sqrt") for c in C)
    return dict(n=n,
                H117=S.verdict(w117 >= n - 1, w117 <= n // 2), H117_wins=w117, p117=sign_p(w117, n),
                H118=S.verdict(all(x <= 0.01 for x in g), any(x > 0.03 for x in g)), H118_worst=max(g),
                H119=S.verdict(all(x <= 0.0 for x in d), any(x > 0.01 for x in d)), H119_worst=max(d),
                H120=S.verdict(w120 >= n - 1, w120 <= n // 2), H120_wins=w120,
                H121=S.verdict(sel and all(0.8 <= x <= 1.25 for x in lr), (not sel) or any(x < 2 / 3 or x > 1.5 for x in lr)),
                H121_selector=sel, H121_ratios=lr)


def report():
    runs = {(r["cond"], r["j"]): r for r in B._load(HERE / "bench.jsonl")}
    bal = {(r["cond"], r["j"]): r for r in B._load(HERE / "balance.jsonl")}
    ocp = json.loads((HERE / "ocp.json").read_text())
    C, R = {}, {}
    for c in CONDITIONS:
        rows, b_med, law, dropped = score(c, runs, bal, ocp)
        R[c] = rows
        if len(rows) >= 8:
            C[c] = condition(rows, b_med, law, dropped)
    V = verdicts(C)
    L = [f"cell-fidelity milestone 5u: the balance map with a per-pool lithium law (median ten-cycle exponent >= {B_SPLIT} -> a + b sqrt(n), else a n^b)",
         f"on fresh pools: 64 Sobol designs (seed {SOBOL_SEED}) x {len(CONDITIONS)} conditions, DFN (SEI + plating) to cycle 100, screen reads cycles 1 to 10", "",
         f"{'condition':20s}{'n':>4s}{'drop':>5s}{'b_med':>6s}{'law':>6s}{'rho raw':>8s}{'sqrtE':>7s}{'law':>7s}{'alt':>7s}{'trueL':>7s}"
         f"{'|fade| sqrtE':>13s}{'law':>6s}{'trueL':>6s}{'gap 5n':>8s}{'law':>7s}{'tri':>7s}{'raw8':>7s}{'rank raw/sqrtE/law':>19s}{'Llaw/L':>7s}{'fade':>6s}"]
    for c, d in C.items():
        L.append(f"{c:20s}{d['n']:4d}{d['dropped']:5d}{d['b_med']:6.2f}{d['law']:>6s}{d['rho_raw']:8.3f}{d['rho_sqrt']:7.3f}{d['rho_law']:7.3f}"
                 f"{d['rho_alt']:7.3f}{d['rho_true_map']:7.3f}{d['mae_fade_sqrt']:13.3f}{d['mae_fade_law']:6.3f}{d['mae_fade_true_map']:6.3f}"
                 f"{d['gap_5n']:8.4f}{d['gap_law']:7.4f}{d['gap_tri']:7.4f}{d['gap_raw8']:7.4f}"
                 f"{d['best_rank_raw']:>9d}/{d['best_rank_sqrt']}/{d['best_rank_law']:<5d}"
                 f"{(d['l_ratio_median'] or float('nan')):7.2f}{d['fade_dfn_median']:6.3f}")
    n = V["n"]
    L += ["", f"H117 (chosen-law map ranks DFN@100 better than 5n's sqrt energy fit on >= {n - 1} of {n}): {V['H117']} ({V['H117_wins']} of {n}; sign test p = {V['p117']:.2f})",
          f"H118 (union raw top 4 + map top 4 within 1% of the pool's DFN best on every pool): {V['H118']} (worst {V['H118_worst']:.4f})",
          f"H119 (that union no worse than 5n's union on every pool): {V['H119']} (worst excess {V['H119_worst']:+.4f})",
          f"H120 (map's median |fade error| below the sqrt fit's on >= {n - 1} of {n}): {V['H120']} ({V['H120_wins']} of {n})",
          f"H121 (selector picks power on NCA_Kim2011, sqrt on Ai2020, and the Ai2020 median L_law(99)/L_DFN(99) is within 0.8 to 1.25): {V['H121']}"
          f" (selector {'as predicted' if V['H121_selector'] else 'NOT as predicted'}; ratios {', '.join(f'{x:.2f}' for x in V['H121_ratios'])})", "",
          "Descriptive: 'alt' is the map with the law the selector did not pick; 'trueL' the map fed DFN's own cycle-99 loss; "
          "'raw8' the top 8 by raw cycle-10 Wh/kg (a cost-matched list with no fade model); 'tri' raw + sqrtE + law, 4 each.",
          f"resumed designs, mean: 5n {statistics.mean(d['n_5n'] for d in C.values()):.1f}, law {statistics.mean(d['n_law'] for d in C.values()):.1f}, "
          f"tri {statistics.mean(d['n_tri'] for d in C.values()):.1f}", "",
          "Post hoc (after the verdicts): spread of the per-design L_law(99) / L_DFN(99), 10th / 50th / 90th percentile"]
    for c in C:
        lr = sorted(r["l_ratio"] for r in R[c] if r["l_ratio"])
        q = lambda p: lr[int(p * (len(lr) - 1))]
        L.append(f"  {c:20s}{q(0.1):6.2f}{q(0.5):6.2f}{q(0.9):6.2f}; median E2 / E_ocv {statistics.median(r['e2_eocv'] for r in R[c]):.2f}")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(conditions=C, verdicts=V, rows=R), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "report"
    if cmd == "child100":
        print(json.dumps(_child100(json.loads(sys.argv[2]))))
    else:
        {"tables": tables, "bench": bench, "report": report}[cmd]()
