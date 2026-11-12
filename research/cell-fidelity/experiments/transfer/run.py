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


if __name__ == "__main__":
    if sys.argv[1:2] == ["child"]:
        print(json.dumps(simulate(json.loads(sys.argv[2]), sys.argv[3], int(sys.argv[4]), sys.argv[5])))
    elif sys.argv[1:2] == ["bench"]:
        bench()
    elif sys.argv[1:2] == ["cost"]:
        cost()
    elif sys.argv[1:2] == ["probe"]:
        probe()
    else:
        print(__doc__)
