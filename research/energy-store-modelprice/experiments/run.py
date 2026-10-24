"""Does the store-vs-heat-pump verdict of energy-thermal-real survive a modelled price?

    python experiments/run.py > experiments/results.txt        # about 20 s, stdlib only

Each held-out year's price is modelled by the residual-load isotonic fit of energy-price-residual trained on the other
four years (leave-one-year-out). Planning price = the electricity prices an analyst would feed the cost model;
executed price = the store picks its charge hours by the modelled series but pays the real price in those hours.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from energy_store_modelprice import (price_sources, executed_cheapest_mean, case_costs, verdict, CASES, SCALES, YEARS)  # noqa: E402
from energy_thermal_hourly import cheapest_mean, heating_season_mean, load_year  # noqa: E402

SRC = {y: price_sources(y) for y in YEARS}
ROWS = {y: load_year(y) for y in YEARS}
HP = {(y, k): heating_season_mean(SRC[y][k], ROWS[y]) for y in YEARS for k in SRC[y]}
NAMES = ("real", "resid", "resid+", "merit")
lines = []
def out(s=""):
    lines.append(s)


def diff(y, k, scale, case):
    sp = cheapest_mean(SRC[y][k], case[2], 0.25)
    st, hp = case_costs(sp, HP[(y, k)], scale, case)
    return st - hp, sp


out("A. Price the store pays (cheapest quarter of each cycle window) and the heat pump pays (Nov-Mar mean), EUR/kWh, by price source.")
out("   real = OPSD/ENTSO-E; resid = isotonic residual-load fit on the other 4 years; resid+ = resid with the held-out mean added back (oracle); merit = flat 0.0546.")
out("%-5s %-8s %9s %9s %9s %9s" % ("year", "source", "q_daily", "q_weekly", "hp_p", "mean"))
for y in YEARS:
    for k in NAMES:
        s = SRC[y][k]
        out("%-5d %-8s %9.4f %9.4f %9.4f %9.4f" % (y, k, cheapest_mean(s, 365, .25), cheapest_mean(s, 52, .25), HP[(y, k)], sum(s) / len(s)))
out()

out("B. diff = store - heat pump cost of heat (EUR/kWh; negative: the store wins), house scale, by price source. verdict: S store, P pump, T tie (|diff| <= 0.002).")
out("%-9s %-5s" % ("case", "year") + "".join(" %9s %2s" % (k, "v") for k in NAMES))
agree = {k: 0 for k in NAMES}
tot = 0
for scale in SCALES:
    for case in CASES:
        for y in YEARS:
            dv = {k: diff(y, k, scale, case)[0] for k in NAMES}
            vv = {k: verdict(dv[k], 0.0) for k in NAMES}
            tot += 1
            for k in NAMES:
                agree[k] += verdict(dv[k], 0.0) == verdict(dv["real"], 0.0)
            if scale == "house":
                out("%-9s %-5d" % (case[3], y) + "".join(" %+9.3f %2s" % (dv[k], vv[k][0].upper()) for k in NAMES))
out()
out("C. Verdict agreement with the real-price verdict (tie band 0.002 EUR/kWh), all cases x years, house and district scale (%d cells)." % tot)
for k in NAMES[1:]:
    out("%-8s %3d/%d" % (k, agree[k], tot))
out()

out("D. Executed charging: the store picks its charge hours by the modelled series and pays the real price in them (house scale).")
out("   exec_p = real price actually paid; best_p = real cheapest-quarter mean (perfect foresight); gap = exec_p - best_p; diff* = store - pump with exec_p and the real heat-pump price.")
out("%-8s %-9s %-5s %8s %8s %8s %8s %8s" % ("plan", "case", "year", "exec_p", "best_p", "gap", "diff*", "diff_real"))
gaps = {}
for k in ("resid", "resid+", "merit"):
    for case in CASES[:2]:
        for y in YEARS:
            real = SRC[y]["real"]
            ep = executed_cheapest_mean(SRC[y][k], real, case[2], 0.25)
            bp = cheapest_mean(real, case[2], 0.25)
            st, hp = case_costs(ep, HP[(y, "real")], "house", case)
            dreal = diff(y, "real", "house", case)[0]
            gaps.setdefault((k, case[3]), []).append(ep - bp)
            out("%-8s %-9s %-5d %8.4f %8.4f %+8.4f %+8.3f %+8.3f" % (k, case[3], y, ep, bp, ep - bp, st - hp, dreal))
out()
out("E. Mean gap exec_p - best_p over the five years (EUR/kWh).")
for (k, c), g in gaps.items():
    out("%-8s %-9s %+8.4f" % (k, c, sum(g) / len(g)))
out()

out("F. Break-even electricity price for the store (EUR/kWh) from the real, residual and flat series' heat-pump price, house daily.")
out("%-5s %9s %9s %9s %9s" % ("year", "bepr_real", "bepr_resid", "q_real", "q_resid"))
for y in YEARS:
    def be(k):
        c0 = case_costs(0.0, HP[(y, k)], "house", CASES[0])
        c1 = case_costs(0.1, HP[(y, k)], "house", CASES[0])
        return (c0[1] - c0[0]) / ((c1[0] - c0[0]) / 0.1)
    out("%-5d %9.4f %9.4f %9.4f %9.4f" % (y, be("real"), be("resid"), cheapest_mean(SRC[y]["real"], 365, .25), cheapest_mean(SRC[y]["resid"], 365, .25)))

out()
out("G. Verdict agreement with real by scale and case (resid / resid+ / merit, cells out of 5 years), and the weekly house diff series for the figure.")
for scale in SCALES:
    for case in CASES:
        a = {k: 0 for k in NAMES[1:]}
        for y in YEARS:
            dr = diff(y, "real", scale, case)[0]
            for k in a:
                a[k] += verdict(diff(y, k, scale, case)[0], 0.0) == verdict(dr, 0.0)
        out("%-9s %-9s %d/5 %d/5 %d/5" % (scale, case[3], a["resid"], a["resid+"], a["merit"]))
out()
out("H. House weekly diff = store - heat pump (EUR/kWh) by year, by price source.")
out("%-5s %9s %9s %9s" % ("year", "real", "resid", "resid+"))
for y in YEARS:
    out("%-5d %+9.4f %+9.4f %+9.4f" % (y, *(diff(y, k, "house", CASES[1])[0] for k in ("real", "resid", "resid+"))))

(HERE / "results.txt").write_text("\n".join(lines) + "\n")
print("\n".join(lines))
