"""Milestone 6zn: where does foresight's distance edge come from, and does a sun-aware speed rule win it back?

Why: 6zl and 6zm left a foresight gap. The DP plan (F) covers 6 to 16% more km than the causal speed rule in every
latitude band, 5.7% more even within 20 degrees where no policy ever goes dark, and the 6zm log put it down to "the
timing of speed (spending on the sunny days)". Theory says that cannot be the whole story. The boat's electrical
load is convex in speed (drag rises faster than v), so for a fixed amount of propulsion energy the most distance comes
from spending it evenly (Jensen). Uneven, sun-following speed only pays when the alternative is losing energy: sun
that arrives while the pack is full (spilled, i.e. the MPPT curtails the panels) or charge left in the pack at the
end of the mission. So this step splits the gap between (F) and the causal rule into an energy term (how much
propulsion energy each policy gets to spend: harvest minus spill minus what is left in the pack) and a timing term
(km per unit of that energy against spending it evenly), and tests three speed rules aimed at each.

Data: as 6zk to 6zm (NASA POWER daily ALLSKY_SFC_SW_DWN, public domain; experiments/data/). No new data.

Rules (fixed in this docstring and committed before any policy below was run):
  Boat, pack (C = 10 kWh), hotel (30 W), harvest, daily step, launch full on 1 January, 30 points x 2015 to 2024
  (300 point-years), idle vehicle and excess dark hours: 6zj to 6zm, unchanged.
  Pack target for every causal rule: 6zm's picked variant, T = lead(max(0.5 C, Rc), 45 days) with Rc from 6zl's
  capacity-aware rule curve on the leave-one-year-out climatology (6zl's setting, so (F) and (Y) match 6zl).
  Causal speed rules, planned power p = f(d) + (SOC - T(d)) / 240 h, or the hotel load when f(d) < hotel:
    (L)  f = trailing 7-day mean harvest (6zm's rule; the baseline).
    (P)  f = yesterday's harvest (persistence forecast; causal).
    (O)  f = today's harvest (a perfect one-day-ahead forecast; not causal, the bound on any day-ahead forecast).
    (S)  (L) plus spill recapture: when the planned speed would leave more than C in the pack at the end of the day,
         raise the speed until the pack ends the day exactly full (capped at the speed of 2,000 Wh/day of propulsion,
         (F)'s action limit). Causal in practice: a controller sees the MPPT curtailing a full pack and speeds up.
    (OS) (O) plus spill recapture.
  Bounds: (F) 6zj's DP plan, terminal value zero (it may end the year empty); (Fh) the same plan required to end the
  year with at least 0.5 C (terminal value -1e9 per missing grid step), the fair comparison for a rule that holds a
  reserve; (Y) 6zj's rule (target 0.5 C).
  Energy accounting per point-year: harvest H, spill S (energy lost at a full pack), end-of-year pack E, propulsion
  energy P = 10 kWh + H - hotel energy drawn - S - E. Even-spend distance K(P) = 365 or 366 days x the km/day of
  spending P evenly (86.4 x speed_for_prop_wh(P / n)). Timing efficiency eta = km / K(P), at most about 1 by Jensen.
  Gap decomposition against (L): energy term K(P_x) - K(P_L); timing term the remainder (km_x - km_L - energy term).
Predictions:
  P1  Summed over 300 point-years, the energy term is at least 70% of the km gap from (L) to (F).
  P2  Less spill is the larger part of (F)'s extra energy: (S_L - S_F) >= (E_L - E_F) summed, and both positive.
  P3  (S) closes at least a third of the km gap from (L) to (Fh), with summed excess dark hours at most 1.1 x (L)'s.
  P4  (O) closes less of the (L) to (Fh) gap than (S) (spending today's sun today costs evenness).
  P5  (P) is within 1% of (L)'s summed km (yesterday's sun is a weak daily forecast).
  P6  (L)'s and (F)'s timing efficiency eta, from summed km and summed K(P), differ by less than 0.02.
  P7  Within 20 degrees, (S) closes at least half of (L)'s km gap to (Fh).
Descriptive: per |lat| band, km / (L) for every policy, spill and end-pack shares, and eta; excess dark hours.

Correction (after the first run, before any write-up): the committed code mapped (S) and (OS) to (O)'s power
  estimate (rule[0] of "S" is not "L"), so (S) printed (O)'s numbers. The fix maps (S) to (L) and (OS) to (O); the
  predictions, rules and every other policy are unchanged, and the first run's other numbers are identical.
  P3, P4 and P7 below are from the fixed code (the buggy run read all three as refuted; with the fix P4 holds).

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_speed_timing.py > experiments/results_speed_timing.txt
(stdlib, deterministic; uses up to 4 processes)"""
import os
import statistics as st
import sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_reserve_curve as rc  # noqa: E402
import run_two_sided_curve as ts  # noqa: E402
import run_wave_vs_sun_sites as y  # noqa: E402
import run_year_pack as yp  # noqa: E402

