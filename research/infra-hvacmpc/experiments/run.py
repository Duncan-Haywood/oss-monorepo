"""Run every experiment; print the tables that become results.txt.   python experiments/run.py > experiments/results.txt"""
import sys
from dataclasses import replace
from multiprocessing import Pool
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from infra_hvacmpc import (Params, load_weather, thermostat_year, mpc_year, cop_heat, cop_cool,  # noqa: E402
                           TOU_PRICES, FLAT_PRICES, scaled_tou)

NOM = Params()
SITES = ("greensboro-nc", "sand-point-ak")
# the true house differs from the controller's model: leakier, lighter, sunnier, a worse cooling COP
PLANT = replace(NOM, ua_opaque=NOM.ua_opaque * 1.15, ua_inf=NOM.ua_inf * 1.3, ci=NOM.ci * 0.7,
                ce=NOM.ce * 1.4, solar_area=NOM.solar_area * 1.3, eta_cool=NOM.eta_cool * 0.85)


def job(a):
    kind, site, plant, model, prices, kw = a
    to, g = load_weather(site)
    if kind == "th":
        r = thermostat_year(plant, to, g, prices, **kw)
    else:
        r = mpc_year(plant, model, to, g, prices, **kw)
    return dict(cost=float(r["cost"]), kwh=float(r["kwh"]), disc=float(r["disc"]))


def fmt(r):
    return f"{r['cost']:8.0f} {r['kwh']:8.0f} {r['disc']:8.0f}"


