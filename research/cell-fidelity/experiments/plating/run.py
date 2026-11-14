"""Milestone 5q: predict the DFN designs' 100-cycle fade from two cheap cycles that see lithium plating, and cut the pool with it.

    python experiments/plating/run.py predict   # 2-cycle SPMe with SEI + plating on every committed design (resumable) -> predict.jsonl
    python experiments/plating/run.py dev       # development replay on the 36 seen conditions (stdlib) -> dev.txt, dev.json
    python experiments/plating/run.py probe     # baseline design, SPMe and DFN for 2 cycles at each fresh condition -> probe.json
    python experiments/plating/run.py bench     # 64 Sobol (seed 14) designs x one DFN run resumed in 10-cycle chunks to 100 (resumable)
    python experiments/plating/run.py fresh     # the 2-cycle SPMe predictor on the fresh designs -> fresh_predict.jsonl
    python experiments/plating/run.py report    # results.txt, summary.json (stdlib)

Milestone 5p found that every fade number from 5b to 5o is lithium plating (OKane2022's plating parameters), not SEI, and that
SEI contributes nothing measurable over 20 cycles. 5o's zero-simulation (U, r_kt) front misses by up to 4.7% where fade decides
the best design (low-current Ai2020, best on layers 4 to 7), because it ranks high energy first and high energy fades fastest.
This milestone measures plating directly in the cheapest model that has it: SPMe with the programme's options
(TR.OPTS: solvent-diffusion SEI and irreversible plating) for two cycles, the lithium lost in cycle 2 as a share of the
inventory (p2), and SPMe's cycle-2 energy per stack mass (w2). The cut fixed on development data, before the fresh bench, is
in ../../LOG.md (5q plan). Pools, protocol, current mapping and the resumed DFN run are 5m's, unchanged.
"""
import importlib.util
import json
import math
import os
import statistics
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent

SOBOL_SEED = 14
WORKERS = int(os.environ.get("WORKERS", "3"))
BATCH = 24       # designs per predictor child process (one pybamm import per batch)
CYCLES = 2       # predictor cycles (cycle 1 starts from the set's own initial state; cycle 2's loss is the rate)
CONDITIONS = ()  # fresh conditions, fixed in the 5q plan before any fresh run (set below)


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


FC = _mod("frontcut_run", EXP / "frontcut" / "run.py")
N, H, E, P, G, R = FC.N, FC.H, FC.E, FC.P, FC.G, FC.R
spearman, cost_to, front = N.spearman, N.cost_to, E.front


# ---------- pure helpers (stdlib; tested) ----------

def p2_of(lost, n0):
    """Lithium lost during cycle 2 as a share of the initial inventory (cycle 1's loss includes the start transient)."""
    return (lost[1] - lost[0]) / n0


def _load(path):
    return [json.loads(l) for l in path.read_text().splitlines() if l.strip()] if path.exists() else []


# ---------- predictor (pybamm) ----------

def _predict_one(x, s, rate, pybamm, np, cell, TR):
    x = cell.clip(x)
    pv, _, cur = TR.params(x, s)
    cur *= rate
    vlo, vhi = pv["Lower voltage cut-off [V]"], pv["Upper voltage cut-off [V]"]
    out = dict(ok=True, error=None, mass_kg=float(TR.stack_mass(x, pv)), current_A=cur)
    exp = pybamm.Experiment([(f"Discharge at {cur:.6g} A until {vlo} V", f"Charge at {cur:.6g} A until {vhi} V")] * CYCLES)
    t0 = time.perf_counter()
    try:
        sol = pybamm.Simulation(pybamm.lithium_ion.SPMe(TR.OPTS), parameter_values=pv, experiment=exp).solve(initial_soc=1.0)
        wh, lost = [], []
        for cy in sol.cycles:
            d = cy.steps[0]
            wh.append(float(np.trapezoid(d["Terminal voltage [V]"].entries * d["Current [A]"].entries, d["Time [s]"].entries)) / 3600)
            lost.append(float(cy["Total lithium lost [mol]"].entries[-1]))
        out.update(cycle_wh=wh, lost_mol=lost, n_li_init=float(sol["Total lithium [mol]"].entries[0]), ok_cycles=len(sol.cycles))
        out["ok"] = len(sol.cycles) >= CYCLES
    except Exception as ex:
        out.update(ok=False, error=f"{type(ex).__name__}: {str(ex)[:160]}", ok_cycles=0)
    out["seconds"] = time.perf_counter() - t0
    return out


