"""Milestone 6b: what electrical supply and pack inventory does a hub need for the cargo VTOL's own pack?

Predictions (written before the first run):
 (1) the 100 kg-payload, 250 Wh/kg battery aircraft sized by vtol_sizing/run.py at 100 km needs a pack of
     50 to 200 kWh (usable energy per flight 70% of it), so a 1C charger is 50 to 200 kW per pack.
 (2) with 8 chargers at 1C (charge window 20% to 90%, 42 min), the hub's flat-out grid demand is above 0.4 MW
     and the spare-pack inventory (3 x chargers, from milestone 6) is above 1 MWh and above 3 t of cells.
 (3) the 1C hub saturates at 8 x 3600 / (42 min x 60) = 11.4 flights/h irrespective of pack size:
     scaling pack energy changes grid power and inventory mass, not flights per hour per charger.
Inputs: sizing model of vtol_sizing/run.py (assumed, swept there); charge window 20 to 90% (DJI Dock 2, milestone 6);
C-rate is swept (0.5, 1, 2), not sourced for a 100 kWh pack. Charge taper ignored (optimistic).
"""
import math, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "vtol_sizing"))
from run import fractions, mtow

P, E_CELL, KPACK = 100.0, 250.0, 0.7
USE, CHARGERS, SPARES_PER = 0.7, 8, 3

print("Milestone 6b: hub supply and pack inventory for the sized cargo VTOL (payload 100 kg, 250 Wh/kg cell)")
print("\nrange km | MTOW kg | pack kWh | pack mass kg | per-flight kWh")
rows = {}
for Rkm in (25, 50, 100, 150):
    W = mtow(P, Rkm * 1e3, E_CELL)
    if W is None:
        print(f"{Rkm:8d} | does not close"); continue
    _, _, fe = fractions(Rkm * 1e3, E_CELL)
    mpack = fe * W
    kwh = mpack * E_CELL * KPACK / 1000
    rows[Rkm] = (W, kwh, mpack)
    print(f"{Rkm:8d} | {W:7.0f} | {kwh:8.1f} | {mpack:12.0f} | {kwh * USE:.1f}")

print("\nHub: 8 chargers, spares = 3 x chargers; grid demand with all chargers busy, flights/h at saturation")
print("range km C-rate | charge min | flights/h | charger kW | grid MW | spares MWh | spare cell t")
for Rkm, (W, kwh, mpack) in rows.items():
    for c in (0.5, 1.0, 2.0):
        tmin = USE / c * 60
        fph = CHARGERS * 60 / tmin
        kw = kwh * c
        grid = CHARGERS * kw / 1000
        spares = SPARES_PER * CHARGERS
        print(f"{Rkm:8d} {c:5.1f} | {tmin:10.1f} | {fph:9.1f} | {kw:10.0f} | {grid:7.2f} | {spares * kwh / 1000:10.2f} | {spares * mpack / 1000:12.2f}")

print("\nEnergy delivered per hour at saturation (MWh/h = average grid MW), 1C:")
for Rkm, (W, kwh, mpack) in rows.items():
    fph = CHARGERS * 60 / (USE * 60)
    print(f"{Rkm:4d} km: {fph:5.1f} flights/h x {kwh * USE:6.1f} kWh = {fph * kwh * USE / 1000:5.2f} MW")
