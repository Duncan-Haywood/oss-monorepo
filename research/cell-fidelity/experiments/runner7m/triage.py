"""The cell-fidelity triage runner (milestone 7m): one DFN design, one long-lived PyBaMM `Simulation`.

    python experiments/runner7m/triage.py --cond Chen2020@1.5x --x '[...]'            # policy.json, "replay7h"
    python experiments/runner7m/triage.py --cond Chen2020@1.5x --x '[...]' --policy deploy

What it does, per design (the rule the paper reports, run as one process with nothing written to disk):
  1. build the DFN model (SEI + plating, the programme's model) with a 10-cycle experiment and solve it once;
  2. read the cycle-2 and cycle-10 node plating from that solution and compute the drift observables
     O1 (plating-weighted depth at cycle 2, 1 = separator), O2 (its change to cycle 10) and O3 (the bend of lithium
     loss over cycles 2, 6, 10);
  3. score the design: S = |c0 + c1 * O - 1|, with the observable and line (c0, c1) frozen per parameter set in
     policy.json (7c's drift correction, fitted on the set's 104 earlier designs);
  4. if S >= theta (the frozen absolute threshold), keep solving the same `Simulation` in place from its own last
     solution, ten cycles at a time, to cycle 50 (milestone 7l: this costs no second fixed cost); otherwise stop.

The policy file is written by `run.py policy` from committed rows only (no simulation). The pure parts below are
stdlib and tested in tests/test_runner7m.py; `run_design` needs numpy and pybamm (26.10.1.1 here).
"""
import json
import math
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
LOOK, FULL, CHUNK = 10, 50, 10
PLATING = "Negative electrode lithium plating volumetric interfacial current density [A.m-3]"


# ---------- pure (stdlib; tested) ----------

def centroid(p, xs, L):
    """Plating-weighted depth from the current collector as a fraction of the electrode (1 = separator)."""
    s = sum(p)
    if not s > 0:
        return float("nan")
    return sum(v / s * x for v, x in zip(p, xs)) / L


def observables(pl2, pl10, xs, L, lost):
    """O1, O2, O3 from cycle 2's and cycle 10's node plating and the first ten cycles' lithium loss (7c's)."""
    c2, c10 = centroid(pl2, xs, L), centroid(pl10, xs, L)
    try:
        o3 = math.log((lost[9] - lost[5]) / (lost[5] - lost[1]))
    except (ValueError, ZeroDivisionError):
        o3 = float("nan")
    return {"O1": c2, "O2": c10 - c2, "O3": o3}


def drift_score(rule, obs):
    """S = |m_hat - 1| with m_hat = c0 + c1 * O (the set's frozen observable and line)."""
    return abs(rule["c0"] + rule["c1"] * obs[rule["obs"]] - 1.0)


def decide(score, theta):
    """Extend to cycle 50 when the drift score reaches the threshold (a NaN score extends: never stop blind)."""
    return not (score < theta)


def rule_for(policy, cond):
    """The policy entry for a condition 'Set@rate'."""
    return policy["sets"][cond.split("@")[0]]


def load_policy(name="replay7h", path=HERE / "policy.json"):
    return json.loads(Path(path).read_text())[name]


# ---------- pybamm ----------

def _setup(cond, x):
    """Parameters and current for one design, through the programme's own design code (as 7k and 7l)."""
    exp = HERE.parent
    sys.path.insert(0, str(exp / "depth"))
    import importlib.util
    spec = importlib.util.spec_from_file_location("resume7k_run", exp / "resume7k" / "run.py")
    R = importlib.util.module_from_spec(spec)
    sys.modules.setdefault("resume7k_run", R)
    spec.loader.exec_module(R)
    return R._setup(cond, x)


def node_plating(cycle, n):
    """Plating per node over one cycle: minus the time integral of the plating current density, summed over steps."""
    import numpy as np
    p = np.zeros(n)
    for st in cycle.steps:
        p += -np.trapezoid(st[PLATING].entries, st["Time [s]"].entries, axis=1)
    return [float(v) for v in p]


def run_design(cond, x, policy):
    """Triage one design. Returns the decision, its score and inputs, the per-cycle record and the timings."""
    import pybamm
    pybamm.set_logging_level("ERROR")
    B, pv, cur = _setup(cond, x)
    rule = rule_for(policy, cond)
    vlo, vhi = pv["Lower voltage cut-off [V]"], pv["Upper voltage cut-off [V]"]
    exp = pybamm.Experiment([(f"Discharge at {cur:.6g} A until {vlo} V",
                              f"Charge at {cur:.6g} A until {vhi} V")] * CHUNK)
    t0 = time.perf_counter()
    sim = pybamm.Simulation(pybamm.lithium_ion.DFN(B.VARIANTS["both"]), parameter_values=pv, experiment=exp)
    sol = sim.solve(initial_soc=1.0)
    t_look = time.perf_counter() - t0
    xn = sol.cycles[0].steps[0]["x_n [m]"].entries
    xn = xn[:, 0] if xn.ndim == 2 else xn
    L_n = float(pv["Negative electrode thickness [m]"])
    lost10 = [float(cy["Total lithium lost [mol]"].entries[-1]) for cy in sol.cycles]
    obs = observables(node_plating(sol.cycles[1], len(xn)), node_plating(sol.cycles[LOOK - 1], len(xn)),
                      [float(v) for v in xn], L_n, lost10)
    score = drift_score(rule, obs)
    extend = decide(score, rule["theta"])
    t_score = time.perf_counter() - t0 - t_look
    while extend and len(sol.cycles) < FULL:
        sol = sim.solve(starting_solution=sol)
    seconds = time.perf_counter() - t0
    lost = [float(cy["Total lithium lost [mol]"].entries[-1]) for cy in sol.cycles]
    return dict(cond=cond, set=cond.split("@")[0], extend=extend, score=score, theta=rule["theta"], obs=obs,
                pick=rule["obs"], cycles=len(sol.cycles), lost_mol=lost, t_look=t_look, t_score=t_score,
                seconds=seconds)


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--cond", required=True)
    ap.add_argument("--x", required=True, help="design vector as JSON")
    ap.add_argument("--policy", default="replay7h")
    a = ap.parse_args()
    r = run_design(a.cond, json.loads(a.x), load_policy(a.policy))
    print(json.dumps(r))
