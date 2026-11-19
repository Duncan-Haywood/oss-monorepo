"""The cell-fidelity triage runner with a lean score read (milestone 7n): one DFN design, one long-lived `Simulation`.

    python experiments/lean7n/triage.py --cond Chen2020@1.5x --x '[...]'            # 7m's policy.json, "replay7h"
    python experiments/lean7n/triage.py --cond Chen2020@1.5x --x '[...]' --policy deploy

Same rule as 7m's runner (`experiments/runner7m/triage.py`): solve 10 cycles, score the drift, stop or keep solving the
same object in place to cycle 50. What changes is how the score is read. 7m integrated the x-resolved plating current
over every time step of cycles 2 and 10 and read the lithium loss of all ten cycles, about 1.26 cycle equivalents of
work per design. Here:
  - only the observable the set's policy uses is computed (no set uses O3, so the lithium-loss series is not read
    before the decision);
  - a cycle's node plating is read as the change in the dead-lithium concentration across the cycle (two state
    vectors per cycle). In PyBaMM's "irreversible" plating option the plated lithium is held in that state, whose
    time derivative is the plating reaction rate, so its change over a cycle is the exact time integral of the plating
    current (divided by -F), which 7m approximated with the trapezoid rule on the output points. The plating centroid
    is scale-free, so F cancels;
  - the node positions come from the mesh rather than from a processed variable.
The pure parts are stdlib and tested in tests/test_lean7n.py; `run_design` needs numpy and pybamm (26.10.1.1 here).
"""
import importlib.util
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEAD = "Negative dead lithium concentration [mol.m-3]"


def _mod(name, path):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


M = _mod("runner7m_triage", HERE.parent / "runner7m" / "triage.py")
LOOK, FULL = M.LOOK, M.FULL
centroid, drift_score, decide, rule_for, load_policy = M.centroid, M.drift_score, M.decide, M.rule_for, M.load_policy


# ---------- pure (stdlib; tested) ----------

def needs(pick):
    """Which cycles' node plating (1-based) the picked observable needs; O3 needs the lithium-loss series instead."""
    return {"O1": (2,), "O2": (2, LOOK), "O3": ()}[pick]


def lean_observable(pick, plating, xs, L, lost=None):
    """The picked observable from {cycle: node plating}; O3 from the ten-cycle lithium loss as in 7m."""
    if pick == "O3":
        return M.observables([1.0], [1.0], [0.5], 1.0, lost)["O3"]
    c2 = centroid(plating[2], xs, L)
    return c2 if pick == "O1" else centroid(plating[LOOK], xs, L) - c2


def state_change(start, end):
    """Per-node change of a state across a cycle (end minus start)."""
    return [float(b - a) for a, b in zip(start, end)]


# ---------- pybamm ----------

def cycle_plating(cycle):
    """Node plating over one cycle, read as the change in dead-lithium concentration (2 state vectors)."""
    a = cycle.steps[0][DEAD].entries[:, 0]
    b = cycle.steps[-1][DEAD].entries[:, -1]
    return state_change(a, b)


def lean_score(sim, sol, pv, rule):
    """The set's drift score from the look solution, reading only what the picked observable needs."""
    pick = rule["obs"]
    xs = [float(v) for v in sim.mesh["negative electrode"].nodes]
    L_n = float(pv["Negative electrode thickness [m]"])
    plating = {k: cycle_plating(sol.cycles[k - 1]) for k in needs(pick)}
    lost = ([float(cy["Total lithium lost [mol]"].entries[-1]) for cy in sol.cycles] if pick == "O3" else None)
    o = lean_observable(pick, plating, xs, L_n, lost)
    return drift_score(rule, {pick: o}), o


def run_design(cond, x, policy, compare=False):
    """Triage one design. With compare=True, also reads 7m's full observables from the look solution after the
    timed run (for the bench; never part of `seconds`)."""
    import pybamm
    pybamm.set_logging_level("ERROR")
    B, pv, cur = M._setup(cond, x)
    rule = rule_for(policy, cond)
    vlo, vhi = pv["Lower voltage cut-off [V]"], pv["Upper voltage cut-off [V]"]
    exp = pybamm.Experiment([(f"Discharge at {cur:.6g} A until {vlo} V",
                              f"Charge at {cur:.6g} A until {vhi} V")] * M.CHUNK)
    t0 = time.perf_counter()
    sim = pybamm.Simulation(pybamm.lithium_ion.DFN(B.VARIANTS["both"]), parameter_values=pv, experiment=exp)
    sol = sim.solve(initial_soc=1.0)
    t_look = time.perf_counter() - t0
    score, o = lean_score(sim, sol, pv, rule)
    extend = decide(score, rule["theta"])
    t_score = time.perf_counter() - t0 - t_look
    look = sol
    while extend and len(sol.cycles) < FULL:
        sol = sim.solve(starting_solution=sol)
    seconds = time.perf_counter() - t0
    lost = [float(cy["Total lithium lost [mol]"].entries[-1]) for cy in sol.cycles]
    out = dict(cond=cond, set=cond.split("@")[0], extend=extend, score=score, theta=rule["theta"], obs={rule["obs"]: o},
               pick=rule["obs"], cycles=len(sol.cycles), lost_mol=lost, t_look=t_look, t_score=t_score,
               seconds=seconds)
    if compare:
        t1 = time.perf_counter()
        xn = look.cycles[0].steps[0]["x_n [m]"].entries
        xn = xn[:, 0] if xn.ndim == 2 else xn
        lost10 = [float(cy["Total lithium lost [mol]"].entries[-1]) for cy in look.cycles[:LOOK]]
        full = M.observables(M.node_plating(look.cycles[1], len(xn)), M.node_plating(look.cycles[LOOK - 1], len(xn)),
                             [float(v) for v in xn], float(pv["Negative electrode thickness [m]"]), lost10)
        out.update(obs_full=full, score_full=drift_score(rule, full), t_score_full=time.perf_counter() - t1,
                   mesh_vs_xn=max(abs(a - float(b)) for a, b in zip(sim.mesh["negative electrode"].nodes, xn)))
    return out


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--cond", required=True)
    ap.add_argument("--x", required=True, help="design vector as JSON")
    ap.add_argument("--policy", default="replay7h")
    a = ap.parse_args()
    print(json.dumps(run_design(a.cond, json.loads(a.x), load_policy(a.policy))))
