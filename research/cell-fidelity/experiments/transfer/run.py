"""Milestone 5b: do the trust flag and the short-SPMe screen transfer to other PyBaMM parameter sets?

    python experiments/transfer/run.py probe    # baseline design, each set x model, 2 and 100 cycles (feasibility, timings)
    python experiments/transfer/run.py bench    # 64 Sobol (seed 2) designs x SPM/SPMe/DFN x Ecker2015/Ai2020, 100 cycles (resumable)
    python experiments/transfer/run.py cost     # baseline n-cycle wall time per set, n in 2/10/30/100, median of 3 -> cost.json
    python experiments/transfer/run.py report   # results.txt, summary.json

The design space, the 5 % inactive rule, the stack-mass rule and the protocol are milestone 2's
(`energy-cell`'s `cell.py`, `../cycles/run.py`), with three per-set changes fixed in ../../LOG.md before the run:
the current is set so the areal current density equals the OKane2022 cell's (5 A over 0.1027 m2, 48.7 A/m2),
the voltage window is the set's own cut-offs, and degradation parameters a set lacks are copied from OKane2022
(listed in the output). Needs numpy, scipy and (for probe, bench, cost) pybamm.
"""
import importlib.util
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
EXP = HERE.parent
RESEARCH = HERE.parents[2]
sys.path.insert(0, str(RESEARCH / "energy-cell" / "src"))

SETS = ("Ecker2015", "Ai2020")
MODELS = ("SPM", "SPMe", "DFN")
NS = (2, 10, 30, 100)
SOBOL_SEED = 2
N_LOG2 = 6            # 64 designs per set (LOG.md)
WORKERS = int(os.environ.get("WORKERS", "2"))
C0 = 1000.0
OPTS = {"SEI": "solvent-diffusion limited", "lithium plating": "irreversible"}


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


CR = _mod("cycles_run", EXP / "cycles" / "run.py")


# ---------- pure helpers (stdlib; tested) ----------

def misclass(r, bad, thr):
    """Fraction of designs whose flag (r <= thr) disagrees with the label bad."""
    return sum(1 for a, b in zip(r, bad) if (a <= thr) != b) / len(r)


def best_threshold(r, bad, grid):
    """Threshold in grid with the lowest misclassification; ties go to the smallest threshold."""
    return min(grid, key=lambda t: (misclass(r, bad, t), t))


def auc(score, label):
    """ROC AUC of score for label (ties count one half)."""
    pos = [s for s, l in zip(score, label) if l]
    neg = [s for s, l in zip(score, label) if not l]
    if not pos or not neg:
        return float("nan")
    w = sum(1.0 if p > q else 0.5 if p == q else 0.0 for p in pos for q in neg)
    return w / (len(pos) * len(neg))


def untrusted(spme, dfn, gap=0.25):
    """Milestone 1's label: SPMe score 0, or more than gap below DFN's (relative)."""
    return [s <= 0 or (d > 0 and (d - s) / d > gap) for s, d in zip(spme, dfn)]


# ---------- simulation (pybamm) ----------

def area_parallel(pv):
    return pv["Electrode height [m]"] * pv["Electrode width [m]"] * pv["Number of electrodes connected in parallel to make a cell"]


def params(x, pset):
    """Milestone 2's design mapping applied to parameter set pset; returns (pv, copied keys, current A)."""
    import pybamm
    from energy_cell import cell
    t_um, e_p, e_n, r = cell.clip(x)
    ok = pybamm.ParameterValues("OKane2022")
    pv = pybamm.ParameterValues(pset)
    copied = sorted(k for k in ok.keys() if k not in pv.keys() and ("SEI" in k or "plat" in k or "strip" in k))
    pv.update({k: ok[k] for k in copied}, check_already_exists=False)
    t0p, t0n = pv["Positive electrode thickness [m]"], pv["Negative electrode thickness [m]"]
    pv["Positive electrode thickness [m]"] = t_um * 1e-6
    pv["Negative electrode thickness [m]"] = t_um * 1e-6 * (t0n / t0p) * r
    pv["Positive electrode porosity"] = e_p
    pv["Negative electrode porosity"] = e_n
    pv["Positive electrode active material volume fraction"] = 1 - e_p - cell.INACTIVE
    pv["Negative electrode active material volume fraction"] = 1 - e_n - cell.INACTIVE
    current = cell.I_DISCHARGE * area_parallel(pv) / area_parallel(ok)
    return pv, copied, current


