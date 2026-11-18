"""Measured-data check: SPM, SPMe and DFN against published discharge curves (README, "Next steps").

The OKane2022 (LG M50) designs scored elsewhere in this project have no measured curves, so this uses the
two measured data sets PyBaMM distributes together with a matching parameter set:

  * Ecker et al. 2015, Kokam SLPB 75106100 (7.5 Ah, graphite / NMC), parameter set `Ecker2015`,
    constant-current discharges at 1C and 5C (`Ecker_1C.csv`, `Ecker_5C.csv`: time [s], voltage [V]).
  * Ai et al. 2020, Enertech 2.28 Ah pouch (graphite / LCO), parameter set `Ai2020`,
    0.1C, 0.5C, 1C and 2C (`<rate>C_discharge_U.txt`: time [s], voltage [V]).

Files come from `pybamm.DataLoader` (pybamm-data release v1.0.2, sha256-checked by pooch).
Each case is solved isothermally and with a lumped thermal model, on PyBaMM's default mesh and on a mesh
with every dimension doubled (convergence check). Hypotheses are in LOG.md, written before the run.

  python experiments/validate_data.py      # writes validate_data.json and validate_data.txt (a few minutes)
"""
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
MODELS = ("SPM", "SPMe", "DFN")
CE = "Electrolyte concentration [mol.m-3]"

CASES = [  # (cell, parameter set, C-rate, data file, delimiter)
    ("Ecker", "Ecker2015", 1.0, "Ecker_1C.csv", ","),
    ("Ecker", "Ecker2015", 5.0, "Ecker_5C.csv", ","),
    ("Ai", "Ai2020", 0.1, "0.1C_discharge_U.txt", None),
    ("Ai", "Ai2020", 0.5, "0.5C_discharge_U.txt", None),
    ("Ai", "Ai2020", 1.0, "1C_discharge_U.txt", None),
    ("Ai", "Ai2020", 2.0, "2C_discharge_U.txt", None),
]


def load(fname, delim):
    import pybamm
    d = np.loadtxt(pybamm.DataLoader().get_data(fname), delimiter=delim)
    return d[:, 0], d[:, 1]


def rmse(a, b):
    return float(np.sqrt(np.mean((np.asarray(a) - np.asarray(b)) ** 2)))


def crossing_time(t, v, level):
    """First time v falls to `level` (linear interpolation); None if it never does."""
    below = np.nonzero(v <= level)[0]
    if len(below) == 0 or below[0] == 0:
        return None
    i = below[0]
    return float(t[i - 1] + (t[i] - t[i - 1]) * (v[i - 1] - level) / (v[i - 1] - v[i]))


def simulate(pset, crate, model_name, thermal, mesh, t_end):
    import pybamm
    pybamm.set_logging_level("ERROR")
    pv = pybamm.ParameterValues(pset)
    pv["Current function [A]"] = crate * pv["Nominal cell capacity [A.h]"]
    opts = {"thermal": "lumped"} if thermal else {}
    model = getattr(pybamm.lithium_ion, model_name)(opts)
    var_pts = dict(model.default_var_pts)
    var_pts = {k: mesh * v for k, v in var_pts.items()}
    sim = pybamm.Simulation(model, parameter_values=pv, var_pts=var_pts,
                            solver=pybamm.IDAKLUSolver(atol=1e-8, rtol=1e-8))
    sol = sim.solve(np.linspace(0, t_end, 2000))
    t = sol["Time [s]"].entries
    v = sol["Voltage [V]"].entries
    ce_min = float(np.min(sol[CE].entries))
    ce0 = float(pv["Initial concentration in electrolyte [mol.m-3]"])
    return t, v, ce_min / ce0