C = rc.C
HOTEL = rc.HOTEL
YEARS = rc.YEARS
LEAD = 45
RULES = ("L", "P", "O", "S", "OS")
POLICIES = ("Y",) + RULES + ("F", "Fh")
# Post hoc (written after reading P1 to P7 of the first run; see post_hoc()): smoother causal power estimates.
POST = {"L30": ("L30", 10), "K": ("K", 10), "K30": ("K", 30), "K60": ("K", 60)}
BANDS = ((0, 20), (25, 35), (40, 45), (50, 55), (60, 60))
V_MAX_PROP = yp.speed_for_prop_wh(yp.MAX_PROP_WH)


def target(hc):
    return ts.lead(ts.target_capped(ts.reserve_capped(hc)), LEAD)


def prop_wh(v, hotel=HOTEL):
    return (yp.load_w(v, hotel) - hotel) * 24.0 if v > 0 else 0.0


def run_rule(sun, T, rule, cap=C, hotel=HOTEL, hc=None, tau=10):
    """A causal (or one-day oracle) speed rule with energy accounting: dict km, down, dark, spill, end, hotel_wh."""
    h = [yp.harvest_wh(k) for k in sun]
    hd = hotel * 24.0
    soc, km, down, dark, spill, hotel_wh = cap, 0.0, 0, 0.0, 0.0, 0.0
    base = {"S": "L", "OS": "O"}.get(rule, rule)
    recapture = rule in ("S", "OS")
    for d, e in enumerate(h):
        if base in ("L", "Y"):
            past = h[max(0, d - 7):d]
            f = st.fmean(past) / 24.0 if past else hotel
        elif base == "L30":
            past = h[max(0, d - 30):d]
            f = st.fmean(past) / 24.0 if past else hotel
        elif base == "K":
            f = hc[d] / 24.0
        elif base == "P":
            f = h[d - 1] / 24.0 if d else hotel
        else:  # "O"
            f = e / 24.0
        p = hotel if f < hotel else f + (soc - T[d]) / (tau * 24.0)
        avail = soc + e
        if avail < hd:
            hotel_wh += avail
            soc = 0.0
            down += 1
            dark += (hd - avail) / hotel
            continue
        v = yp.speed_for_power(p, hotel)
        if avail - yp.load_w(v, hotel) * 24.0 < 0:
            v = y.bisect(lambda x: avail - yp.load_w(x, hotel) * 24.0 >= 0) or 0.0
        left = avail - yp.load_w(v, hotel) * 24.0
        if recapture and left > cap and v < V_MAX_PROP:
            vs = y.bisect(lambda x: avail - yp.load_w(x, hotel) * 24.0 >= cap) or 0.0
            v = max(v, min(vs, V_MAX_PROP))
            left = avail - yp.load_w(v, hotel) * 24.0
        hotel_wh += hd
        spill += max(0.0, left - cap)
        soc = min(cap, left)
        km += 86.4 * v
    return {"km": km, "down": down, "dark": dark, "spill": spill, "end": soc, "hotel_wh": hotel_wh, "H": sum(h)}