def stack_mass(x, pv):
    from energy_cell import cell
    return cell.stack_mass_kg(x, pv) * pv["Number of electrodes connected in parallel to make a cell"]


def simulate(x, model_name, cycles, pset):
    import numpy as np
    import pybamm
    from energy_cell import cell
    pybamm.set_logging_level("ERROR")
    x = cell.clip(x)
    pv, copied, cur = params(x, pset)
    vlo, vhi = pv["Lower voltage cut-off [V]"], pv["Upper voltage cut-off [V]"]
    out = dict(ok=True, error=None, mass_kg=float(stack_mass(x, pv)), current_A=cur, copied=copied)
    model = getattr(pybamm.lithium_ion, model_name)(OPTS)
    exp = pybamm.Experiment([(f"Discharge at {cur:.6g} A until {vlo} V", f"Charge at {cur:.6g} A until {vhi} V")] * cycles)
    t0 = time.perf_counter()
    try:
        sol = pybamm.Simulation(model, parameter_values=pv, experiment=exp).solve(initial_soc=1.0)
        wh, rc = [], []
        for c in sol.cycles:
            d = c.steps[0]
            v, i, t = d["Terminal voltage [V]"].entries, d["Current [A]"].entries, d["Time [s]"].entries
            wh.append(float(np.trapezoid(v * i, t)) / 3600.0)
            rc.append(float(np.min(c["Electrolyte concentration [mol.m-3]"].entries)) / pv["Initial concentration in electrolyte [mol.m-3]"])
        out.update(cycle_wh=wh, r_cycle=rc, ok_cycles=len(sol.cycles), r_min=min(rc) if rc else 0.0)
    except Exception as ex:
        out.update(ok=False, error=f"{type(ex).__name__}: {str(ex)[:160]}", cycle_wh=[], r_cycle=[], ok_cycles=0, r_min=0.0)
    out["seconds"] = time.perf_counter() - t0
    return out


def _spawn(x, model_name, cycles, pset, timeout=2400):
    try:
        p = subprocess.run([sys.executable, __file__, "child", json.dumps(list(map(float, x))), model_name, str(cycles), pset],
                           capture_output=True, text=True, timeout=timeout)
        if p.stdout.strip():
            return json.loads(p.stdout.strip().splitlines()[-1])
        err = f"process exit {p.returncode}: {p.stderr[-160:]}"
    except subprocess.TimeoutExpired:
        err = f"timeout {timeout} s"
    return dict(ok=False, error=err, cycle_wh=[], r_cycle=[], ok_cycles=0, r_min=0.0, seconds=None)


def designs():
    import numpy as np
    from scipy.stats import qmc
    from energy_cell import cell
    u = qmc.Sobol(d=4, scramble=True, seed=SOBOL_SEED).random_base2(N_LOG2)
    return [list(map(float, r)) for r in np.asarray(cell.BOUNDS[:, 0] + u * (cell.BOUNDS[:, 1] - cell.BOUNDS[:, 0]))]


