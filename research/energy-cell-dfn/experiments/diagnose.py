"""Why does SPMe return 0 for some designs? Re-run them with the exception kept.
  python experiments/diagnose.py   # writes diagnose.txt
Needs numpy, scipy, pybamm."""
import json
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from run import _cell, _model, clip, stack_mass_kg  # noqa: E402


def probe(x, model_name, cycles=100):
    import pybamm
    pybamm.set_logging_level("ERROR")
    x = clip(x)
    pv = _cell._params(x)
    exp = pybamm.Experiment([(f"Discharge at {_cell.I_DISCHARGE} A until 2.5 V", f"Charge at {_cell.I_CHARGE} A until 4.2 V")] * cycles)
    t = time.time()
    try:
        sol = pybamm.Simulation(_model(getattr(pybamm.lithium_ion, model_name)), parameter_values=pv, experiment=exp).solve(initial_soc=1.0)
    except Exception as e:  # keep the reason
        return dict(status="exception", error=f"{type(e).__name__}: {str(e)[:300]}", secs=round(time.time() - t))
    n = len(sol.cycles)
    d = sol.cycles[-1].steps[0]
    return dict(status="ok" if n >= cycles else "short", cycles=n, termination=str(sol.termination)[:120], secs=round(time.time() - t))


def main():
    sel = json.loads((HERE / "dfn.json").read_text())
    bad = [(i, s) for i, s in enumerate(sel) if i and s["spme_now"]["score"] < 100 and s["dfn"]["score"] > 100]
    L = []
    for i, s in bad:
        x = s["x"]
        r = probe(x, "SPMe")
        L.append(f"{s['source']:<8} x={[round(v, 3) for v in x]} SPMe_logged={s['spme_now']['score']:.1f} DFN={s['dfn']['score']:.1f} -> {r}")
        print(L[-1], flush=True)
    (HERE / "diagnose.txt").write_text("\n".join(L) + "\n")


if __name__ == "__main__":
    main()