def _child(batch):
    """batch: [[cond, j, x], ...]; prints one JSON line per design."""
    import numpy as np
    import pybamm
    from energy_cell import cell
    pybamm.set_logging_level("ERROR")
    for c, j, x in batch:
        s, rate = G._parse(c)
        r = _predict_one(x, s, rate, pybamm, np, cell, G.TR)
        print(json.dumps(dict(cond=c, j=j, x=list(map(float, x))) | r), flush=True)


def _spawn(batch, timeout=1800):
    try:
        p = subprocess.run([sys.executable, __file__, "child", json.dumps(batch)], capture_output=True, text=True, timeout=timeout)
        got = [json.loads(l) for l in p.stdout.splitlines() if l.startswith("{")]
        err = None if p.returncode == 0 else f"exit {p.returncode}: {p.stderr.strip()[-160:]}"
    except subprocess.TimeoutExpired:
        got, err = [], f"timeout {timeout}s"
    seen = {(r["cond"], r["j"]) for r in got}
    # a crash fails the design it was on; the rest of the batch is retried on the next pass
    return got, [b for b in batch if (b[0], b[1]) not in seen], err


def _run_predict(path, items):
    done = {(r["cond"], r["j"]) for r in _load(path)}
    todo = [it for it in items if (it[0], it[1]) not in done]
    print(f"{len(todo)} designs to go", flush=True)
    for _ in range(3):
        if not todo:
            break
        batches = [todo[i:i + BATCH] for i in range(0, len(todo), BATCH)]
        left = []
        with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as fh:
            for got, rest, err in ex.map(_spawn, batches):
                for r in got:
                    fh.write(json.dumps(r) + "\n")
                fh.flush()
                if rest:
                    # the first missing design is the one the child died on: record it as failed, retry the others
                    c, j, x = rest[0]
                    fh.write(json.dumps(dict(cond=c, j=j, x=x, ok=False, error=err or "child died", ok_cycles=0, seconds=None)) + "\n")
                    left += rest[1:]
                print(f"batch: {len(got)} ok, {len(rest)} left ({err})", flush=True)
        todo = left


def dev_conditions():
    """5o's 33 development conditions plus 5o's three fresh ones (measured segments); every row carries u and r_kt."""
    D = FC.dev_conditions()
    FC._attach(D, EXP / "frontcut" / "urkt.jsonl")
    S = json.loads((EXP / "frontcut" / "summary.json").read_text())
    for c, e in S["extra"].items():
        D[c] = [dict(j=r["j"], score=r["score"], wh=r["wh_kg"], m=1.0, t100=r["t100"], seg=r["seg"], u=r["u"], rkt=r["rkt"])
                for r in e["rows"]]
    return D


def _xs():
    xs = FC._x_index()
    for r in _load(EXP / "frontcut" / "bench.jsonl"):
        xs.setdefault((r["cond"], r["j"]), r["x"])
    return xs


def predict():
    D, xs = dev_conditions(), _xs()
    _run_predict(HERE / "predict.jsonl", [(c, r["j"], xs[(c, r["j"])]) for c in sorted(D) for r in D[c]])


if __name__ == "__main__":
    cmd = sys.argv[1:2]
    if cmd == ["child"]:
        _child(json.loads(sys.argv[2]))
    elif cmd == ["predict"]:
        predict()
    else:
        print(__doc__)