def probe():
    from energy_cell import cell
    x = list(map(float, cell.BASELINE))
    out = {}
    for s in SETS:
        for m in MODELS:
            for n in (2, 100):
                r = _spawn(x, m, n, s)
                k = f"{s}|{m}|{n}"
                out[k] = dict(ok=r["ok"], cycles=r["ok_cycles"], seconds=r["seconds"], error=r.get("error"),
                              wh_kg=CR.score_at(r, min(n, 100), r["mass_kg"]) if r.get("mass_kg") else None,
                              r_min=r.get("r_min"), current_A=r.get("current_A"), copied=r.get("copied"))
                print(k, out[k], flush=True)
    (HERE / "probe.json").write_text(json.dumps(out, indent=1) + "\n")


def bench():
    path = HERE / "bench.jsonl"
    done = set()
    if path.exists():
        done = {(r["set"], r["j"], r["model"]) for r in map(json.loads, path.read_text().splitlines())}
    xs = designs()
    jobs = [(s, j, m) for m in ("DFN", "SPMe", "SPM") for s in SETS for j in range(len(xs)) if (s, j, m) not in done]

    def go(job):
        s, j, m = job
        return dict(set=s, j=j, model=m, x=xs[j], **_spawn(xs[j], m, 100, s))

    with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as f:
        for r in ex.map(go, jobs):
            if "exit -9" in (r.get("error") or ""):   # killed by the session's memory limit, not a model failure
                print(r["set"], r["j"], r["model"], "killed (-9), not recorded", flush=True)
                continue
            r.pop("copied", None)
            f.write(json.dumps(r) + "\n")
            f.flush()
            print(r["set"], r["j"], r["model"], r["ok"], r["ok_cycles"], r["seconds"] and round(r["seconds"], 1), flush=True)


def cost():
    from energy_cell import cell
    x = list(map(float, cell.BASELINE))
    path = HERE / "cost.json"
    out = json.loads(path.read_text()) if path.exists() else {}
    for s in SETS:
        out.setdefault(s, {})
        for m in MODELS:
            out[s].setdefault(m, {})
            for n in NS:
                if str(n) in out[s][m]:
                    continue
                out[s][m][str(n)] = [_spawn(x, m, n, s)["seconds"] for _ in range(3)]
                print(s, m, n, out[s][m][str(n)], flush=True)
                path.write_text(json.dumps(out, indent=1) + "\n")


REPLAY = ["GP-EI DFN@100", "screen SPM@2", "screen SPM@100", "screen DFN@2", "screen SPMe@2", "screen SPMe@10",
          "screen SPMe@30", "screen SPMe@100", "coKrig MF-UCB DFN@2 cheap-start"]
POOL = 32
N_SEEDS = 30
TOL = 0.01
GRID = [k / 100 for k in range(51)]


def load_sets():
    out = {s: {} for s in SETS}
    for r in map(json.loads, (HERE / "bench.jsonl").read_text().splitlines()):
        out[r["set"]].setdefault(r["j"], {})[r["model"]] = r
    return out


def replay(D, MF):
    cf = lambda cell, i: D["cost"][cell]
    res = {m: [] for m in REPLAY}
    for s in range(N_SEEDS):
        pool = random.Random(s).sample(range(D["n"]), POOL)
        thr = (1 - TOL) * max(D["target"][i] for i in pool)
        for m in REPLAY:
            res[m].append(MF.S.t_hit(MF.run_method(m, pool, D, cf, thr, s).pts, thr))
    return res


