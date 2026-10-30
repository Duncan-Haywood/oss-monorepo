"""Milestone 4 (first pass): H5, does load-sensing's extra parts cost repay in fuel within 2,000 h?

Energy: the 2g idle model (idle_models.py), at the measured load factor 0.346, but returning absolute mean shaft power
(cycle shaft joules over work plus idle time) for open-centre and load-sensing, so the saving is kW. p_n swept (8, 20,
40 bar), q_sb 2 L/min. Fuel: brake-specific consumption 250 g/kWh at the engine (ASSUMED typical diesel figure, not
opened) at 0.84 kg/L = 0.298 L/kWh, applied to pump shaft power (drivetrain ignored). Diesel $6.28/US gal (EIA weekly
US on-highway average, week to 2026-10-19, read from a secondary news summary, not EIA directly), swept $3 to $7.
Parts (public retail listings, 2026-10-29): see PARTS. The load-sensing valve has NO public price found (Danfoss and
Walvoil quote on request), so its premium over the open-centre monoblock is swept 1x to 5x.
"""
import io, contextlib, os, random, statistics, sys
here = os.path.dirname(__file__)
sys.argv = [sys.argv[0]]
with contextlib.redirect_stdout(io.StringIO()):
    sys.path.insert(0, here)
    import physics_cycle as pc
from heavy_hydraulics import cycle_energy
from heavy_hydraulics.circuits import W_PER_BAR_LPM
from idle_sensitivity import useful_power

ETA, DP_SPOOL, DP_LS, LF, Q_SB = 0.883, 6.0, 25.0, 0.346, 2.0
L_PER_KWH = 0.250 / 0.84
GAL = 3.78541
PARTS = {  # USD
    "gear pump 28 cc (Hydraulic Megastore UK, GBP 113.40 ex VAT; x1.30 USD/GBP assumed)": 113.40 * 1.30,
    "load-sensing piston pump 28 cc (Kawasaki K3VL28, OneHydraulics sale)": 1707.99,
    "open-centre 3-section monoblock valve (Youli MB-3, OneHydraulics sale)": 342.99,
}
PUMP_PREMIUM = 1707.99 - 113.40 * 1.30

def powers(p_n, n_per_seed=500):
    d = []
    for s in pc.SEEDS:
        for i in range(n_per_seed):
            rng = random.Random(s * 7919 + i)
            c, _, _, dpm = pc.one(rng)
            peak = max(useful_power(p) for p in c)
            t_work = sum(p.seconds for p in c)
            e = sum(useful_power(p) * p.seconds for p in c)
            t_idle = max(0.0, e / (LF * peak) - t_work)
            p_i, q_i = rng.uniform(10, 25), rng.uniform(2, 8)
            kw = dict(pump_flow=pc.Q_PUMP, dp_spool=DP_SPOOL, dp_ls=DP_LS, dp_m=dpm, eta_pump=ETA)
            oc = cycle_energy(c, "open_centre", **kw)["shaft_J"] + pc.Q_PUMP * p_n * W_PER_BAR_LPM * t_idle / ETA
            ls = cycle_energy(c, "load_sensing", **kw)["shaft_J"] + (q_i * (p_i + DP_LS) + Q_SB * DP_LS) * W_PER_BAR_LPM * t_idle / ETA
            T = t_work + t_idle
            d.append((oc / T / 1000, ls / T / 1000))
    return statistics.mean(x for x, _ in d), statistics.mean(y for _, y in d)

if __name__ == "__main__":
    print("parts (USD):")
    for k, v in PARTS.items(): print(f"  {v:8.2f}  {k}")
    print(f"pump premium {PUMP_PREMIUM:.0f} USD; valve premium = (m-1) x 343 for LS valve at m x the monoblock price\n")
    print("mean shaft power, kW (open-centre, load-sensing), LF 0.346, q_sb 2 L/min; saving; fuel L per working hour")
    rows = {}
    for p_n in (8.0, 20.0, 40.0):
        oc, ls = powers(p_n)
        rows[p_n] = oc - ls
        print(f"  p_n {p_n:4.0f} bar: OC {oc:.2f}, LS {ls:.2f}, saving {oc-ls:+.2f} kW = {(oc-ls)*L_PER_KWH:+.3f} L/h")
    print("\npayback hours = premium / (saving kW x 0.298 L/kWh x $/L); 'never' if saving <= 0; H5 limit 2,000 h")
    for price in (3.0, 6.28, 7.0):
        usd_l = price / GAL
        print(f"\ndiesel ${price:.2f}/gal (${usd_l:.2f}/L)")
        for m in (1, 2, 3, 5):
            prem = PUMP_PREMIUM + (m - 1) * 342.99
            cells = []
            for p_n, sv in rows.items():
                usd_h = sv * L_PER_KWH * usd_l
                cells.append("never" if usd_h <= 0 else f"{prem/usd_h:,.0f} h")
            print(f"  LS valve {m}x monoblock (premium ${prem:,.0f}): p_n 8: {cells[0]:>9} | 20: {cells[1]:>9} | 40: {cells[2]:>9}")
