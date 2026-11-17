"""Milestone 5p: what makes the DFN designs fade? An ablation of PyBaMM's two degradation options, and its lithium bookkeeping.

    python experiments/attribution/run.py bench    # 8 conditions x 4 designs x 4 option sets, DFN, 20 cycles (resumable) -> bench.jsonl
    python experiments/attribution/run.py report   # results.txt, summary.json (stdlib)

Every milestone from 5b on runs DFN with {"SEI": "solvent-diffusion limited", "lithium plating": "irreversible"}, and 5n
justified its sqrt(cycle) fade fit by SEI growth. A closed-form SEI loss (PyBaMM's own solvent-diffusion law, below) gives
about 0.5% of capacity over 100 cycles on Ai2020, against 55 to 65% energy fade in the benches, and PyBaMM's
"Total lithium lost to side reactions [mol]" disagrees with "Total lithium lost [mol]" on Ai2020 by a factor of 34, its
parallel-electrode count. This milestone measures both on committed designs: which option causes the fade, and whether
the side-reaction loss variables omit the parallel-electrode count. Plan and H96 to H99 in ../../LOG.md (5p plan).
Designs, mapping, current and protocol are 5g's (imported unchanged through ../frontcut/run.py).
"""
import importlib.util
import json
import math
import os
import statistics
import sys
import time
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent

CYCLES = 20
DESIGNS = 4          # the first 4 designs (by j) of each condition's committed pool
WORKERS = int(os.environ.get("WORKERS", "3"))
# one condition per parameter set at its 1x current, plus Ai2020 at 0.3x (the low-current pool where fade reorders designs)
CONDITIONS = ("OKane2022@1x", "Ai2020@0.3x", "Ai2020@1x", "Chen2020@1x", "Ecker2015@1x", "NCA_Kim2011@1x",
              "Mohtat2020@1x", "Marquis2019@1x")
VARIANTS = {"both": {"SEI": "solvent-diffusion limited", "lithium plating": "irreversible"},
            "sei": {"SEI": "solvent-diffusion limited"},
            "plating": {"lithium plating": "irreversible"},
            "none": {}}
F_CONST = 96485.33212
MIN_FADE = 0.01      # conditions whose degradation adds less fade than this are not scored for H97/H98


# ---------- pure helpers (stdlib; tested) ----------

def sei_closed_form(t, L0, V, D, c_sol, z):
    """SEI thickness after time t under PyBaMM's solvent-diffusion-limited law.
    PyBaMM: j_sei = -F c_sol D / L, dc_sei/dt = -a j_sei / (F z), L = c_sei V / a, so dL/dt = V D c_sol / (z L) and
    L(t)^2 = L0^2 + 2 V D c_sol t / z (independent of potential and current)."""
    return math.sqrt(L0 * L0 + 2.0 * V * D * c_sol * t / z)


def sei_lithium(t, L0, V, D, c_sol, z, a, vol):
    """Moles of lithium consumed by SEI after time t: z (L - L0) a / V per m3 of electrode, times electrode volume vol."""
    return z * (sei_closed_form(t, L0, V, D, c_sol, z) - L0) * a / V * vol


def fade(wh, lo=2, hi=CYCLES):
    """Fractional energy fade from cycle lo to cycle hi (1-based); cycle 1 is skipped because the protocol starts from
    the parameter set's own initial state, which a CC-only charge does not return to."""
    return 1.0 - wh[hi - 1] / wh[lo - 1]


def attribute(f):
    """f: {variant: fade}. Degradation-added fade (both minus none) and the share each option alone reproduces."""
    added = f["both"] - f["none"]
    if added <= 0:
        return dict(added=added, plating_share=None, sei_share=None)
    return dict(added=added, plating_share=(f["plating"] - f["none"]) / added, sei_share=(f["sei"] - f["none"]) / added)


def verdict(xs, ok, bad):
    if not xs:
        return "untested"
    if all(ok(x) for x in xs):
        return "supported"
    if any(bad(x) for x in xs):
        return "refuted"
    return "mixed"


# ---------- simulation (pybamm) ----------

def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _fc():
    return _mod("frontcut_run", EXP / "frontcut" / "run.py")


def jobs():
    fc = _fc()
    D = fc.dev_conditions()
    xs = fc._x_index()
    out = []
    for c in CONDITIONS:
        js = sorted(r["j"] for r in D[c] if (c, r["j"]) in xs)[:DESIGNS]
        out += [(c, j, v, xs[(c, j)]) for j in js for v in VARIANTS]
    return out