def foresight_acct(sun, table, end_min=0.0, cap=C, hotel=HOTEL):
    """6zj's (F) (yp.foresight) with energy accounting and an optional end-of-year pack floor."""
    h = [yp.harvest_wh(k) for k in sun]
    n = int(round(cap / yp.GRID_WH))
    hd = hotel * 24.0
    pen = yp.DARK_PENALTY

    def interp(V, s):
        x = s / yp.GRID_WH
        i = min(int(x), n - 1)
        f = x - i
        return V[i] * (1 - f) + V[i + 1] * f

    def best(V, soc, e):
        avail = soc + e
        if avail < hd:
            return (-(hd - avail) / hotel * pen + V[0], 0.0, 0.0, (hd - avail) / hotel)
        top = None
        for pe, k in table:
            left = avail - hd - pe
            if left < 0:
                break
            val = k + interp(V, min(cap, left))
            if top is None or val > top[0]:
                top = (val, pe, k, 0.0)
        return top

    Vs = [None] * (len(h) + 1)
    Vs[-1] = [0.0 if i * yp.GRID_WH >= end_min - 1e-9 else -1e9 for i in range(n + 1)]
    for d in range(len(h) - 1, -1, -1):
        Vs[d] = [best(Vs[d + 1], i * yp.GRID_WH, h[d])[0] for i in range(n + 1)]
    soc, km, down, dark, spill, hotel_wh = cap, 0.0, 0, 0.0, 0.0, 0.0
    for d, e in enumerate(h):
        _, pe, k, dh = best(Vs[d + 1], soc, e)
        if dh > 0:
            hotel_wh += soc + e
            soc = 0.0
            down += 1
            dark += dh
        else:
            left = soc + e - hd - pe
            hotel_wh += hd
            spill += max(0.0, left - cap)
            soc = min(cap, left)
            km += k
    return {"km": km, "down": down, "dark": dark, "spill": spill, "end": soc, "hotel_wh": hotel_wh, "H": sum(h)}


def prop_energy(r, cap=C):
    return cap + r["H"] - r["hotel_wh"] - r["spill"] - r["end"]


def even_km(P, ndays, hotel=HOTEL):
    """K(P): km from spending propulsion energy P evenly over ndays."""
    return ndays * 86.4 * yp.speed_for_prop_wh(max(0.0, P) / ndays, hotel)


def one(key):
    p, yr = key
    sun = rc.year_sun(p, yr)
    n = len(sun)
    hc = rc.climatology_wh(p, yr)
    T = target(hc)
    table = yp.prop_table()
    r = {"lat": yp.lat_of(p), "n": n, "idle": yp.idle(sun)[1]}
    r["Y"] = run_rule(sun, [0.5 * C] * n, "Y")
    for rule in RULES:
        r[rule] = run_rule(sun, T, rule)
    for k, (base, tau) in POST.items():
        r[k] = run_rule(sun, T, base, hc=hc, tau=tau)
    r["F"] = foresight_acct(sun, table)
    r["Fh"] = foresight_acct(sun, table, end_min=0.5 * C)
    for k in POLICIES + tuple(POST):
        r[k]["P"] = prop_energy(r[k])
        r[k]["K"] = even_km(r[k]["P"], n)
    return key, r


def evaluate(points=None, years=YEARS, procs=4):
    keys = [(p, yr) for p in points or yp.points() for yr in years]
    if procs > 1:
        with Pool(procs) as pool:
            return dict(pool.map(one, keys))
    return dict(map(one, keys))


def tot(R, k, f, keys=None):
    return sum(R[x][k][f] for x in keys or R)


