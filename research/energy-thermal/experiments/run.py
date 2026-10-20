"""Write experiments/results.txt: sand and water heat stores as transient models.

    PYTHONPATH=src python experiments/run.py      # about a minute; deterministic

Every input is assumed (typical values, not checked against a primary source) and is set below.
"""
from pathlib import Path
from energy_thermal import (Store, SAND, WATER, INSULATION, Medium, size_for_delivery, heat_pump_cop)

OUT = Path(__file__).resolve().parent / "results.txt"
T_AMB = 10.0
SAND_HOT, SAND_CUT = 500.0, 100.0      # C: charge temperature; lowest mean temperature that still heats a hydronic loop
WATER_HOT, WATER_CUT = 90.0, 40.0
HOUSE_KWH = 10000.0                    # heat the store must still be able to give after standby (a winter's share)
HP_SINK, HP_SOURCE = 35.0, 0.0         # C: hydronic floor heating, winter air; Carnot fraction 0.45 (assumed)
# Mineral wool conducts less when cooler: 0.045 W/mK at water-tank temperatures, 0.08 as a hot-side
# average at sand temperatures (both assumed).
INS = {"sand": INSULATION, "water": Medium("mineral wool, cool side", 100.0, 840.0, 0.045)}
lines = []


def out(s=""):
    lines.append(s)


def tag_of(medium):
    return "sand" if medium is SAND else "water"


def kept(medium, v, ins, days, hot, cut):
    s = Store(medium, v, ins, insulation=INS[tag_of(medium)], t_amb=T_AMB)
    s.charge(hot)
    full = s.usable_kwh(cut)
    s.run(days)
    return full, s.usable_kwh(cut), s


out("A. Heat held per cubic metre and per tonne, charged to the top temperature, usable down to the cut-off.")
out("%-28s %10s %10s %10s" % ("store", "kWh/m3", "kWh/t", "kg/m3"))
for name, m, hot, cut in (("sand 500 -> 100 C", SAND, SAND_HOT, SAND_CUT), ("water 90 -> 40 C", WATER, WATER_HOT, WATER_CUT)):
    e = m.rho * m.c * (hot - cut) / 3.6e6
    out("%-28s %10.1f %10.1f %10.0f" % (name, e, e / m.rho * 1000, m.rho))
out()

out("B. Share of the usable heat left after standby (sphere, mineral-wool insulation, ambient 10 C). Rows: store volume.")
out("%-8s %-8s %8s %8s %8s %8s %12s" % ("medium", "ins_m", "V_m3", "30d_%", "90d_%", "180d_%", "tau_days"))
for medium, hot, cut, tag in ((SAND, SAND_HOT, SAND_CUT, "sand"), (WATER, WATER_HOT, WATER_CUT, "water")):
    for ins in (0.25, 0.5, 1.0):
        for v in (1, 10, 100, 1000):
            row = []
            for d in (30, 90, 180):
                full, left, s = kept(medium, v, ins, d, hot, cut)
                row.append(100 * left / full)
            cap = sum(s.cap[:s.n_med])
            tau = cap / s.ua() / 86400
            out("%-8s %-8.2f %8d %8.1f %8.1f %8.1f %12.1f" % (tag, ins, v, row[0], row[1], row[2], tau))
out()

out("C. Store sized to still give %d kWh of heat after 120 days of standby (charged to the top temperature)." % HOUSE_KWH)
out("%-8s %-8s %10s %10s %12s %10s" % ("medium", "ins_m", "V_m3", "diam_m", "charge_kWh", "ideal_V_m3"))
sized = {}
for medium, hot, cut, tag in ((SAND, SAND_HOT, SAND_CUT, "sand"), (WATER, WATER_HOT, WATER_CUT, "water")):
    ideal = HOUSE_KWH / (medium.rho * medium.c * (hot - cut) / 3.6e6)
    for ins in (0.25, 0.5, 1.0):
        v, s = size_for_delivery(medium, HOUSE_KWH, 120, hot, cut, ins, insulation=INS[tag], t_amb=T_AMB)
        charge = v * medium.rho * medium.c * (hot - T_AMB) / 3.6e6
        sized[(tag, ins)] = (v, charge)
        out("%-8s %-8.2f %10.1f %10.1f %12.0f %10.1f" % (tag, ins, v, 2 * s.r_med, charge, ideal))
out()

cop = heat_pump_cop(HP_SINK, HP_SOURCE)
out("D. Resistance-charged store against a heat pump, per kWh of heat delivered (heat pump COP %.2f at %.0f C sink, %.0f C source, Carnot fraction 0.45, assumed)." % (cop, HP_SINK, HP_SOURCE))
out("%-8s %-8s %14s %16s %18s" % ("medium", "ins_m", "delivered/in", "kWh_el_per_kWh", "price_ratio_needed"))
for (tag, ins), (v, charge) in sized.items():
    eta = HOUSE_KWH / charge
    # store buys at p_low, heat pump at p_high: store is cheaper when p_low/eta < p_high/cop, i.e. p_high/p_low > cop/eta
    out("%-8s %-8.2f %14.3f %16.2f %18.2f" % (tag, ins, eta, 1 / eta, cop / eta))
out("(price_ratio_needed: how many times dearer the heat pump's electricity must be than the store's for the store to cost less per kWh of heat, before any capital cost.)")
out()

out("E. The same 10 MWh store (0.5 m insulation) against how long it stands before use: heat delivered per kWh put in.")
out("%-8s %8s %10s %14s" % ("medium", "days", "V_m3", "delivered/in"))
for medium, hot, cut, tag in ((SAND, SAND_HOT, SAND_CUT, "sand"), (WATER, WATER_HOT, WATER_CUT, "water")):
    for days in (1, 7, 30, 120):
        v, s = size_for_delivery(medium, HOUSE_KWH, days, hot, cut, 0.5, insulation=INS[tag], t_amb=T_AMB)
        out("%-8s %8d %10.1f %14.3f" % (tag, days, v, HOUSE_KWH / (v * medium.rho * medium.c * (hot - T_AMB) / 3.6e6)))
OUT.write_text("\n".join(lines) + "\n")
print("\n".join(lines))