def simulate(job):
    import numpy as np
    import pybamm
    fc = _fc()
    from energy_cell import cell
    pybamm.set_logging_level("ERROR")
    c, j, v, x = job
    s, rate = fc.G._parse(c)
    x = cell.clip(x)
    S, TR = fc.P._sand(), fc.G.TR
    _, _, _, _, cur = S.geometry(x, s, rate)
    pv, _, _ = TR.params(x, s)
    vlo, vhi = pv["Lower voltage cut-off [V]"], pv["Upper voltage cut-off [V]"]
    npar = float(pv["Number of electrodes connected in parallel to make a cell"])
    out = dict(cond=c, j=j, variant=v, x=list(map(float, x)), n_parallel=npar, current_A=cur, ok=True, error=None)
    model = pybamm.lithium_ion.DFN(VARIANTS[v])
    exp = pybamm.Experiment([(f"Discharge at {cur:.6g} A until {vlo} V", f"Charge at {cur:.6g} A until {vhi} V")] * CYCLES)
    t0 = time.perf_counter()
    try:
        sol = pybamm.Simulation(model, parameter_values=pv, experiment=exp).solve(initial_soc=1.0)
        wh, lost, side, tend = [], [], [], []
        for cy in sol.cycles:
            d = cy.steps[0]
            wh.append(float(np.trapezoid(d["Terminal voltage [V]"].entries * d["Current [A]"].entries, d["Time [s]"].entries)) / 3600)
            lost.append(float(cy["Total lithium lost [mol]"].entries[-1]))
            side.append(float(cy["Total lithium lost to side reactions [mol]"].entries[-1]))
            tend.append(float(cy["Time [s]"].entries[-1]))
        a = 3 * float(pv["Negative electrode active material volume fraction"]) / float(pv["Negative particle radius [m]"])
        vol = float(pv["Negative electrode thickness [m]"]) * TR.area_parallel(pv)
        sei = dict(L0=float(pv["Initial SEI thickness [m]"]), V=float(pv["SEI partial molar volume [m3.mol-1]"]),
                   D=float(pv["SEI solvent diffusivity [m2.s-1]"]), c_sol=float(pv["Bulk solvent concentration [mol.m-3]"]),
                   z=float(pv["Ratio of lithium moles to SEI moles"]), a=a, vol=vol)
        out.update(cycle_wh=wh, lost_mol=lost, side_mol=side, t_end=tend, sei_params=sei,
                   n_li_init=float(sol["Total lithium [mol]"].entries[0]), ok_cycles=len(sol.cycles))
    except Exception as ex:
        out.update(ok=False, error=f"{type(ex).__name__}: {str(ex)[:160]}")
    out["seconds"] = time.perf_counter() - t0
    return out


def _load(path):
    return [json.loads(l) for l in path.read_text().splitlines() if l.strip()] if path.exists() else []


def _spawn(job, timeout=1800):
    """One fresh process per run (a solver crash or a memory kill then fails one run, not the bench)."""
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
    done = {(r["cond"], r["j"], r["variant"]) for r in _load(path)}
    todo = [jb for jb in jobs() if (jb[0], jb[1], jb[2]) not in done]
    print(f"{len(todo)} runs to go", flush=True)
    with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as fh:
        for r in ex.map(_spawn, todo):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            print(r["cond"], r["j"], r["variant"], "ok" if r["ok"] else r["error"], flush=True)


# ---------- report (stdlib) ----------

