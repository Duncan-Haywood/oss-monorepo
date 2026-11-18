"""Fifth probe: repeat diagnose4 (electrolyte concentration at 5 A, SPMe against DFN, two cycles) on the other
failing designs: the three solver-error zeros (failures.json) and the second low score. Reports the minimum
electrolyte concentration, which diagnose4 found going negative under SPMe for bayes3.
  python experiments/diagnose5.py   # writes diagnose5.txt"""
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from run import _cell, _model, clip  # noqa: E402

DESIGNS = {  # name: [positive thickness um, positive porosity, negative porosity, N/P], from diagnose2.txt and failures.json
    "random1 (low score 27.6)": [149.614, 0.249, 0.251, 0.929],
    "random0 (zero)": [137.648, 0.212, 0.267, 0.96],
    "bayes1 (zero)": [149.696, 0.201, 0.389, 1.299],
    "bayes1b (zero)": [138.708, 0.209, 0.204, 1.282],
}
VARS = ["Electrolyte concentration [mol.m-3]", "X-averaged negative electrode porosity",
        "Loss of lithium to lithium plating [mol]", "X-averaged negative electrode surface potential difference [V]"]


def probe(X, model_name, i_chg=5.0):
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
    import subprocess
    if len(sys.argv) == 3:  # child: one design, one model
        try:
            print("\n".join(probe(DESIGNS[sys.argv[1]], sys.argv[2])))
        except Exception as ex:  # SPMe raises SolverError on the zero-score designs
            print(f"   {sys.argv[2]} raised {type(ex).__name__}: {str(ex)[:140]}")
        return
    L = []
    for name in DESIGNS:
        L.append(f"design {name} x={DESIGNS[name]}")
        for m in ("SPMe", "DFN"):  # fresh process each: DFN does not release memory
            out = subprocess.run([sys.executable, __file__, name, m], capture_output=True, text=True).stdout
            L.append(out.rstrip()); print(out, flush=True)
    (HERE / "diagnose5.txt").write_text("\n".join(L) + "\n")


if __name__ == "__main__":
    main()
