"""Second probe: per-cycle discharge energy of the low-scoring designs, and the open-circuit voltage at the start of discharge.
  python experiments/diagnose2.py   # writes diagnose2.txt"""
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from run import _cell, _model, clip  # noqa: E402


def curve(x, model_name, cycles=100):
    import pybamm
    pybamm.set_logging_level("ERROR")
    pv = _cell._params(clip(x))
    exp = pybamm.Experiment([(f"Discharge at {_cell.I_DISCHARGE} A until 2.5 V", f"Charge at {_cell.I_CHARGE} A until 4.2 V")] * cycles)
    sim = pybamm.Simulation(_model(getattr(pybamm.lithium_ion, model_name)), parameter_values=pv, experiment=exp)
    sol = sim.solve(initial_soc=1.0)
    out = []
    for c in sol.cycles:
        d = c.steps[0]
        out.append(float(np.trapezoid(d["Terminal voltage [V]"].entries * d["Current [A]"].entries, d["Time [s]"].entries)) / 3600.0)
    return out


def v0(x, model_name):
    """Terminal voltage at t=0 of a 5 A discharge from initial_soc=1."""
    import pybamm
    pybamm.set_logging_level("ERROR")
    pv = _cell._params(clip(x))
    sim = pybamm.Simulation(_model(getattr(pybamm.lithium_ion, model_name)), parameter_values=pv,
                            experiment=pybamm.Experiment([f"Discharge at {_cell.I_DISCHARGE} A for 1 second"]))
    sol = sim.solve(initial_soc=1.0)
    return float(sol["Terminal voltage [V]"].entries[0]), float(sol["Negative electrode stoichiometry"].entries[0]), float(sol["Positive electrode stoichiometry"].entries[0])


def main():
    sel = json.loads((HERE / "dfn.json").read_text())
    L = []
    for i, s in enumerate(sel):
        if i == 0 or s["spme_now"]["score"] >= 100:
            continue
        x = s["x"]
        L.append(f"[{s['source']}] x={[round(v, 3) for v in x]}  SPMe logged {s['spme_now']['score']:.1f}  DFN {s['dfn']['score']:.1f}")
        for m in ("SPMe", "DFN"):
            try:
                v = v0(x, m)
                L.append(f"   {m}: V(t=0)={v[0]:.3f}  neg stoich={v[1]:.3f}  pos stoich={v[2]:.3f}")
            except Exception as e:
                L.append(f"   {m}: v0 failed {type(e).__name__}: {str(e)[:150]}")
        if s["spme_now"]["score"] > 0:
            for m in ("SPMe",):
                try:
                    e = curve(x, m)
                    L.append(f"   {m} Wh by cycle 1,2,5,10,20,50,100: " + ", ".join(f"{e[k-1]:.2f}" for k in (1, 2, 5, 10, 20, 50, 100) if k <= len(e)))
                except Exception as ex:
                    L.append(f"   {m}: curve failed {ex}")
        print("\n".join(L[-4:]), flush=True)
    (HERE / "diagnose2.txt").write_text("\n".join(L) + "\n")


if __name__ == "__main__":
    main()
