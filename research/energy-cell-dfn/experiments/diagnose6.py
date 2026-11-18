"""Sixth probe: is SPMe's 5 A collapse caused by its electrolyte treatment? (README, "Next steps").

diagnose4/5 found SPMe's electrolyte concentration going negative during the 5 A charge on the two low-score
designs, while DFN stays positive. That fits the reduced electrolyte model failing, but no run changed the
electrolyte treatment. This one does, three ways, on the same two designs, two cycles, 5 A charge:

  A. SPMe's electrolyte-conductivity option swapped (default / composite / integrated / leading order).
     Hypothesis H1: if the conductivity (potential) treatment caused the collapse, some option removes it.
  B. The electrolyte diffusivity scaled by k in {1, 2, 4} in both models (conductivity untouched).
     Hypothesis H2: if the collapse is electrolyte depletion, faster diffusion removes the negative
     concentration and the collapse in SPMe, with DFN moving far less.
  C. DFN's reaction distribution in the negative electrode at the moment of its minimum concentration
     (cycle-1 charge): max/mean of the interfacial current density over x. SPMe assumes it uniform (ratio 1).
     Hypothesis H3: DFN shifts the reaction away from the depleted region (ratio well above 1), the
     self-limiting behaviour SPMe cannot represent.

  python experiments/diagnose6.py   # writes diagnose6.txt; each case runs in a fresh process (DFN memory)
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from run import _cell, clip  # noqa: E402

DESIGNS = {  # [positive thickness um, positive porosity, negative porosity, N/P]; from diagnose4.txt and diagnose5.txt
    "bayes3": [113.125, 0.288, 0.204, 1.16],
    "random1": [149.614, 0.249, 0.251, 0.929],
}
CE = "Electrolyte concentration [mol.m-3]"
J_NEG = "Negative electrode interfacial current density [A.m-2]"


def cases():
    out = []
    for d in DESIGNS:
        for cond in ("default", "composite", "integrated", "leading order"):
            out.append(dict(design=d, model="SPMe", cond=cond, k=1.0))
        for k in (2.0, 4.0):
            out.append(dict(design=d, model="SPMe", cond="default", k=k))
        for k in (1.0, 2.0, 4.0):
            out.append(dict(design=d, model="DFN", cond="default", k=k))
    return out


def run_case(c, i_chg=5.0):
    import pybamm
    pybamm.set_logging_level("ERROR")
    pv = _cell._params(clip(DESIGNS[c["design"]]))
    if c["k"] != 1.0:
        orig, k = pv["Electrolyte diffusivity [m2.s-1]"], c["k"]
        pv.update({"Electrolyte diffusivity [m2.s-1]": (lambda ce, T: k * orig(ce, T)) if callable(orig) else k * orig})
    opts = {"SEI": "solvent-diffusion limited", "lithium plating": "irreversible"}  # as run._model
    if c["cond"] != "default":
        opts["electrolyte conductivity"] = c["cond"]
    model = getattr(pybamm.lithium_ion, c["model"])(opts)
    exp = pybamm.Experiment([(f"Discharge at {_cell.I_DISCHARGE} A until 2.5 V", f"Charge at {i_chg} A until 4.2 V")] * 2)
    sol = pybamm.Simulation(model, parameter_values=pv, experiment=exp).solve(initial_soc=1.0)
    res = dict(c, steps=[])
    for k_, cyc in enumerate(sol.cycles):
        for name, st in zip(("discharge", "charge"), cyc.steps):
            t = st["Time [s]"].entries
            ah = abs(float(np.trapezoid(st["Current [A]"].entries, t))) / 3600.0
            ce = st[CE].entries
            row = dict(step=f"c{k_ + 1} {name}", ah=round(ah, 3), ce_min=round(float(ce.min()), 1))
            if c["model"] == "DFN" and k_ == 0 and name == "charge":
                j = st[J_NEG].entries  # (x_n, t)
                ti = int(np.argmin(ce.min(axis=0)))
                jt = np.abs(j[:, ti])
                xs = st["x_n [m]"].entries[:, ti] if st["x_n [m]"].entries.ndim == 2 else st["x_n [m]"].entries
                ix = int(np.argmin(ce[:, ti]))
                row.update(j_max_over_mean=round(float(jt.max() / jt.mean()), 2),
                           j_near_collector_over_mean=round(float(jt[0] / jt.mean()), 2),
                           j_near_separator_over_mean=round(float(jt[-1] / jt.mean()), 2),
                           t_min_s=round(float(t[ti] - t[0])), ce_min_node=ix, n_neg_nodes=int(len(xs)))
            res["steps"].append(row)
    return res


def label(c):
    return f"{c['design']:8s} {c['model']:4s} conductivity={c['cond']:13s} D_e x{c['k']:.0f}"


def main():
    if len(sys.argv) == 2:  # child
        c = json.loads(sys.argv[1])
        try:
            print(json.dumps(run_case(c)))
        except Exception as ex:
            print(json.dumps(dict(c, error=f"{type(ex).__name__}: {str(ex)[:160]}")))
        return
    rows = []
    for c in cases():
        p = subprocess.run([sys.executable, __file__, json.dumps(c)], capture_output=True, text=True)
        line = (p.stdout.strip().splitlines() or [json.dumps(dict(c, error=f"no output: {p.stderr[-160:]}"))])[-1]
        r = json.loads(line)
        rows.append(r)
        print(label(c), json.dumps(r.get("steps", r.get("error"))), flush=True)
    (HERE / "diagnose6.json").write_text(json.dumps(rows, indent=1) + "\n")
    L = ["diagnose6: 5 A charge, two cycles; Ah and minimum electrolyte concentration (mol/m3) per step", ""]
    for r in rows:
        if "error" in r:
            L.append(f"{label(r)}  ERROR {r['error']}")
            continue
        s = "; ".join(f"{x['step']} {x['ah']:.3f} Ah c_e_min {x['ce_min']:.0f}" for x in r["steps"])
        L.append(f"{label(r)}  {s}")
        for x in r["steps"]:
            if "j_max_over_mean" in x:
                L.append(f"{'':10s}DFN c1 charge at min c_e (t={x['t_min_s']} s, node {x['ce_min_node']}): negative-electrode "
                         f"|j| max/mean {x['j_max_over_mean']}, collector-side/mean {x['j_near_collector_over_mean']}, "
                         f"separator-side/mean {x['j_near_separator_over_mean']}")
    (HERE / "diagnose6.txt").write_text("\n".join(L) + "\n")


if __name__ == "__main__":
    main()
