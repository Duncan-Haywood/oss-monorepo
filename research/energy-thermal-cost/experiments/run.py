"""Write experiments/results.txt: levelised cost of heat from a sand or water store against a heat pump.

    PYTHONPATH=src:../energy-thermal/src python experiments/run.py      # a few minutes; deterministic

Costs, lifetimes, O&M and efficiencies come from data/params.csv (PyPSA technology-data, pinned
revisions). Not from a source (set below, swept in section C): the electricity prices, the 2,000
full-load hours, the 0.5 m insulation, the 4% discount rate (it is the table's own value, but a
policy choice), charging over a quarter of the cycle, and the cycle counts.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent / "src"), str(HERE.parents[1] / "energy-thermal" / "src")]
from energy_thermal_cost import load, units, store_lcoh, hp_lcoh, resistive_lcoh, breakeven_hp_price  # noqa: E402

OUT = HERE / "results.txt"
P_C = 0.05                                   # EUR/kWh paid by the store (cheap hours); assumed, swept
SCALES = {"house": 1.0e4, "district": 5.0e6}  # annual heat delivered, kWh (house: a winter's 10 MWh)
CASES = [(1, 300, "daily"), (7, 52, "weekly"), (30, 12, "monthly"), (120, 1, "seasonal")]
lines = []


def out(s=""):
    lines.append(s)


td = load("head_2030")
out("A. Sourced inputs (PyPSA technology-data, commit 65244b4c, cost year 2030; v0.9.2 in section C). Currency years as in the table.")
out("%-34s %10s %-16s %8s %7s %5s" % ("technology", "investment", "unit", "FOM_%/yr", "life_yr", "eff"))
for name in ("Sand-store", "Sand-charger", "decentral water tank storage", "central water tank storage",
             "decentral air-sourced heat pump", "central air-sourced heat pump",
             "decentral resistive heater", "central resistive heater"):
    t = td[name]
    unit = units()[name]
    out("%-34s %10.1f %-16s %8.2f %7.0f %5s" % (name, t["investment"], unit, t["FOM"], t["lifetime"],
                                                 "%.2f" % t["efficiency"] if "efficiency" in t else "-"))
out()

out("B. Levelised cost of heat (EUR/kWh), store charged at %.2f EUR/kWh. hp = heat pump at the same price; hp_needed = price the heat pump may pay" % P_C)
out("before it costs as much as the store; ratio = hp_needed / %.2f (how many times dearer than the store's electricity)." % P_C)
out("%-9s %-9s %-6s %7s %8s %8s %8s %7s %7s %8s %7s" % ("scale", "case", "store", "V_m3", "out/in", "cap", "energy", "total", "hp", "hp_needed", "ratio"))
base = {}
for scale, q in SCALES.items():
    hp_cap, hp_en = hp_lcoh(td, scale, q, P_C)
    cop = td["decentral air-sourced heat pump" if scale == "house" else "central air-sourced heat pump"]["efficiency"]
    for s, n, name in CASES:
        for kind in ("sand", "water"):
            r = store_lcoh(td, kind, scale, q, n, s, P_C)
            need = breakeven_hp_price(r["total"], hp_cap, cop)
            base[(scale, name, kind)] = r
            out("%-9s %-9s %-6s %7.1f %8.2f %8.3f %8.3f %7.3f %7.3f %8.3f %7.1f" % (
                scale, name, kind, r["volume_m3"], r["delivered_per_in"], r["store_cap"] + r["charger_cap"],
                r["energy"], r["total"], hp_cap + hp_en, need, need / P_C))
    rc, re_ = resistive_lcoh(td, scale, q, P_C)
    out("%-9s resistive heater, no store: %.3f EUR/kWh at %.2f" % (scale, rc + re_, P_C))
out()

out("F. Water store at house size on the older v0.9.2 costs (decentral tank EUR 19.4/kWh in 2015 euros, against EUR 527.9/kWh in the 2025 table), store price %.2f." % P_C)
out("%-9s %-9s %7s %8s %8s %8s" % ("scale", "case", "V_m3", "total", "hp", "ratio"))
t92 = load("v092_2030")
for s, n, name in CASES:
    r = store_lcoh(t92, "water", "house", SCALES["house"], n, s, P_C)
    hc, he = hp_lcoh(t92, "house", SCALES["house"], P_C)
    out("%-9s %-9s %7.1f %8.3f %8.3f %8.1f" % ("house", name, r["volume_m3"], r["total"], hc + he,
                                                  breakeven_hp_price(r["total"], hc, t92["decentral air-sourced heat pump"]["efficiency"]) / P_C))
out()

out("C. Sensitivity of the price ratio (hp_needed / store price) for the sand store. Rows change one input from the base (disc 4%, head_2030 costs,")
out("2000 full-load hours, 0.5 m wool, store price %.2f, store cost x1)." % P_C)
out("%-34s %10s %10s %10s %10s" % ("change", "house_1d", "house_7d", "dist_30d", "dist_120d"))
PROBES = (("house", 300, 1), ("house", 52, 7), ("district", 12, 30), ("district", 1, 120))


def ratio_row(label, basis="head_2030", rate=0.04, flh=2000.0, ins=0.5, scale_cost=1.0, pc=P_C, cop=None):
    t = load(basis) if basis != "head_2030" else td
    cells = []
    for sc, n, s in PROBES:
        q = SCALES[sc]
        hp_cap, _ = hp_lcoh(t, sc, q, pc, rate, flh)
        c = cop or t["decentral air-sourced heat pump" if sc == "house" else "central air-sourced heat pump"]["efficiency"]
        sc_cost = scale_cost if sc == "house" else 1.0
        r = store_lcoh(t, "sand", sc, q, n, s, pc, rate, ins, sc_cost)
        cells.append(breakeven_hp_price(r["total"], hp_cap, c) / pc)
    out("%-34s %10.1f %10.1f %10.1f %10.1f" % ((label,) + tuple(cells)))


ratio_row("base")
ratio_row("costs v0.9.2 (2015/2020 euros)", basis="v092_2030")
for r_ in (0.02, 0.08):
    ratio_row("discount rate %d%%" % round(r_ * 100), rate=r_)
for f in (1000.0, 3000.0):
    ratio_row("heat pump full-load hours %d" % f, flh=f)
for c in (2.5, 4.5):
    ratio_row("heat pump COP %.1f (table 3.6/3.2)" % c, cop=c)
for i in (0.25, 1.0):
    ratio_row("insulation %.2f m" % i, ins=i)
for k in (0.5, 3.0, 10.0):
    ratio_row("house store cost x%g (district unchanged)" % k, scale_cost=k)
for pc in (0.02, 0.10):
    ratio_row("store electricity %.2f EUR/kWh" % pc, pc=pc)
out()

out("D. Longest standby at which the sand store still costs no more than a heat pump whose electricity is `ratio` times dearer (store price %.2f)." % P_C)
out("Cycles per year N = min(300, 365 / standby days). Standby grid: 0.5 1 2 3 5 7 10 14 21 30 45 60 90 120 days. '0' means it loses even at 0.5 days.")
GRID = (0.5, 1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90, 120)
out("%-9s %6s %12s" % ("scale", "ratio", "longest_days"))
for scale, q in SCALES.items():
    hp_cap, _ = hp_lcoh(td, scale, q, P_C)
    cop = td["decentral air-sourced heat pump" if scale == "house" else "central air-sourced heat pump"]["efficiency"]
    for ratio in (1.5, 2, 3, 5, 10):
        best = 0
        for s in GRID:
            r = store_lcoh(td, "sand", scale, q, min(300, 365 / s), s, P_C)
            if r and r["total"] <= hp_cap + ratio * P_C / cop:
                best = s
        out("%-9s %6.1f %12s" % (scale, ratio, best))
out()

out("E. Ratio against standby for the figure (sand, N = min(300, 365 / days), store price %.2f)." % P_C)
out("%-9s %8s %8s" % ("scale", "days", "ratio"))
for scale, q in SCALES.items():
    hp_cap, _ = hp_lcoh(td, scale, q, P_C)
    cop = td["decentral air-sourced heat pump" if scale == "house" else "central air-sourced heat pump"]["efficiency"]
    for s in GRID:
        r = store_lcoh(td, "sand", scale, q, min(300, 365 / s), s, P_C)
        out("%-9s %8.1f %8.2f" % (scale, s, breakeven_hp_price(r["total"], hp_cap, cop) / P_C))
OUT.write_text("\n".join(lines) + "\n")
print("\n".join(lines))