def report():
    runs = _load(HERE / "bench.jsonl")
    by = {}
    for r in runs:
        by.setdefault(r["cond"], {}).setdefault(r["j"], {})[r["variant"]] = r
    L = [f"cell-fidelity milestone 5p: fade attribution over {CYCLES} DFN cycles ({len(runs)} runs; fade from cycle 2 to {CYCLES})", ""]
    C, ratios, sei_err = {}, [], []
    for c in CONDITIONS:
        designs = {}
        for j, vs in sorted(by.get(c, {}).items()):
            if not all(v in vs and vs[v]["ok"] and len(vs[v]["cycle_wh"]) >= CYCLES for v in VARIANTS):
                continue
            f = {v: fade(vs[v]["cycle_wh"]) for v in VARIANTS}
            d = dict(fade=f) | attribute(f)
            # H96: true lithium lost over the side-reaction variable, divided by the parallel count
            for v in ("both", "sei", "plating"):
                r = vs[v]
                if r["side_mol"][-1] > 0:
                    ratios.append(r["lost_mol"][-1] / r["side_mol"][-1] / r["n_parallel"])
            d["ratio_both"] = vs["both"]["lost_mol"][-1] / vs["both"]["side_mol"][-1]
            d["n_parallel"] = vs["both"]["n_parallel"]
            # H99: closed-form SEI lithium at the SEI-only run's elapsed time against its true lithium lost
            r = vs["sei"]
            cf = sei_lithium(r["t_end"][-1], **r["sei_params"])
            d["sei_closed_mol"], d["sei_true_mol"] = cf, r["lost_mol"][-1]
            d["sei_rel_err"] = cf / r["lost_mol"][-1] - 1 if r["lost_mol"][-1] > 0 else None
            if d["sei_rel_err"] is not None:
                sei_err.append(d["sei_rel_err"])
            d["sei_li_pct"] = 100 * r["lost_mol"][-1] / r["n_li_init"]
            d["plating_li_pct"] = 100 * vs["plating"]["lost_mol"][-1] / vs["plating"]["n_li_init"]
            designs[j] = d
        if not designs:
            L.append(f"{c}: no design ran all four variants")
            continue
        med = lambda k: statistics.median(designs[j][k] for j in designs if designs[j][k] is not None) \
            if any(designs[j][k] is not None for j in designs) else None
        cm = dict(n=len(designs), added=med("added"), plating_share=med("plating_share"), sei_share=med("sei_share"),
                  fade={v: statistics.median(designs[j]["fade"][v] for j in designs) for v in VARIANTS},
                  ratio=med("ratio_both"), n_parallel=designs[next(iter(designs))]["n_parallel"],
                  sei_rel_err=med("sei_rel_err"), sei_li_pct=med("sei_li_pct"), plating_li_pct=med("plating_li_pct"),
                  designs=designs)
        C[c] = cm
        fs = ", ".join(f"{v} {cm['fade'][v]:.4f}" for v in VARIANTS)
        sh = (f"plating alone {cm['plating_share']:.3f}, SEI alone {cm['sei_share']:.3f} of it"
              if cm["plating_share"] is not None else "no added fade")
        L.append(f"{c}: {cm['n']} designs; median fade {fs}; degradation adds {cm['added']:.4f}, {sh}\n"
                 f"  lithium lost by cycle {CYCLES}: plating-only {cm['plating_li_pct']:.3f}% of inventory, SEI-only {cm['sei_li_pct']:.4f}%;"
                 f" true lost / side-reaction variable {cm['ratio']:.4f} (parallel electrodes {cm['n_parallel']:g});"
                 f" closed-form SEI / SEI-only run's loss - 1 = {cm['sei_rel_err']:+.4f}")
    scored = [c for c in C.values() if c["added"] is not None and c["added"] > MIN_FADE]
    vd = dict(
        H96=verdict(ratios, lambda x: abs(x - 1) <= 1e-3, lambda x: abs(x - 1) > 1e-2),
        H97=verdict([c["plating_share"] for c in scored], lambda x: x >= 0.9, lambda x: x < 0.7),
        H98=verdict([abs(c["sei_share"]) for c in scored], lambda x: x < 0.1, lambda x: x > 0.3),
        H99=verdict([abs(e) for e in sei_err], lambda x: x <= 0.10, lambda x: x > 0.25))
    L += ["", f"H96 ratio / n_parallel over {len(ratios)} degraded runs: min {min(ratios):.5f}, max {max(ratios):.5f}" if ratios else "",
          f"H97/H98 scored on {len(scored)} of {len(C)} conditions (degradation adds more than {MIN_FADE:.0%} fade)",
          f"H99 closed-form SEI relative error over {len(sei_err)} runs: max |e| {max(map(abs, sei_err)):.4f}" if sei_err else "",
          "", "Verdicts: " + ", ".join(f"{k} {w}" for k, w in vd.items())]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(conditions=C, verdicts=vd, h96_ratios=ratios, h99_errors=sei_err), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    cmd = sys.argv[1:2]
    if cmd == ["child"]:
        print(json.dumps(simulate(tuple(json.loads(sys.argv[2])))))
    elif cmd == ["bench"]:
        bench()
    elif cmd == ["report"]:
        report()
    else:
        print(__doc__)
