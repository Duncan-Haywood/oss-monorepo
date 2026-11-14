"""Step 14: a leak-free L-Town 2018-19 from `L-TOWN_Real.inp`, and the frozen detectors on it.

    PYTHONPATH=src python experiments/step14-leakfree/run.py   # from research/water-leaks

Plan fixed in LOG.md (2026-11-14, step 14) before any simulation was run. BattLeDIM's README
says `L-TOWN_Real.inp` is the model the data were generated from and holds no leaks, so its
simulation is the benchmark's own no-leak counterfactual. Every alarm a detector raises on it is
false by construction.

1. Simulate each year (EPANET 2.2, `simulate.run_year`), read at the 33 pressure sensors, the
   three SCADA flows and T1; round to the published files' resolution (amendment, LOG.md).
2. Fidelity: real minus simulated, per sensor, over the 2018 hours with total leak flow under
   1 m3/h and over all hours; lag-1 autocorrelation of the 5-minute residual's first difference.
3. Step 8's six detectors at their frozen 2018 settings: on the real data (checked against
   step 8's alarm lists), then on the simulated data, all else (hours, AMR demands) unchanged.
4. Null alarms per 90 days, and the null alarms scored by step 1's harness: 2019 leaks a
   leak-free run is credited with, against the random-time chance level at the same count.
Writes results.txt, fidelity.tsv and alarms.tsv here (with --continuous, the *_continuous files); the simulation is cached as
$WATER_LEAKS_CACHE/step14_sim.npz (62 MB, not committed). About 6 minutes from cold.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import numpy as np

from water_leaks import data, detect, harness, simulate
from water_leaks.harness import Y19

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
LOW_LEAK = 1.0          # m3/h, total leak flow below which a 2018 hour counts as low-leak
NEAR_H = 48             # hours: a real alarm "also raised on the null" if one is this close
DRAWS = 1000
# --continuous (declared after the primary results were read, LOG.md): one two-year run with the
# one-year patterns wrapping, as the published T1 level (continuous across New Year) implies.
CONTINUOUS = "--continuous" in sys.argv
SUFFIX = "_continuous" if CONTINUOUS else ""


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def decimals(name):
    """Most decimal places a published SCADA file uses (its resolution)."""
    best = 0
    for ln in data.fetch(name).read_text().splitlines()[1:2000]:
        for x in ln.split(";")[1:]:
            if "," in x:
                best = max(best, len(x.split(",")[1]))
    return best


def simulated(pcols, fcols, lcols):
    """5-minute simulated arrays for 2018 then 2019, cached."""
    cache = data.cache_dir() / f"step14_sim{SUFFIX}.npz"
    if cache.exists():
        z = np.load(cache)
        return z["P"], z["F"], z["L"]
    inp = data.fetch("L-TOWN_Real.inp")
    if CONTINUOUS:
        return simulate.run_year(inp, pcols, fcols, lcols, steps=2 * simulate.YEAR_STEPS)
    parts = [simulate.run_year(inp, pcols, fcols, lcols) for _ in (2018, 2019)]
    P, F, L = (np.vstack([p[k] for p in parts]) for k in range(3))
    np.savez(cache, P=P, F=F, L=L)
    return P, F, L


def lag1_diff(x):
    d = np.diff(x)
    d = d - d.mean()
    return float((d[1:] * d[:-1]).sum() / (d * d).sum())


def main():
    s8 = _load(EXP / "step8-gated" / "run.py", "step8")
    S = harness.setup()
    hrs, events, carried, pcols, fcols = S["hrs"], S["events"], S["carried"], S["pcols"], S["fcols"]
    first_scored = hrs[(s8.G + s8.WMIN) * 24]
    holdoff = (s8.G + s8.WMIN) * 24
    lcols = data.load("Levels", 2018)[1]

    # ---- 1. simulate
    Ps, Fs, Ls = simulated(pcols, fcols, lcols)
    if np.isnan(Ps).any() or np.isnan(Fs).any() or np.isnan(Ls).any():
        raise SystemExit("simulation left 5-minute marks unfilled")
    res = {k: decimals(f"2018_SCADA_{k}.csv") for k in ("Pressures", "Flows", "Levels")}
    Ps, Fs, Ls = np.round(Ps, res["Pressures"]), np.round(Fs, res["Flows"]), np.round(Ls, res["Levels"])
    ts = np.concatenate([data.load("Pressures", y)[0] for y in (2018, 2019)])
    real5 = {"P": np.vstack([data.load("Pressures", y)[2] for y in (2018, 2019)]),
             "F": np.vstack([data.load("Flows", y)[2] for y in (2018, 2019)]),
             "L": np.vstack([data.load("Levels", y)[2] for y in (2018, 2019)])}
    assert real5["P"].shape == Ps.shape, (real5["P"].shape, Ps.shape)
    _, P_h = detect.hourly(ts, Ps)
    _, F_h = detect.hourly(ts, Fs)
    _, L_h = detect.hourly(ts, Ls)

    out = ["# water-leaks step 14: leak-free L-Town 2018-19 simulated from L-TOWN_Real.inp (EPANET 2.2 via WNTR's toolkit)",
           ("# one continuous two-year run, patterns wrapping (--continuous, a sensitivity declared after the primary results)" if CONTINUOUS
            else "# each year from the file's initial state (primary)"),
           f"# rounded to the published resolution {res}",
           f"# scored period from {first_scored}; harness of step 1 (30-day window, ungated); chance {DRAWS} draws, seed 0", ""]

    # ---- 2. fidelity
    flows = s8.leak_flows(hrs)
    tot = np.sum(list(flows.values()), axis=0)
    low = (tot < LOW_LEAK) & (hrs < Y19)
    allh = np.ones(len(hrs), bool)
    out.append(f"## fidelity: real minus simulated (hourly means); low-leak hours = 2018 hours with total leak flow < {LOW_LEAK:g} m3/h: {low.sum()}")
    out.append(f"  total leak flow over 2018-19: median {np.median(tot):.1f} m3/h, max {tot.max():.1f}")
    fid = ["kind\tname\tlow_n\tlow_median_abs\tlow_p95_abs\tall_median_abs\tall_p95_abs\tall_mean_signed\tlag1_diff_5min"]
    lowmed = {}
    for kind, Rh, Sh, cols in (("P", S["P"], P_h, pcols), ("F", S["F"], F_h, fcols), ("L", S["Lv"], L_h, lcols)):
        r5, s5 = real5[kind], {"P": Ps, "F": Fs, "L": Ls}[kind]
        for j, c in enumerate(cols):
            d = Rh[:, j] - Sh[:, j]
            a_low, a_all = np.abs(d[low]), np.abs(d[allh])
            lm = float(np.median(a_low)) if low.any() else float("nan")
            if kind == "P":
                lowmed[c] = lm
            # the 5-minute residual over low-leak 2018 hours' 5-minute marks
            m5 = np.repeat(low, 12)[:len(r5)]
            ac = lag1_diff((r5[:, j] - s5[:, j])[m5]) if m5.sum() > 3 else float("nan")
            fid.append(f"{kind}\t{c}\t{low.sum()}\t{lm:.4f}\t{np.percentile(a_low, 95) if low.any() else float('nan'):.4f}"
                       f"\t{np.median(a_all):.4f}\t{np.percentile(a_all, 95):.4f}\t{d.mean():+.4f}\t{ac:.3f}")
    (HERE / f"fidelity{SUFFIX}.tsv").write_text("\n".join(fid) + "\n")
    v = np.array(list(lowmed.values()))
    out.append(f"  pressures, low-leak hours: median |real - sim| per sensor from {v.min():.4f} to {v.max():.4f} m "
               f"(median over sensors {np.median(v):.4f}); sensors under 0.1 m: {(v < 0.1).sum()} of {len(v)}")
    for kind in ("F", "L"):
        rows = [r.split("\t") for r in fid[1:] if r.startswith(kind + "\t")]
        out.append("  " + "; ".join(f"{r[1]}: low-leak median |d| {float(r[3]):.3f}, all-hours median {float(r[5]):.3f}, "
                                    f"mean signed {r[7]}" for r in rows))
    out.append("  per sensor: fidelity.tsv")

    # ---- 3. detectors
    out += ["", "## detectors at their frozen 2018 settings (step 8's alarm_lists)", "  real data, against the steps' recorded 2019 alarms:"]
    real = s8.alarm_lists(S)
    out += s8.check_against_steps(hrs, real)
    Sn = dict(S, P=P_h, F=F_h, Lv=L_h)
    null = s8.alarm_lists(Sn)

    # ---- 4. null rates and null credit
    span_d = (hrs[-1] - first_scored).astype(int) / 24
    out += ["", f"## null alarms (leak-free simulation) over the scored period ({span_d:.0f} days), and what the harness credits them with",
            "  detector   | real alarms /90d | null alarms /90d | null 2019 credit (of 19)  chance median (95%)  P(chance>=) | real 2019 TP | real alarms within 48 h of a null alarm"]
    tsv = ["detector\tdata\talarm_time\tsensor\tmatched_pipe"]
    cred = {}
    for k in real:
        rows = []
        for lab, al in (("real", real[k]), ("null", null[k])):
            r = harness.evaluate(hrs, al, events, carried, first_scored)
            inv = {t: i for i, t in r["m"].items()}
            for t, sidx in al:
                i = inv.get(hrs[t])
                tsv.append(f"{k}\t{lab}\t{str(hrs[t])[:13]}\t{sidx}\t{events[i][0] if i is not None else ''}")
            rows.append((al, r))
        (ra, rr), (na, nr) = rows
        n_null = sum(hrs[t] >= first_scored for t, _ in na)
        n_real = sum(hrs[t] >= first_scored for t, _ in ra)
        if n_null:
            nul = harness.null_metrics(hrs, n_null, events, carried, first_scored, holdoff, pcols, S["dist"], DRAWS, 0)["TP"]
            ch = f"{np.median(nul):>5.0f} ({np.percentile(nul, 2.5):.0f} to {np.percentile(nul, 97.5):.0f})  {(nul >= len(nr['tp19'])).mean():.3f}"
        else:
            ch = "    - (no alarms)       -"
        nt = np.array([t for t, _ in na])
        near = sum(1 for t, _ in ra if len(nt) and np.abs(nt - t).min() <= NEAR_H)
        near_tp = sum(1 for i in rr["tp19"] if len(nt) and np.abs(nt - int((rr["m"][i] - hrs[0]).astype(int))).min() <= NEAR_H)
        cred[k] = len(nr["tp19"])
        out.append(f"  {k:<10} | {n_real:>4} ({n_real / span_d * 90:>4.1f})     | {n_null:>4} ({n_null / span_d * 90:>4.1f})     | "
                   f"{len(nr['tp19']):>4}                     {ch:<32} | {len(rr['tp19']):>4}         | "
                   f"{near} of {len(ra)} (of 2019 TPs: {near_tp} of {len(rr['tp19'])})")
    (HERE / f"alarms{SUFFIX}.tsv").write_text("\n".join(tsv) + "\n")

    nn = {k: int(sum(hrs[t] >= first_scored for t, _ in null[k])) for k in null}
    nr_ = {k: int(sum(hrs[t] >= first_scored for t, _ in real[k])) for k in real}
    pa = (v < 0.1).sum() >= 30
    pb = all(nn[k] >= 1 for k in s8.PRESSURE)
    pc = all(nn[k] < nr_[k] for k in nn)
    pd = max(cred.values()) >= 3
    out += ["", "## pre-registered predictions (LOG.md, step 14 plan)",
            f"  (a) median |real - sim| < 0.1 m on low-leak 2018 hours at >= 30 of 33 sensors: {(v < 0.1).sum()}: {'HELD' if pa else 'FAILED'}",
            f"  (b) D1-F and LILA-auto each raise >= 1 null alarm: {[nn[k] for k in s8.PRESSURE]}: {'HELD' if pb else 'FAILED'}",
            f"  (c) every detector's null count below its real count: {', '.join(f'{k} {nn[k]}/{nr_[k]}' for k in nn)}: {'HELD' if pc else 'FAILED'}",
            f"  (d) some detector's null alarms credited with >= 3 of 19 new 2019 leaks: max {max(cred.values())}: {'HELD' if pd else 'FAILED'}"]
    (HERE / f"results{SUFFIX}.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