def run_case(cell, pset, crate, fname, delim, thermal, mesh):
    td, vd = load(fname, delim)
    t_end = 1.3 * td[-1]
    out = {"cell": cell, "pset": pset, "crate": crate, "thermal": thermal, "mesh": mesh,
           "data_points": int(len(td)), "data_t_end_s": float(td[-1]), "data_v_end": float(vd[-1])}
    curves = {}
    sims = {m: simulate(pset, crate, m, thermal, mesh, t_end) for m in MODELS}
    # Discharge-time metric: time to a common level both data and every model reach (the data's last voltage
    # can sit below a parameter set's cut-off, e.g. Ai2020 stops at 3.0 V and the data ends near 2.99 V).
    level = max([vd[-1]] + [float(v.min()) for _, v, _ in sims.values()]) + 0.05
    t_data = crossing_time(td, vd, level)
    out["t_level_V"], out["data_t_at_level_s"] = level, t_data
    body = td <= 0.9 * td[-1]  # excludes the end-of-discharge knee
    for m, (t, v, ce_rel) in sims.items():
        curves[m] = (t, v)
        mask = td <= t[-1]
        vm = np.interp(td[mask], t, v)
        tc = crossing_time(t, v, level)
        out[m] = {"rmse_mV": 1e3 * rmse(vm, vd[mask]), "max_abs_mV": float(1e3 * np.max(np.abs(vm - vd[mask]))),
                  "rmse_body_mV": 1e3 * rmse(np.interp(td[body], t, v), vd[body]),
                  "covered": float(mask.mean()), "t_end_model_s": float(t[-1]), "t_at_level_s": tc,
                  "t_err_pct": None if (tc is None or t_data is None) else 100.0 * (tc - t_data) / t_data,
                  "ce_min_rel": ce_rel}
        idx = np.linspace(0, len(t) - 1, 200).astype(int)
        out[m]["curve"] = [[float(t[i]), float(v[i])] for i in idx]
    out["data_curve"] = [[float(a), float(b)] for a, b in zip(td[:: max(1, len(td) // 200)], vd[:: max(1, len(td) // 200)])]
    for a, b in (("SPMe", "DFN"), ("SPM", "DFN")):
        (ta, va), (tb, vb) = curves[a], curves[b]
        tt = td[(td <= min(ta[-1], tb[-1]))]
        out[f"{a}_vs_{b}_rmse_mV"] = 1e3 * rmse(np.interp(tt, ta, va), np.interp(tt, tb, vb))
    return out


def report(rows):
    lines = ["Measured-data check: voltage RMSE [mV] against data over the time both cover; body = RMSE over the",
             "first 90% of the data's time (no end-of-discharge knee); t_err = model time to a common voltage level",
             "(0.05 V above the highest end voltage) minus the data's, % of the data's; ce_min = DFN minimum",
             "electrolyte concentration / initial. Constant-current discharge, parameters as published in PyBaMM",
             "26.10.1.1; mesh = multiple of PyBaMM's default points in every dimension.", ""]
    hdr = f"{'cell':6}{'C':>5} {'thermal':8}{'mesh':6}" + "".join(f"{m+' rmse':>11}{'body':>6}{'t_err':>8}" for m in MODELS) \
          + f"{'SPMe-DFN':>10}{'SPM-DFN':>9}{'ce_min':>8}"
    lines.append(hdr)
    for r in rows:
        s = f"{r['cell']:6}{r['crate']:>5.1f} {('lumped' if r['thermal'] else 'iso'):8}{str(r['mesh']) + 'x':6}"
        for m in MODELS:
            te = r[m]["t_err_pct"]
            s += f"{r[m]['rmse_mV']:>11.1f}{r[m]['rmse_body_mV']:>6.1f}{('n/a' if te is None else f'{te:+.1f}%'):>8}"
        s += f"{r['SPMe_vs_DFN_rmse_mV']:>10.1f}{r['SPM_vs_DFN_rmse_mV']:>9.1f}{r['DFN']['ce_min_rel']:>8.2f}"
        lines.append(s)
    return "\n".join(lines) + "\n"


def trim_curves(rows):
    """Keep the plotted curves only where validate_figure.py draws them (each cell's highest rate, isothermal,
    finest mesh), so the committed JSON stays small."""
    keep = {}
    for i, r in enumerate(rows):
        if r["crate"] in (5.0, 2.0) and not r["thermal"]:
            k = r["cell"]
            if k not in keep or r["mesh"] > rows[keep[k]]["mesh"]:
                keep[k] = i
    for i, r in enumerate(rows):
        if i not in keep.values():
            r.pop("data_curve", None)
            for m in MODELS:
                r[m].pop("curve", None)


def _job(args):
    c, thermal, mesh = args
    r = run_case(*c, thermal=thermal, mesh=mesh)
    print(r["cell"], r["crate"], thermal, mesh, {m: round(r[m]["rmse_mV"], 1) for m in MODELS}, flush=True)
    return r


def main():
    from multiprocessing import Pool
    # mesh convergence is checked on the isothermal runs: 2x everywhere, 4x at each cell's highest rate
    jobs = [(c, th, me) for c in CASES for th, me in ((False, 1), (False, 2), (True, 1))]
    big = [(c, False, 4) for c in CASES if c[2] in (5.0, 2.0)]
    with Pool(4, maxtasksperchild=1) as pool:
        rows = pool.map(_job, jobs, chunksize=1)
    with Pool(1, maxtasksperchild=1) as pool:  # a 4x DFN needs several GB; two at once ran out of memory
        rows += pool.map(_job, big, chunksize=1)
    rows.sort(key=lambda r: (r["cell"] != "Ecker", r["crate"], r["thermal"], r["mesh"]))
    trim_curves(rows)
    (HERE / "validate_data.json").write_text(json.dumps(rows, indent=1))
    (HERE / "validate_data.txt").write_text(report(rows))
    print(report(rows))


if __name__ == "__main__":
    sys.exit(main())