def ex(R, k, keys=None):
    return sum(R[x][k]["dark"] - R[x]["idle"] for x in keys or R)


def share(R, k, ref="L", bound="Fh", keys=None):
    a, b, c = tot(R, ref, "km", keys), tot(R, k, "km", keys), tot(R, bound, "km", keys)
    return (b - a) / (c - a) if c != a else float("nan")


def main():
    R = evaluate()
    keys = list(R)
    print("Milestone 6zn: foresight's distance edge split into energy and timing, and three sun-aware speed rules")
    print(f"central boat {y.CENTRAL}, pack {C:.0f} Wh, hotel {HOTEL:.0f} W; target lead {LEAD} days; "
          f"{len(keys)} point-years; spill-recapture speed cap {V_MAX_PROP:.3f} m/s\n")

    print("A  totals over all point-years")
    print("   policy |        km | km / (L) | excess dark h |  harvest MWh | spill MWh | end pack MWh | prop MWh | "
          "K(P) km | eta")
    for k in POLICIES:
        km, K = tot(R, k, "km"), tot(R, k, "K")
        print(f"   {k:>6} | {km:9.0f} | {km / tot(R, 'L', 'km'):8.4f} | {ex(R, k):13.0f} | "
              f"{tot(R, k, 'H') / 1e6:12.2f} | {tot(R, k, 'spill') / 1e6:9.3f} | {tot(R, k, 'end') / 1e6:12.3f} | "
              f"{tot(R, k, 'P') / 1e6:8.3f} | {K:7.0f} | {km / K:.4f}")

    print("\nB  gap decomposition against (L): energy term K(P_x) - K(P_L), timing term the rest (km)")
    for k in POLICIES:
        if k == "L":
            continue
        gap = tot(R, k, "km") - tot(R, "L", "km")
        en = tot(R, k, "K") - tot(R, "L", "K")
        print(f"   {k:>3}: gap {gap:9.0f}, energy {en:9.0f}, timing {gap - en:9.0f}; "
              f"share of (L)->(Fh) gap closed {share(R, k):.3f}")

    print("\nC  by |lat| band")
    for lo, hi in BANDS:
        ks = [x for x in keys if lo <= abs(R[x]["lat"]) <= hi]
        if not ks:
            continue
        base = tot(R, "L", "km", ks)
        print(f"   |lat| {lo:2d}-{hi:2d} ({len(ks)} point-years)")
        print("      km / (L): " + ", ".join(f"({k}) {tot(R, k, 'km', ks) / base:.4f}" for k in POLICIES))
        print("      spill / harvest: " + ", ".join(f"({k}) {tot(R, k, 'spill', ks) / tot(R, k, 'H', ks):.4f}"
                                                  for k in POLICIES))
        print("      eta: " + ", ".join(f"({k}) {tot(R, k, 'km', ks) / tot(R, k, 'K', ks):.4f}" for k in POLICIES))
        print("      mean excess dark h/yr: " + ", ".join(f"({k}) {ex(R, k, ks) / len(ks):.1f}" for k in POLICIES))
        print("      share of (L)->(Fh) gap closed: " + ", ".join(f"({k}) {share(R, k, keys=ks):.3f}"
                                                              for k in RULES[1:]))

    print("\nPredictions")
    gapF = tot(R, "F", "km") - tot(R, "L", "km")
    enF = tot(R, "F", "K") - tot(R, "L", "K")
    print(f"P1 energy term >= 70% of the (L)->(F) km gap: {'held' if enF >= 0.7 * gapF else 'refuted'} "
          f"({enF:.0f} of {gapF:.0f}, {enF / gapF:.3f})")
    ds = tot(R, "L", "spill") - tot(R, "F", "spill")
    de = tot(R, "L", "end") - tot(R, "F", "end")
    print(f"P2 spill saving >= end-pack saving, both > 0: {'held' if ds >= de > 0 else 'refuted'} "
          f"(spill {ds:.0f} Wh, end pack {de:.0f} Wh)")
    sS = share(R, "S")
    okd = ex(R, "S") <= 1.1 * ex(R, "L")
    print(f"P3 (S) closes >= 1/3 of (L)->(Fh), excess dark h <= 1.1 x (L): "
          f"{'held' if sS >= 1 / 3 and okd else 'refuted'} (share {sS:.3f}; excess {ex(R, 'S'):.0f} "
          f"against {ex(R, 'L'):.0f})")
    sO = share(R, "O")
    print(f"P4 (O) closes less than (S): {'held' if sO < sS else 'refuted'} ((O) {sO:.3f}, (S) {sS:.3f})")
    rp = tot(R, "P", "km") / tot(R, "L", "km")
    print(f"P5 (P) within 1% of (L) km: {'held' if abs(rp - 1) <= 0.01 else 'refuted'} ({rp:.4f})")
    eL = tot(R, "L", "km") / tot(R, "L", "K")
    eF = tot(R, "F", "km") / tot(R, "F", "K")
    print(f"P6 |eta(L) - eta(F)| < 0.02: {'held' if abs(eL - eF) < 0.02 else 'refuted'} "
          f"(eta (L) {eL:.4f}, (F) {eF:.4f})")
    eq = [x for x in keys if abs(R[x]["lat"]) <= 20]
    s7 = share(R, "S", keys=eq)
    print(f"P7 within 20 deg, (S) closes >= half of (L)->(Fh): {'held' if s7 >= 0.5 else 'refuted'} ({s7:.3f})")
    post_hoc(R)


