"""Score the cached 900 s simulations against PG&E B-19.   PYTHONPATH=src python experiments/run.py > experiments/results.txt"""
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from infra_pumpdemand.net import MIN_PRESSURE_M, TANK_MARGIN_M, window  # noqa: E402
from infra_pumpdemand.tariff import DAYS_PER_MONTH, SEASONS, month_bill  # noqa: E402


def load():
    z = np.load(HERE / "cache.npz")
    masks, rows = z["masks"], z["rows"]
    kw = rows[:, :96] + rows[:, 96:192]
    ext = rows[:, 192:]
    return masks, kw, ext


def nruns(m):
    return int(((m != np.roll(m, 1)) & m).sum()) if not m.all() else 1


def label(m):
    on = [h for h in range(24) if m[h]]
    if not on:
        return "off"
    if len(on) == 24:
        return "24h"
    runs = []
    for h in range(24):
        if m[h] and not m[h - 1]:
            e = h
            while m[(e + 1) % 24]:
                e += 1
            runs.append(f"{h:02d}-{(e + 1) % 24:02d}")
    return "+".join(runs)


def main():
    masks, kw, ext = load()
    n = len(masks)
    shipped = masks.tolist().index(list(window(1, 14)))
    ok = {tol: (ext[:, 0] >= MIN_PRESSURE_M) & (ext[:, 1] >= TANK_MARGIN_M) & (np.abs(ext[:, 2]) <= tol * ext[:, 3]) for tol in (0.01, 0.001)}
    one_run = np.array([nruns(m) <= 1 for m in masks])
    kwh = kw.sum(axis=1) * 0.25
    print(f"== A. Set: {n} masks (<= 2 on-runs a day), 900 s step, last of 3 days scored")
    print(f"shipped (01-15): {kwh[shipped]:,.0f} kWh/day, peak {kw[shipped].max():.0f} kW, min pressure {ext[shipped, 0]:.1f} m, drift {ext[shipped, 2]:.0f} m3")
    for tol in ok:
        print(f"feasible at |drift| <= {tol * 100:g} % of demand: {int(ok[tol].sum())} of {n}; shipped feasible: {bool(ok[tol][shipped])}")
    for tol in ok:
        i = np.where(ok[tol])[0][np.argmin(kwh[ok[tol]])]
        print(f"least energy, tol {tol * 100:g} %: {label(masks[i])}, {kwh[i]:,.0f} kWh/day ({100 * (1 - kwh[i] / kwh[shipped]):.1f} % less), peak {kw[i].max():.0f} kW")

    for tol in (0.01, 0.001):
        print(f"\n== B. Monthly pumping bill ($, B-19 secondary, energy + demand charges), drift tolerance {tol * 100:g} %")
        print("season | schedule | label | energy $ | demand $ | total $ | peak kW | peak-period kW | saving vs shipped %")
        tot = {"shipped": 0.0, "flat-energy opt": 0.0, "TOU-energy opt": 0.0, "full-bill opt": 0.0, "full-bill opt (1 run)": 0.0}
        for season, s in SEASONS.items():
            per = np.array(s["periods"])[np.arange(96) // 4]
            bills = np.array([month_bill(k, season) for k in kw])  # energy, demand
            full, en = bills.sum(axis=1), bills[:, 0]
            flat = kwh.copy()
            cands = [("shipped", shipped),
                     ("flat-energy opt", np.where(ok[tol])[0][np.argmin(flat[ok[tol]])]),
                     ("TOU-energy opt", np.where(ok[tol])[0][np.argmin(en[ok[tol]])]),
                     ("full-bill opt", np.where(ok[tol])[0][np.argmin(full[ok[tol]])])]
            sel1 = ok[tol] & one_run
            cands.append(("full-bill opt (1 run)", np.where(sel1)[0][np.argmin(full[sel1])]))
            for name, i in cands:
                pk = kw[i][per == "P"].max()
                print(f"{season} | {name} | {label(masks[i])} | {bills[i, 0]:,.0f} | {bills[i, 1]:,.0f} | {full[i]:,.0f} | {kw[i].max():.0f} | {abs(pk):.0f} | {100 * (1 - full[i] / full[shipped]):.1f}")
                tot[name] += full[i] * s["months"]
        print("annual (12 months, each season's own schedule): " + "; ".join(f"{k} ${v:,.0f}" for k, v in tot.items()))
        print("annual saving vs shipped %: " + "; ".join(f"{k} {100 * (1 - v / tot['shipped']):.1f}" for k, v in tot.items() if k != "shipped"))

    print("\n== C. What the demand charge changes (drift tolerance 0.1 %)")
    print("season | energy-only optimum billed in full vs full-bill optimum: extra $/month | demand share of the shipped bill %")
    tol = 0.001
    for season in SEASONS:
        bills = np.array([month_bill(k, season) for k in kw])
        full, en = bills.sum(axis=1), bills[:, 0]
        i_en = np.where(ok[tol])[0][np.argmin(en[ok[tol]])]
        i_fu = np.where(ok[tol])[0][np.argmin(full[ok[tol]])]
        print(f"{season} | {full[i_en] - full[i_fu]:,.0f} ({100 * (full[i_en] / full[i_fu] - 1):.1f} %) | {100 * bills[shipped, 1] / full[shipped]:.0f}")

    print("\n== E. Does the choice survive other demand-charge sizes? (summer, drift 0.1 %; demand rates x a multiplier)")
    print("multiplier | full-bill optimum | its peak kW | energy-only optimum billed in full: extra % | saving of full-bill optimum vs shipped %")
    tol = 0.001
    base = dict(SEASONS["summer"]["demand"])
    for mult in (0, 0.5, 1, 2, 5, 20):
        for k in base:
            SEASONS["summer"]["demand"][k] = base[k] * mult
        bills = np.array([month_bill(k, "summer") for k in kw])
        full, en = bills.sum(axis=1), bills[:, 0]
        i_fu = np.where(ok[tol])[0][np.argmin(full[ok[tol]])]
        i_en = np.where(ok[tol])[0][np.argmin(en[ok[tol]])]
        print(f"x{mult:g} | {label(masks[i_fu])} | {kw[i_fu].max():.0f} | {100 * (full[i_en] / full[i_fu] - 1):.2f} | {100 * (1 - full[i_fu] / full[shipped]):.1f}")
    for k in base:
        SEASONS["summer"]["demand"][k] = base[k]

    print("\n== D. Peak-demand floor: lowest feasible peak kW over all masks (drift 0.1 %) and the energy it costs")
    i = np.where(ok[0.001])[0][np.argmin(kw[ok[0.001]].max(axis=1))]
    print(f"lowest peak {kw[i].max():.0f} kW at {label(masks[i])}: {kwh[i]:,.0f} kWh/day; shipped peak {kw[shipped].max():.0f} kW")
    print(f"DAYS_PER_MONTH {DAYS_PER_MONTH:.3f}")


if __name__ == "__main__":
    main()
