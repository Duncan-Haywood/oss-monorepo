"""Milestone 6a: SPM, SPMe and DFN against measured constant-current discharges of two commercial cells.

    python experiments/measured/run.py bench    # 3 models x 6 conditions, one fresh process per run -> bench.jsonl (resumable)
    python experiments/measured/run.py report   # results.txt, summary.json (stdlib only)

Measured data: PyBaMM's data registry (pybamm-data v1.0.2, fetched by pybamm.DataLoader, which checks SHA-256 sums).
  Ecker2015: Kokam SLPB 75106100, Ecker et al. (2015), 1C and 5C (digitised curves, time [s], voltage [V]).
  Ai2020: Enertech pouch cell, Ai et al. (2020), 0.1C, 0.5C, 1C, 2C (1 s sampling, time [s], voltage [V]).
Models, settings, metrics and hypotheses H61 to H63 are fixed in ../../LOG.md (milestone 6a plan) before the bench.
"""
import json
import math
import os
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
THERMAL = os.environ.get("THERMAL", "isothermal")   # post hoc check (after the verdicts): THERMAL=lumped
BENCH = HERE / ("bench.jsonl" if THERMAL == "isothermal" else f"bench_{THERMAL}.jsonl")

MODELS = ("SPM", "SPMe", "DFN")
# (parameter set, C-rate, measured file); order as in the plan
CONDITIONS = (("Ecker2015", 1.0, "Ecker_1C.csv"), ("Ecker2015", 5.0, "Ecker_5C.csv"),
              ("Ai2020", 0.1, "0.1C_discharge_U.txt"), ("Ai2020", 0.5, "0.5C_discharge_U.txt"),
              ("Ai2020", 1.0, "1C_discharge_U.txt"), ("Ai2020", 2.0, "2C_discharge_U.txt"))
NOMINAL_AH = {"Ecker2015": 0.15625, "Ai2020": 2.28}   # the sets' "Nominal cell capacity [A.h]"
MODEL_CUT = {"Ecker2015": 2.5, "Ai2020": 3.0}          # model lower cut-off [V]
V_CUT = {"Ecker2015": 2.8, "Ai2020": 3.05}             # common cut-off for capacity, above every measured end voltage
C0 = 1000.0                                            # initial electrolyte concentration [mol/m3], both sets
N_KEEP = 240                                           # curve points kept per run for the figure


def label(cell, crate):
    return f"{cell}@{crate:g}C"


# ---------- pure helpers (tested) ----------

def parse_measured(text):
    """Two numeric columns (time s, voltage V), comma or whitespace separated."""
    t, v = [], []
    for line in text.splitlines():
        parts = line.replace(",", " ").split()
        if len(parts) < 2:
            continue
        try:
            a, b = float(parts[0]), float(parts[1])
        except ValueError:
            continue
        t.append(a)
        v.append(b)
    return t, v


def crossing_time(t, v, vcut):
    """First time the voltage falls to vcut (linear interpolation), or None if it never does."""
    if v and v[0] <= vcut:
        return t[0]
    for i in range(1, len(t)):
        if v[i] <= vcut < v[i - 1]:
            return t[i - 1] + (t[i] - t[i - 1]) * (v[i - 1] - vcut) / (v[i - 1] - v[i])
    return None


def interp(t, v, x):
    """Linear interpolation of (t, v) at x; None outside [t0, tN]."""
    if x < t[0] or x > t[-1]:
        return None
    lo, hi = 0, len(t) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if t[mid] <= x:
            lo = mid
        else:
            hi = mid
    if t[hi] == t[lo]:
        return v[lo]
    return v[lo] + (v[hi] - v[lo]) * (x - t[lo]) / (t[hi] - t[lo])


def rmse_on_overlap(tm, vm, ts, vs, t_end):
    """RMSE of the model curve (ts, vs) at the measured times tm up to t_end (both curves defined there)."""
    errs = []
    for x, y in zip(tm, vm):
        if x > t_end:
            break
        z = interp(ts, vs, x)
        if z is not None:
            errs.append((z - y) ** 2)
    return math.sqrt(sum(errs) / len(errs)) if errs else None