def post_hoc(R):
    """Written after reading P1 to P7 (first run, with the (S) dispatch bug; the pattern held after the fix). The gap
    to (F) is not energy: (F) spends about the same propulsion energy as (L) (Fh: 0.5% more) and goes 10% further
    because it spends it more evenly (eta 0.82 against 0.75; 0.99 against 0.95 within 20 degrees). Every rule that
    follows the sun more closely ((P), (O)) went less far. So the fix is the opposite of "spend on sunny days": make
    the power estimate smoother. Variants, all with the same target and pack feedback: (L30) a 30-day trailing mean;
    (K) the leave-one-year-out climatological harvest for today (the curve the target is built from, so no
    weather enters the power estimate except through the pack); (K30), (K60) the same with a 30- and 60-day pack
    feedback time constant instead of 10. Four variants, scored on the same 300 point-years: in sample."""
    keys = list(R)
    print("\nPost hoc (written after reading P1 to P7): smoother power estimates; in sample, 4 variants")
    print("   policy |        km | km / (L) | km / (Fh) | excess dark h | spill MWh | end pack MWh | eta | "
          "share of (L)->(Fh) closed")
    for k in ("L",) + tuple(POST) + ("Fh",):
        km = tot(R, k, "km")
        print(f"   {k:>6} | {km:9.0f} | {km / tot(R, 'L', 'km'):8.4f} | {km / tot(R, 'Fh', 'km'):9.4f} | "
              f"{ex(R, k):13.0f} | {tot(R, k, 'spill') / 1e6:9.3f} | {tot(R, k, 'end') / 1e6:12.3f} | "
              f"{km / tot(R, k, 'K'):.4f} | {share(R, k):.3f}")
    for lo, hi in BANDS:
        ks = [x for x in keys if lo <= abs(R[x]["lat"]) <= hi]
        base = tot(R, "L", "km", ks)
        print(f"   |lat| {lo:2d}-{hi:2d}: km / (L) " + ", ".join(
            f"({k}) {tot(R, k, 'km', ks) / base:.4f}" for k in tuple(POST) + ("Fh",))
            + "; mean excess dark h/yr " + ", ".join(f"({k}) {ex(R, k, ks) / len(ks):.1f}" for k in ("L",) + tuple(POST)))


if __name__ == "__main__":
    main()
