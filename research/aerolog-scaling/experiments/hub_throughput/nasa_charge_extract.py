"""Milestone 6h, step 1: per-charge taper metrics from the NASA PCoE Li-ion ageing data (B0005, B0006, B0007, B0018).

Needs scipy and numpy and the four .mat files (unzip "1. BatteryAgingARC-FY08Q4.zip" from
https://phm-datasets.s3.amazonaws.com/NASA/5.+Battery+Data+Set.zip). Writes nasa_charge_metrics.json, which
cargo_hub_aged_cells.py reads with the standard library only.
Usage: python3 nasa_charge_extract.py <dir with B0005.mat ...>
Rules (from cargo_hub_aged_cells.py's docstring, plus one added after the files were opened and before any metric was
computed: a charge starting above 3.7 V, i.e. not after a full discharge, is dropped; this removes each cell's first,
factory-state charge). The charge ends at the first CV-phase sample with current <= 20 mA; samples after it are the
charger's rest and are ignored. A C/50 (40 mA) cut-off variant is added for the comparison with 6d (also added after
opening the files, before any metric was computed). Negative current samples (a one-sample switching transient at the start) count as zero.
"""
import json, math, os, sys
import numpy as np, scipy.io as sio

CELLS = ("B0005", "B0006", "B0007", "B0018")
I_CUT, V_CV = 0.020, 4.19

def soc_time(t, q, x):
    """first time the cumulative charge fraction reaches x (linear interpolation)."""
    k = int(np.searchsorted(q, x))
    if k == 0: return t[0]
    return t[k-1] + (x - q[k-1]) / (q[k] - q[k-1]) * (t[k] - t[k-1])

def metrics(d):
    t = np.asarray(d["Time"], float); I = np.asarray(d["Current_measured"], float); V = np.asarray(d["Voltage_measured"], float)
    if len(t) < 50: return None, "short"
    if V[0] > 3.7 and V[2] > 3.7: return None, "start>3.7V"
    Ip = np.clip(I, 0, None)
    cc = Ip[(V < 4.15) & (Ip > 1.0)]
    if len(cc) < 5: return None, "no CC"
    icc = float(np.median(cc))
    cv = np.nonzero((Ip < 0.95 * icc) & (V >= V_CV) & (np.arange(len(t)) > 3))[0]
    if len(cv) == 0: return None, "no CV"
    k0 = int(cv[0])
    end = np.nonzero((Ip <= I_CUT) & (np.arange(len(t)) > k0))[0]
    if len(end) == 0: return None, "no cut-off"
    k1 = int(end[0])
    tt, ii = t[:k1+1], Ip[:k1+1]
    if np.diff(tt).max() > 60: return None, "gap>60s"
    q = np.concatenate([[0], np.cumsum(0.5 * (ii[1:] + ii[:-1]) * np.diff(tt))]) / 3600
    Q = float(q[-1])
    if Q < 1.0: return None, "Q<1Ah"
    f = q / Q
    out = {"I_cc": icc, "Q_Ah": Q, "t_total_s": float(tt[-1] - tt[0]), "t_cv_s": float(tt[-1] - t[k0]),
           "q_cv_frac": float(1 - f[k0])}
    for a, b in ((.3, 1.0), (.2, .9)):
        tm = (soc_time(tt, f, b) if b < 1 else tt[-1]) - soc_time(tt, f, a)
        out[f"ratio_{int(a*100)}_{int(b*100)}"] = float(tm / (0.7 * Q * 3600 / icc))
    # the same windows with the charge ended at C/50 (40 mA), the Molicel datasheet's cut-off used in 6d
    e50 = np.nonzero((Ip <= 2 * I_CUT) & (np.arange(len(t)) > k0))[0]
    if len(e50):
        k2 = int(e50[0]); f2 = q[:k2+1] / q[k2]; t2 = tt[:k2+1]
        for a, b in ((.3, 1.0), (.2, .9)):
            tm = (soc_time(t2, f2, b) if b < 1 else t2[-1]) - soc_time(t2, f2, a)
            out[f"ratio_{int(a*100)}_{int(b*100)}_c50"] = float(tm / (0.7 * q[k2] * 3600 / icc))
    # single exponential fit of ln I over the CV phase
    x = tt[k0:k1+1] - tt[k0]; y = np.log(np.clip(ii[k0:k1+1], 1e-4, None))
    A = np.vstack([x, np.ones_like(x)]).T
    coef, res, *_ = np.linalg.lstsq(A, y, rcond=None)
    r2 = 1 - float(np.sum((A @ coef - y) ** 2)) / float(np.sum((y - y.mean()) ** 2))
    out["tau_s"] = float(-1 / coef[0]); out["r2_exp"] = r2
    # two halves: tau over the upper (I > 0.3 I_cc) and lower part of the decay
    for name, sel in (("tau_hi_s", ii[k0:k1+1] > 0.3 * icc), ("tau_lo_s", ii[k0:k1+1] <= 0.3 * icc)):
        if sel.sum() > 5:
            c = np.polyfit(x[sel], y[sel], 1); out[name] = float(-1 / c[0])
    out["T_max_C"] = float(np.max(np.asarray(d["Temperature_measured"], float)[:k1+1]))
    return out, None

def main(src):
    rows, dropped = [], {}
    for cell in CELLS:
        cyc = sio.loadmat(os.path.join(src, cell + ".mat"), simplify_cells=True)[cell]["cycle"]
        cap0, last_cap, n = None, None, 0
        for op in cyc:
            if op["type"] == "discharge":
                c = op["data"].get("Capacity")
                if c is not None and np.size(c):
                    last_cap = float(np.ravel(c)[0]); cap0 = cap0 or last_cap
            elif op["type"] == "charge":
                m, why = metrics(op["data"])
                if m is None:
                    dropped[why] = dropped.get(why, 0) + 1; continue
                n += 1
                m.update(cell=cell, k=n, prev_capacity_Ah=last_cap, first_capacity_Ah=cap0)
                rows.append({k: (round(v, 5) if isinstance(v, float) else v) for k, v in m.items()})
    json.dump({"source": "NASA PCoE Li-ion Battery Aging Datasets (Saha and Goebel 2007), B0005/6/7/18",
               "dropped": dropped, "charges": rows}, open(os.path.join(os.path.dirname(__file__), "nasa_charge_metrics.json"), "w"),
              indent=0, separators=(",", ":"))
    print(f"kept {len(rows)} charges, dropped {dropped}")

if __name__ == "__main__":
    main(sys.argv[1])
