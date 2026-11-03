"""Third probe: the first three cycles of each failing design, step by step (Ah moved), under SPMe and DFN, and
whether a gentler charge current removes the collapse.
  python experiments/diagnose3.py   # writes diagnose3.txt"""
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from run import _cell, _model, clip  # noqa: E402

FAIL = [("bayes3", 4), ("random1", 5), ("random0", 6), ("bayes1a", 7), ("bayes1b", 8)]


def steps(x, model_name, i_chg, cycles=4):
    import pybamm
    pybamm.set_logging_level("ERROR")
    pv = _cell._params(clip(x))
    exp = pybamm.Experiment([(f"Discharge at {_cell.I_DISCHARGE} A until 2.5 V", f"Charge at {i_chg} A until 4.2 V")] * cycles)
    sim = pybamm.Simulation(_model(getattr(pybamm.lithium_ion, model_name)), parameter_values=pv, experiment=exp)
    try:
        sol = sim.solve(initial_soc=1.0)
    except Exception as e:
        return f"solver error: {str(e)[:90]}"
    out = []
    for k, c in enumerate(sol.cycles):
        row = []
        for st in c.steps:
            t = st["Time [s]"].entries; I = st["Current [A]"].entries
            ah = abs(float(np.trapezoid(I, t))) / 3600.0
            row.append(f"{ah:.3f}Ah/{st['Terminal voltage [V]'].entries[0]:.2f}->{st['Terminal voltage [V]'].entries[-1]:.2f}V")
        out.append(f"c{k+1}: " + " | ".join(row))
    return "; ".join(out)


def main():
    sel = json.loads((HERE / "dfn.json").read_text())
    pick = {"bayes3": 113.125, "random1": 149.614}
    L = []
    for i, s in enumerate(sel):
        if i == 0 or s["spme_now"]["score"] >= 100:
            continue
        x = s["x"]
        if s["spme_now"]["score"] < 20 or s["spme_now"]["score"] == 0.0 or s["source"] == "random1":
            L.append(f"[{s['source']}] x={[round(v, 3) for v in x]} SPMe {s['spme_now']['score']:.1f} DFN {s['dfn']['score']:.1f}")
            for m in ("SPMe", "DFN"):
                for ic in (5.0, 2.0):
                    L.append(f"   {m} charge {ic} A  {steps(x, m, ic)}")
            print("\n".join(L[-5:]), flush=True)
    (HERE / "diagnose3.txt").write_text("\n".join(L) + "\n")


if __name__ == "__main__":
    main()