def report():
    MF = _mod("mfbo_run", EXP / "mfbo" / "run.py")
    FR = _mod("fresh_run", EXP / "fresh" / "run.py")
    S = MF.S
    med = S.med
    med3 = lambda v: sorted(v)[1]
    cost_ok = {(m, int(n)): med3(v) for m, d in json.loads((EXP / "cycles" / "cost.json").read_text()).items() for n, v in d.items()}
    cj = json.loads((HERE / "cost.json").read_text())
    costs = {s: {(m, int(n)): med3(v) for m, d in cj[s].items() for n, v in d.items()} for s in SETS}
    ok_rows = [FR.load_rows(EXP / "cycles" / "bench.jsonl"), FR.load_rows(EXP / "fresh" / "bench.jsonl")]
    Dok = [FR.make_D(r, cost_ok) for r in ok_rows]
    r_ok = Dok[0]["rmin"] + Dok[1]["rmin"]
    bad_ok = untrusted(Dok[0]["sc"][("SPMe", 100)], Dok[0]["target"]) + untrusted(Dok[1]["sc"][("SPMe", 100)], Dok[1]["target"])
    tstar = best_threshold(r_ok, bad_ok, GRID)
    rows = load_sets()
    L = ["cell-fidelity milestone 5b: transfer to Ecker2015 and Ai2020 (64 Sobol seed-2 designs each)",
         f"OKane2022 (256 designs, milestones 2 and 5a): untrusted {sum(bad_ok)}; t* = {tstar:.2f}, misclassification "
         f"{misclass(r_ok, bad_ok, tstar):.3f}, AUC {auc([-v for v in r_ok], bad_ok):.3f}", ""]
    summ = dict(tstar=tstar, ok_untrusted=sum(bad_ok), sets={})
    R_ok = replay(Dok[1], MF)
    hyp = {}
    for s in SETS:
        rw = rows[s]
        assert len(rw) == 64 and all(len(v) == 3 for v in rw.values()), f"{s} bench incomplete"
        D = FR.make_D(rw, costs[s])
        t, sp10, sp100 = D["target"], D["sc"][("SPMe", 10)], D["sc"][("SPMe", 100)]
        bad = untrusted(sp100, t)
        r = D["rmin"]
        js = sorted(rw)
        r2 = [min(rw[j]["SPMe"]["r_cycle"][:2]) if rw[j]["SPMe"]["r_cycle"] else 0.0 for j in js]
        mc = misclass(r, bad, tstar)
        own = best_threshold(r, bad, GRID)
        a = auc([-v for v in r], bad)
        a2 = auc([-v for v in r2], bad)
        d, dlo, dhi = FR.spearman_diff_ci(sp10, sp100, t)
        R = replay(D, MF)
        rho = CR.spearman([med(R_ok[m]) for m in REPLAY], [med(R[m]) for m in REPLAY])
        fails = {m: sum(1 for j in js if rw[j][m]["ok_cycles"] < 100) for m in MODELS}
        L += [f"== {s} ==",
              f"fails before cycle 100: " + ", ".join(f"{m} {fails[m]}" for m in MODELS),
              f"DFN@100: best {max(t):.1f}, median {sorted(t)[32]:.1f} Wh/kg, zeros {sum(1 for v in t if v == 0)}",
              f"SPMe r_min: median {sorted(r)[32]:.3f}, 10th pct {sorted(r)[6]:.3f}, <= 0.1: {sum(1 for v in r if v <= 0.1)}",
              f"untrusted {sum(bad)} of 64",
              f"t* = {tstar:.2f}: misclassification {mc:.3f} (flagged {sum(1 for v in r if v <= tstar)}); own best threshold {own:.2f}"
              f" ({misclass(r, bad, own):.3f})",
              f"AUC of -r_min {a:.3f} (2-cycle r_min {a2:.3f})",
              "Spearman with DFN@100: " + ", ".join(f"{m}@{n} {CR.spearman(D['sc'][(m, n)], t):.3f}" for m in MODELS for n in NS),
              f"Spearman(SPMe@10) - Spearman(SPMe@100) = {d:.3f} (95% CI {dlo:.3f} to {dhi:.3f})",
              f"median T1 (s) on 30 pools of {POOL}, this set's costs (OKane2022 fresh in brackets); p vs GP-EI:"]
        for m in REPLAY:
            p = S.wilcoxon(R[m], R["GP-EI DFN@100"]) if m != "GP-EI DFN@100" else float("nan")
            L.append(f"  {m:<34} {med(R[m]):8.1f} ({med(R_ok[m]):7.1f})  p {p:.2g}")
        L += [f"Spearman of the 9 methods' median T1, OKane2022 vs {s}: {rho:.3f}",
              "baseline cost (s): " + ", ".join(f"{m}@{n} {costs[s][(m, n)]:.2f}" for m in MODELS for n in NS), ""]
        n_bad = sum(bad)
        hyp[s] = dict(
            H29="supported" if mc <= 0.20 else "refuted",
            H30=("inconclusive" if n_bad < 3 or 64 - n_bad < 3 else "supported" if a >= 0.90 else "refuted" if a < 0.80 else "not supported"),
            H31="supported" if dlo > 0 else ("refuted" if d <= 0 else "not supported (CI includes 0)"),
            H32="supported" if rho >= 0.7 else ("refuted" if rho < 0.5 else "inconclusive"))
        summ["sets"][s] = dict(fails=fails, untrusted=n_bad, misclass_tstar=mc, own_threshold=own, auc=a, auc_2cycle=a2,
                               spearman_diff=[d, dlo, dhi], rho_methods=rho,
                               cells={f"{m}@{n}": CR.spearman(D["sc"][(m, n)], t) for m in MODELS for n in NS},
                               t1={m: med(R[m]) for m in REPLAY}, raw=R, best_dfn=max(t))
    summ["okane_t1"] = {m: med(R_ok[m]) for m in REPLAY}

    def overall(h):
        v = [hyp[s][h] for s in SETS]
        return "refuted" if "refuted" in v else ("supported" if all(x == "supported" for x in v) else "inconclusive / not supported")
    L += ["F. Spearman of SPMe@n with DFN@100, by cycle count n (for the figure)", "n OKane2022 " + " ".join(SETS)]
    Ds = {s: FR.make_D(rows[s], costs[s]) for s in SETS}
    for n in NS:
        L.append(f"{n} {CR.spearman(Dok[1]['sc'][('SPMe', n)], Dok[1]['target']):.3f} " +
                 " ".join(f"{CR.spearman(Ds[s]['sc'][('SPMe', n)], Ds[s]['target']):.3f}" for s in SETS))
    L.append("")
    L.append("H. hypotheses (fixed in LOG.md before the run), per set and overall")
    for h in ("H29", "H30", "H31", "H32"):
        L.append(f"{h} {overall(h)}: " + ", ".join(f"{s} {hyp[s][h]}" for s in SETS))
    L += ["", "G. (extra, after the verdicts, no hypothesis) ratio of each method's median T1 to the fastest method's, pools of 32",
          f"{'method':<34} {'OKane2022':>9} " + " ".join(f"{x:>9}" for x in SETS) + f" {'worst':>6}"]
    allt = {"OKane2022": summ["okane_t1"], **{x: summ["sets"][x]["t1"] for x in SETS}}
    rat = {m: [allt[k][m] / min(allt[k].values()) for k in allt] for m in REPLAY}
    for m in sorted(REPLAY, key=lambda m: max(rat[m])):
        L.append(f"{m:<34} " + " ".join(f"{v:9.2f}" for v in rat[m]) + f" {max(rat[m]):6.2f}")
    summ["ratio_to_fastest"] = rat
    summ["hypotheses"] = {h: dict(overall=overall(h), **{s: hyp[s][h] for s in SETS}) for h in ("H29", "H30", "H31", "H32")}
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(summ, indent=1, default=lambda v: None) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    if sys.argv[1:2] == ["child"]:
        print(json.dumps(simulate(json.loads(sys.argv[2]), sys.argv[3], int(sys.argv[4]), sys.argv[5])))
    elif sys.argv[1:2] == ["bench"]:
        bench()
    elif sys.argv[1:2] == ["cost"]:
        cost()
    elif sys.argv[1:2] == ["report"]:
        report()
    elif sys.argv[1:2] == ["probe"]:
        probe()
    else:
        print(__doc__)
