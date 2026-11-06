"""Fourth probe: is the SPMe collapse an electrolyte effect? Design bayes3 (the 5 A collapse after cycle 1), two
cycles at 5 A, SPMe and DFN: electrolyte concentration range per electrode, negative-electrode porosity,
plating and the terminal voltage at the end of each step.
  python experiments/diagnose4.py   # writes diagnose4.txt"""
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from run import _cell, _model, clip  # noqa: E402

X = [113.125, 0.288, 0.204, 1.16]  # bayes3
VARS = ["Electrolyte concentration [mol.m-3]", "X-averaged negative electrode porosity",
        "Loss of lithium to lithium plating [mol]", "X-averaged negative electrode surface potential difference [V]"]


def probe(model_name, i_chg=5.0):
    import pybamm
    pybamm.set_logging_level("ERROR")
    pv = _cell._params(clip(X))
    exp = pybamm.Experiment([(f"Discharge at {_cell.I_DISCHARGE} A until 2.5 V", f"Charge at {i_chg} A until 4.2 V")] * 2)
    sim = pybamm.Simulation(_model(getattr(pybamm.lithium_ion, model_name)), parameter_values=pv, experiment=exp)
    sol = sim.solve(initial_soc=1.0)
    L = [f"{model_name}, charge {i_chg} A"]
    for k, c in enumerate(sol.cycles):
        for name, st in zip(("discharge", "charge"), c.steps):
            t = st["Time [s]"].entries
            ah = abs(float(np.trapezoid(st["Current [A]"].entries, t))) / 3600.0
            ce = st["Electrolyte concentration [mol.m-3]"].entries
            row = [f"c{k+1} {name}: {ah:.3f} Ah, {t[-1]-t[0]:.0f} s", f"c_e min/max over space and time {ce.min():.0f}/{ce.max():.0f} mol/m3"]
            for v in VARS[1:3]:
                try:
                    e = st[v].entries
                    row.append(f"{v.split(' [')[0]} start/end {np.ravel(e)[0]:.4g}/{np.ravel(e)[-1]:.4g}")
                except Exception as ex:
                    row.append(f"{v}: n/a ({type(ex).__name__})")
            L.append("   " + "; ".join(row))
    return L


def main():
    L = [f"design bayes3 x={X} (positive thickness um, positive porosity, negative porosity, N/P)"]
    for m in ("SPMe", "DFN"):
        for i in (5.0, 2.0):
            L += probe(m, i)
            print("\n".join(L[-5:]), flush=True)
    (HERE / "diagnose4.txt").write_text("\n".join(L) + "\n")


if __name__ == "__main__":
    main()