def rel_err(q, q_meas):
    return (q - q_meas) / q_meas


def ranks(xs):
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    r = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        for k in range(i, j + 1):
            r[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return r


def spearman(a, b):
    ra, rb = ranks(a), ranks(b)
    ma, mb = sum(ra) / len(ra), sum(rb) / len(rb)
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    den = math.sqrt(sum((x - ma) ** 2 for x in ra) * sum((y - mb) ** 2 for y in rb))
    return num / den if den else float("nan")


def thin(t, v, n=N_KEEP):
    if len(t) <= n:
        return list(t), list(v)
    step = (len(t) - 1) / (n - 1)
    idx = sorted({round(i * step) for i in range(n)})
    return [t[i] for i in idx], [v[i] for i in idx]


def evaluate(cond):
    """cond: dict with 'q_meas' and per model {'q', 'r_min', 'rmse'}. Returns the per-condition derived numbers."""
    out = {}
    for m in MODELS:
        r = cond["models"].get(m)
        out[m] = None if r is None or r.get("q") is None else rel_err(r["q"], cond["q_meas"])
    out["excess"] = (abs(out["SPMe"]) - abs(out["DFN"])) if None not in (out["SPMe"], out["DFN"]) else None
    s, d = cond["models"]["SPMe"], cond["models"]["DFN"]
    out["reduction"] = abs(s["q"] - d["q"]) / cond["q_meas"] if s.get("q") is not None and d.get("q") is not None else None
    out["param"] = abs(out["DFN"]) if out["DFN"] is not None else None
    return out


def verdicts(conds):
    """conds: list of dicts with 'name', 'q_meas', 'models'. H61 to H63 as fixed in the plan."""
    ev = {c["name"]: evaluate(c) for c in conds}
    # H61: |err_DFN| <= |err_SPMe| + 0.01 everywhere; refuted if SPMe closer by > 0.02 anywhere
    worst = max(ev[c["name"]]["excess"] * -1 for c in conds)  # how much closer SPMe is, at most
    h61 = "supported" if worst <= 0.01 else ("refuted" if worst > 0.02 else "mixed")
    # H62: Spearman(SPMe r_min, excess) <= -0.6 supported, > 0 refuted
    rmins = [c["models"]["SPMe"]["r_min"] for c in conds]
    exc = [ev[c["name"]]["excess"] for c in conds]
    rho = spearman(rmins, exc)
    h62 = "supported" if rho <= -0.6 else ("refuted" if rho > 0 else "mixed")
    # H63: among SPMe r_min >= 0.5, reduction < param on >= 2/3; refuted if < 1/3
    trusted = [c["name"] for c in conds if c["models"]["SPMe"]["r_min"] >= 0.5]
    wins = [n for n in trusted if ev[n]["reduction"] < ev[n]["param"]]
    share = len(wins) / len(trusted) if trusted else None
    if share is None:
        h63 = "untestable"
    else:
        h63 = "supported" if share >= 2 / 3 else ("refuted" if share < 1 / 3 else "mixed")
    return dict(per=ev, H61=dict(verdict=h61, spme_closer_max=worst), H62=dict(verdict=h62, spearman=rho),
                H63=dict(verdict=h63, trusted=trusted, wins=wins, share=share))


# ---------- simulation (pybamm) ----------

def measured(fname):
    import pybamm
    path = pybamm.DataLoader().get_data(fname)
    return parse_measured(Path(path).read_text())


def simulate(cell, crate, model_name):
    import numpy as np
    import pybamm
    pybamm.set_logging_level("ERROR")
    pv = pybamm.ParameterValues(cell)
    assert abs(pv["Nominal cell capacity [A.h]"] - NOMINAL_AH[cell]) < 1e-12
    assert abs(pv["Initial concentration in electrolyte [mol.m-3]"] - C0) < 1e-9
    current = crate * NOMINAL_AH[cell]
    pv.update({"Current function [A]": current, "Lower voltage cut-off [V]": MODEL_CUT[cell]})
    opts = {} if THERMAL == "isothermal" else {"thermal": THERMAL}
    model = getattr(pybamm.lithium_ion, model_name)(opts)
    t_end = 1.3 * 3600.0 / crate
    t0 = time.perf_counter()
    sim = pybamm.Simulation(model, parameter_values=pv)
    sol = sim.solve([0, t_end], t_interp=np.linspace(0, t_end, 4001))
    secs = time.perf_counter() - t0
    t = sol["Time [s]"].entries.tolist()
    v = sol["Voltage [V]"].entries.tolist()
    ce = sol["Electrolyte concentration [mol.m-3]"].entries
    temp = sol["X-averaged cell temperature [K]"].entries
    return dict(t=t, v=v, r_min=float(np.min(ce)) / C0, t_max_K=float(np.max(temp)), current_A=current, seconds=secs,
                termination=str(sol.termination))


def child(cell, crate, model_name, fname):
    tm, vm = measured(fname)
    out = dict(cell=cell, crate=crate, model=model_name, thermal=THERMAL, ok=True, error=None)
    try:
        s = simulate(cell, crate, model_name)
        tq = crossing_time(s["t"], s["v"], V_CUT[cell])
        tmq = crossing_time(tm, vm, V_CUT[cell])
        out.update(r_min=s["r_min"], t_max_K=s["t_max_K"], current_A=s["current_A"], seconds=s["seconds"], termination=s["termination"],
                   t_cut=tq, q=None if tq is None else s["current_A"] * tq / 3600.0,
                   rmse=rmse_on_overlap(tm, vm, s["t"], s["v"], min(tm[-1], s["t"][-1])))
        out["t_keep"], out["v_keep"] = thin(s["t"], s["v"])
        out["meas_t_cut"] = tmq
    except Exception as ex:
        out.update(ok=False, error=f"{type(ex).__name__}: {str(ex)[:200]}")
    print(json.dumps(out))


def done():
    if not BENCH.exists():
        return set()
    return {(r["cell"], r["crate"], r["model"]) for r in map(json.loads, BENCH.read_text().splitlines()) if r.get("kind") != "measured"}


def bench():
    have = done()
    with BENCH.open("a") as fh:
        for cell, crate, fname in CONDITIONS:
            for m in MODELS:
                if (cell, crate, m) in have:
                    continue
                p = subprocess.run([sys.executable, __file__, "child", cell, str(crate), m, fname],
                                   capture_output=True, text=True, timeout=3600)
                line = [x for x in p.stdout.splitlines() if x.startswith("{")]
                rec = json.loads(line[-1]) if line else dict(cell=cell, crate=crate, model=m, ok=False,
                                                              error=p.stderr[-300:])
                fh.write(json.dumps(rec) + "\n")
                fh.flush()
                print(label(cell, crate), m, rec.get("ok"), rec.get("q"), rec.get("r_min"), rec.get("seconds"), flush=True)
    # measured curves, thinned, for the figure (pybamm-data, BSD-3-Clause)
    have_meas = set()
    if BENCH.exists():
        have_meas = {(r["cell"], r["crate"]) for r in map(json.loads, BENCH.read_text().splitlines()) if r.get("kind") == "measured"}
    with BENCH.open("a") as fh:
        for cell, crate, fname in CONDITIONS:
            if (cell, crate) in have_meas:
                continue
            tm, vm = measured(fname)
            tq = crossing_time(tm, vm, V_CUT[cell])
            kt, kv = thin(tm, vm)
            fh.write(json.dumps(dict(kind="measured", cell=cell, crate=crate, file=fname, n=len(tm),
                                     t_cut=tq, q=crate * NOMINAL_AH[cell] * tq / 3600.0,
                                     v_end=vm[-1], t_keep=kt, v_keep=kv)) + "\n")


def retention(qs, base):
    """Rate capability: capacity at each rate over capacity at the base rate (removes a rate-independent offset)."""
    return {k: q / qs[base] for k, q in qs.items()}


def load(path=None):
    path = path or BENCH
    rows = [json.loads(x) for x in path.read_text().splitlines()]
    if not any(r.get("kind") == "measured" for r in rows):   # the post hoc bench reuses the measured rows
        rows += [r for r in map(json.loads, (HERE / "bench.jsonl").read_text().splitlines()) if r.get("kind") == "measured"]
    conds = []
    for cell, crate, _ in CONDITIONS:
        meas = next(r for r in rows if r.get("kind") == "measured" and r["cell"] == cell and r["crate"] == crate)
        models = {r["model"]: r for r in rows if r.get("kind") != "measured" and r["cell"] == cell and r["crate"] == crate}
        conds.append(dict(name=label(cell, crate), cell=cell, crate=crate, q_meas=meas["q"], meas=meas, models=models))
    return conds


def measured_temperature_rise():
    """Peak of the second column of Ai2020's measured temperature files (a rise in K over the start), or {} offline."""
    out = {}
    try:
        for crate, f in ((0.5, "0.5C_discharge_T.txt"), (1.0, "1C_discharge_T.txt"), (2.0, "2C_discharge_T.txt")):
            _, temp = measured(f)
            out[crate] = max(temp)
    except Exception:
        return {}
    return out


def posthoc(conds):
    """After the verdicts, not pre-registered: rate capability (removes Ai2020's rate-independent offset) and the same
    runs with PyBaMM's lumped thermal model, read from bench_lumped.jsonl if it exists."""
    sets = {"isothermal": conds}
    lump = HERE / "bench_lumped.jsonl"
    if lump.exists():
        sets["lumped"] = load(lump)
    L = ["Post hoc (after the verdicts, not pre-registered)",
         "A. Ai2020 rate capability, Q(rate)/Q(0.1C), so the rate-independent capacity offset cancels; error in points"]
    data = {}
    for mode, cs in sets.items():
        ai = [c for c in cs if c["cell"] == "Ai2020"]
        meas = retention({c["crate"]: c["q_meas"] for c in ai}, 0.1)
        data[mode] = {"Ai2020_retention": {"measured": meas}}
        for m in MODELS:
            ret = retention({c["crate"]: c["models"][m]["q"] for c in ai}, 0.1)
            data[mode]["Ai2020_retention"][m] = ret
        L.append(f"  {mode}: " + "; ".join(
            f"{cr:g}C measured {meas[cr]:.4f}, " + ", ".join(
                f"{m} {100 * (data[mode]['Ai2020_retention'][m][cr] - meas[cr]):+.2f}" for m in MODELS)
            for cr in (0.5, 1.0, 2.0)))
    if "lumped" in sets:
        L.append("B. lumped thermal against isothermal: capacity error, voltage RMSE [mV], peak cell temperature rise [K]")
        L.append(f"  {'condition':<16} {'model':<5} {'err iso':>8} {'err lump':>8} {'RMSE iso':>8} {'RMSE lump':>9} {'dT':>5} {'r_min lump':>10}")
        data["lumped_vs_iso"] = {}
        for c, d in zip(sets["isothermal"], sets["lumped"]):
            for m in MODELS:
                a, b = c["models"][m], d["models"][m]
                ea, eb = rel_err(a["q"], c["q_meas"]), rel_err(b["q"], d["q_meas"])
                dT = b["t_max_K"] - 298.15
                data["lumped_vs_iso"].setdefault(c["name"], {})[m] = dict(err_iso=ea, err_lumped=eb, rmse_iso=a["rmse"],
                                                                           rmse_lumped=b["rmse"], r_min_lumped=b["r_min"])
                L.append(f"  {c['name']:<16} {m:<5} {ea:+8.2%} {eb:+8.2%} {1000 * a['rmse']:8.1f} {1000 * b['rmse']:9.1f} "
                         f"{dT:5.1f} {b['r_min']:10.3f}")
        L.append("  dT is the lumped run's peak X-averaged temperature minus the sets' 298.15 K ambient.")
        meas_T = measured_temperature_rise()
        if meas_T:
            data["Ai2020_measured_peak_dT_K"] = meas_T
            L.append("C. Ai2020 measured peak temperature rise [K] (pybamm-data *_discharge_T.txt, second column): " +
                     ", ".join(f"{k:g}C {v:.2f}" for k, v in meas_T.items()) +
                     "; lumped DFN above: " + ", ".join(
                         f"{c['crate']:g}C {c['models']['DFN']['t_max_K'] - 298.15:.2f}" for c in sets["lumped"]
                         if c["cell"] == "Ai2020" and c["crate"] >= 0.5))
    return dict(lines=L, data=data)


def report():
    conds = load()
    res = verdicts(conds)
    L = ["cell-fidelity milestone 6a: SPM, SPMe and DFN (PyBaMM 26.10.1.1, default options, isothermal) against measured "
         "constant-current discharges (pybamm-data v1.0.2)",
         f"capacity to V_cut ({V_CUT['Ecker2015']} V Ecker2015, {V_CUT['Ai2020']} V Ai2020); error = (Q_model - Q_meas)/Q_meas; "
         "RMSE over the time both curves cover", ""]
    L.append(f"{'condition':<16} {'Q_meas Ah':>9} {'model':<5} {'Q Ah':>8} {'err':>7} {'RMSE mV':>8} {'r_min':>7} {'sec':>7}")
    for c in conds:
        for m in MODELS:
            r = c["models"][m]
            if not r.get("ok") or r.get("q") is None:
                L.append(f"{c['name']:<16} {c['q_meas']:9.4f} {m:<5} failed or never reached V_cut: {r.get('error') or r.get('termination')}")
                continue
            L.append(f"{c['name']:<16} {c['q_meas']:9.4f} {m:<5} {r['q']:8.4f} {res['per'][c['name']][m]:+7.2%} "
                     f"{1000 * r['rmse']:8.1f} {r['r_min']:7.3f} {r['seconds']:7.2f}")
        L.append("")
    L.append(f"{'condition':<16} {'SPMe r_min':>10} {'excess':>8} {'|SPMe-DFN|':>10} {'|DFN-meas|':>10}")
    for c in conds:
        e = res["per"][c["name"]]
        L.append(f"{c['name']:<16} {c['models']['SPMe']['r_min']:10.3f} {e['excess']:+8.2%} {e['reduction']:10.2%} {e['param']:10.2%}")
    L.append("")
    h = res
    L.append(f"H61 (DFN within SPMe + 1 pt everywhere): {h['H61']['verdict']}; SPMe closer than DFN by at most "
             f"{h['H61']['spme_closer_max']:+.2%} (refuted if > +2%)")
    L.append(f"H62 (Spearman(SPMe r_min, excess) <= -0.6): {h['H62']['verdict']}; rho = {h['H62']['spearman']:.3f} over {len(conds)}")
    L.append(f"H63 (on SPMe r_min >= 0.5, |SPMe-DFN| < |DFN-meas| on >= 2/3): {h['H63']['verdict']}; trusted "
             f"{h['H63']['trusted']}, reduction smaller on {h['H63']['wins']}")
    post = posthoc(conds)
    L += [""] + post["lines"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    summ = dict(conditions={c["name"]: dict(q_meas=c["q_meas"], **{m: dict(q=c["models"][m].get("q"),
                                                                            err=res["per"][c["name"]][m],
                                                                            rmse=c["models"][m].get("rmse"),
                                                                            r_min=c["models"][m].get("r_min"),
                                                                            seconds=c["models"][m].get("seconds"))
                                                                     for m in MODELS},
                                            excess=res["per"][c["name"]]["excess"],
                                            reduction=res["per"][c["name"]]["reduction"],
                                            param=res["per"][c["name"]]["param"]) for c in conds},
                H61=res["H61"], H62=res["H62"], H63=res["H63"], posthoc=post["data"])
    (HERE / "summary.json").write_text(json.dumps(summ, indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "report"
    if cmd == "child":
        child(sys.argv[2], float(sys.argv[3]), sys.argv[4], sys.argv[5])
    elif cmd == "bench":
        bench()
    else:
        report()