def main():
    with Pool(4) as pool:
        print("== 0. Checks")
        for s in SITES:
            to, g = load_weather(s)
            print(f"{s}: mean T {to.mean():.1f} C, min {to.min():.1f}, heating degree-days base 18 C {np.maximum(18 - to, 0).sum() / 24:.0f} "
                  f"({np.maximum(18 - to, 0).sum() / 24 * 1.8:.0f} degF-days), annual GHI {g.sum() / 1000:.0f} kWh/m2")
        print(f"heating COP at -10, 0, 7 C: {cop_heat(-10):.2f} {cop_heat(0):.2f} {cop_heat(7):.2f}; cooling COP at 25, 35 C: {cop_cool(25):.2f} {cop_cool(35):.2f}")

        # A: headline, full year, assumed TOU tariff and flat
        rows = []
        for s in SITES:
            for pn, pr in (("TOU", TOU_PRICES), ("flat", FLAT_PRICES)):
                rows += [("th", s, PLANT, None, pr, dict(sp_heat=21.0, sp_cool=24.0, kp=500.0, ki=150.0)),
                         ("th", s, PLANT, None, pr, dict(sp_heat=20.0, sp_cool=24.0, kp=500.0, ki=150.0)),
                         ("mpc", s, PLANT, PLANT, pr, dict(forecast="perfect")),
                         ("mpc", s, PLANT, NOM, pr, dict(forecast="persistence")),
                         ("mpc", s, PLANT, NOM, pr, dict(forecast="perfect"))]
        out = pool.map(job, rows)
        print("\n== A. Full year, comfort band 20-24 C, cost ($), electricity (kWh), discomfort (K h outside the band)")
        print("site tariff controller | cost kWh disc")
        names = ["thermostat 21/24", "thermostat 20/24", "MPC exact model, perfect fc", "MPC wrong model, persistence fc", "MPC wrong model, perfect fc"]
        for i, r in enumerate(rows):
            print(f"{r[1]:14s} {'TOU ' if r[4] is TOU_PRICES else 'flat'} {names[i % 5]:32s} | {fmt(out[i])}")

        # B: price ratio, Greensboro, wrong model + persistence vs thermostat 20/24
        ratios = (1, 2, 3, 4, 6)
        rows = []
        for ra in ratios:
            pr = scaled_tou(ra)
            rows += [("th", SITES[0], PLANT, None, pr, dict(sp_heat=20.0, sp_cool=24.0, kp=500.0, ki=150.0)),
                     ("mpc", SITES[0], PLANT, NOM, pr, dict(forecast="persistence"))]
        out = pool.map(job, rows)
        print("\n== B. Peak/off-peak price ratio (mean price kept), Greensboro, thermostat 20/24 vs MPC wrong model, persistence forecast")
        print("ratio | thermostat_cost MPC_cost saving_pct MPC_disc th_disc")
        for i, ra in enumerate(ratios):
            t, m = out[2 * i], out[2 * i + 1]
            print(f"{ra:5d} | {t['cost']:8.0f} {m['cost']:8.0f} {100 * (1 - m['cost'] / t['cost']):8.1f} {m['disc']:8.0f} {t['disc']:8.0f}")

        # C: thermal mass scale (both nodes), exact model, perfect forecast
        scales = (0.5, 1.0, 2.0, 4.0)
        rows = []
        for sc in scales:
            pl = replace(NOM, ci=NOM.ci * sc, ce=NOM.ce * sc)
            rows += [("th", SITES[0], pl, None, TOU_PRICES, dict(sp_heat=20.0, sp_cool=24.0, kp=500.0, ki=150.0)),
                     ("mpc", SITES[0], pl, pl, TOU_PRICES, dict(forecast="perfect"))]
        out = pool.map(job, rows)
        print("\n== C. Thermal mass x scale (Ci, Ce), Greensboro, exact model, perfect forecast, TOU")
        print("scale | thermostat_cost MPC_cost saving_pct")
        for i, sc in enumerate(scales):
            t, m = out[2 * i], out[2 * i + 1]
            print(f"{sc:5.1f} | {t['cost']:8.0f} {m['cost']:8.0f} {100 * (1 - m['cost'] / t['cost']):8.1f}")

        # D: forecast noise on outdoor temperature, wrong model
        noises = (0.0, 1.0, 2.0, 4.0, 8.0)
        rows = [("mpc", SITES[0], PLANT, NOM, TOU_PRICES, dict(forecast="noise", noise=nz, seed=1)) for nz in noises]
        rows.append(("th", SITES[0], PLANT, None, TOU_PRICES, dict(sp_heat=20.0, sp_cool=24.0, kp=500.0, ki=150.0)))
        out = pool.map(job, rows)
        print("\n== D. Weather-forecast error (sd of To, K; gains error 0.3x that, relative), Greensboro, wrong model, TOU")
        print("sd_K | MPC_cost saving_pct_vs_thermostat_20/24 disc")
        for i, nz in enumerate(noises):
            m = out[i]
            print(f"{nz:4.1f} | {m['cost']:8.0f} {100 * (1 - m['cost'] / out[-1]['cost']):8.1f} {m['disc']:8.0f}")

        # E: how wrong the model can be (leak scale of the plant, controller model nominal), persistence forecast
        leaks = (0.7, 0.85, 1.0, 1.15, 1.3, 1.6)
        rows = []
        for lk in leaks:
            pl = replace(NOM, ua_opaque=NOM.ua_opaque * lk, ua_inf=NOM.ua_inf * lk, ua_window=NOM.ua_window * lk)
            rows += [("th", SITES[0], pl, None, TOU_PRICES, dict(sp_heat=20.0, sp_cool=24.0, kp=500.0, ki=150.0)),
                     ("mpc", SITES[0], pl, NOM, TOU_PRICES, dict(forecast="persistence"))]
        out = pool.map(job, rows)
        print("\n== E. True heat-loss coefficient x scale, controller keeps the nominal one, Greensboro, persistence forecast, TOU")
        print("scale | thermostat_cost MPC_cost saving_pct MPC_disc th_disc")
        for i, lk in enumerate(leaks):
            t, m = out[2 * i], out[2 * i + 1]
            print(f"{lk:5.2f} | {t['cost']:8.0f} {m['cost']:8.0f} {100 * (1 - m['cost'] / t['cost']):8.1f} {m['disc']:8.0f} {t['disc']:8.0f}")


def section_f():
    """Thermostat set-points inside the band (cheap: no LP). Appended to results.txt by `python experiments/run.py F`."""
    to, g = load_weather(SITES[0])
    print("\n== F. Thermostat set-points (heat/cool), Greensboro, TOU, wrong plant: where the discomfort of section A comes from")
    print("heat cool | cost kwh disc_Kh")
    for sh, sc in ((20.0, 24.0), (20.5, 23.5), (21.0, 23.0), (21.0, 24.0), (21.5, 22.5)):
        r = thermostat_year(PLANT, to, g, TOU_PRICES, sp_heat=sh, sp_cool=sc, kp=500.0, ki=150.0)
        print(f"{sh:4.1f} {sc:4.1f} | {fmt(r)}")


if __name__ == "__main__":
    if sys.argv[1:] == ["F"]:
        section_f()
    else:
        main()
        section_f()
