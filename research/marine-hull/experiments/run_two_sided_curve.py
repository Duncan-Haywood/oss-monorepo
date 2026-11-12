"""Milestone 6zl: does a capacity-aware (two-sided) rule curve win back the distance 6zk's reserve curve gave up at
high latitude, and what does it cost in payload dark hours? Ten one-year missions, 2015 to 2024, each year's
climatology left out of its own test, the same 30 points and 300 point-years as 6zk.

Why: 6zk's "Next". Its reserve curve (R) took a 10 kWh pack's target from the circular backward recursion
R(d) = max(0, R(d+1) + 24 hotel - hc(d)) and clipped it to [0.5 C, C] afterwards. At 40 degrees and poleward the
unclipped winter shortfall is 45 to 232 kWh, so R(d) > C on almost every day, the target is the full pack all year
(207 to 366 days at T = C), and (R) covered only 0.62 to 0.84 of the foresight plan (F)'s km there. The clip is in the
wrong place. A pack cannot hold more than C, so a requirement larger than C at d+1 can only be met with C; the
summer surplus between now and the onset of the deficit season will refill whatever is spent before it. Clipping
inside the recursion is the storage-capacity form of the sequent-peak / rule-curve calculation for a finite
reservoir (Loucks and van Beek 2017, Water Resource Systems Planning and Management, Springer, open access, ch. 11):
  Rc(d) = min(C, max(0, Rc(d+1) + 24 hotel - hc(d)))      (circular, iterated to a fixed point)
It is "two-sided": the target rises to C ahead of the deficit season and falls away again ahead of the climatological
recovery, because a day of surplus to come lowers what the pack must hold today.

Data: as 6zk (NASA POWER daily ALLSKY_SFC_SW_DWN, public domain; experiments/data/sun_flip_2024.json,
experiments/data/sun_transect_2015_2023.json, experiments/data/daily_<site>.json). No new data.

Rules (fixed in this docstring and committed before the policies below were run on any year):
  Boat, pack, hotel, harvest, daily step, down days, dark hours, launch full on 1 January: 6zj / 6zk, unchanged.
  Every policy is 6zk's causal_target() (hold station when the trailing 7-day mean harvest is below the hotel load;
  else planned power = h7 + (SOC - T(d)) / 240 h); only T(d) differs.
  (Y), (R), (R1), idle and (F): 6zk's, recomputed here (they must reproduce 6zk's results file; a test checks (R)).
  (C) capacity-aware curve: Rc from the leave-one-year-out 31-day-smoothed climatology hc (6zk's climatology_wh),
      T(d) = max(0.5 C, Rc(d)).
  (C0) as (C) with no floor: T(d) = Rc(d).
  (Cm) as (C) built from a 10% sun haircut, hc x 0.9 (a margin for a worse-than-climatology year).
  (C1) diagnostic: (C) built from the test year's own smoothed harvest (oracle climatology).
  Excess dark hours = a policy's dark hours minus the idle vehicle's in the same point-year (idle = the physical
  minimum; 6zj P8: it equals (F)'s).
Predictions:
  P1  At |lat| >= 40 (140 point-years), summed (C) km is at least 1.15 x summed (R) km.
  P2  Summed over all 300 point-years, (C)'s excess dark hours are at most 2 x (R)'s (6zk: (R) 2,937).
  P3  (C)'s summed excess dark hours are below (Y)'s (6zk: 31,664) by at least half.
  P4  At |lat| >= 40, (C) closes at least half the km gap from (R) to (F): sum (C - R) / sum (F - R) >= 0.5.
  P5  (C0) covers more summed km than (C) and has more summed excess dark hours.
  P6  (Cm)'s summed excess dark hours are at most (C)'s, and its summed km at least (R)'s.
  P7  (C)'s summed excess dark hours are at most 2 x (C1)'s (the climatology error stays small, as in 6zk P6).
  P8  Within 20 degrees of the equator, (C) km equals (R) km and (Y) km in every point-year (Rc <= R <= 0.5 C there).
Descriptive (no prediction): per |lat| band, mean excess dark hours per year and km relative to (Y) for every policy
  and (F); per point, the number of days at T = C under (R) and (C) in 2024, and the day the (C) target first falls
  from C after the winter.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_two_sided_curve.py > experiments/results_two_sided_curve.txt
(about 5 minutes, mostly (F); stdlib, deterministic)"""
import os
import statistics as st
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_reserve_curve as rc  # noqa: E402
import run_wave_vs_sun_sites as y  # noqa: E402
import run_year_pack as yp  # noqa: E402

C = rc.C
HOTEL = rc.HOTEL
YEARS = rc.YEARS
HAIRCUT = 0.9
POLICIES = ("Y", "R", "R1", "C", "C0", "Cm", "C1")
BANDS = ((0, 20), (25, 35), (40, 45), (50, 55), (60, 60))


def reserve_capped(hc, cap=C, hotel=HOTEL, passes=20):
    """Circular backward recursion Rc(d) = min(cap, max(0, Rc(d+1) + 24 hotel - hc(d))), iterated to a fixed point."""
    n = len(hc)
    R = [0.0] * n
    for _ in range(passes):
        old = list(R)
        for d in range(n - 1, -1, -1):
            R[d] = min(cap, max(0.0, R[(d + 1) % n] + hotel * 24.0 - hc[d]))
        if R == old:
            break
    return R


def target_capped(Rc, floor=0.5 * C):
    return [max(floor, r) for r in Rc]


def evaluate(points=None, years=YEARS, with_f=True):
    table = yp.prop_table() if with_f else None
    out = {}
    for p in points or yp.points():
        lat = yp.lat_of(p)
        for yr in years:
            sun = rc.year_sun(p, yr)
            n = len(sun)
            hc = rc.climatology_wh(p, yr)
            own = rc.smooth([yp.harvest_wh(k) for k in sun])
            Rc = reserve_capped(hc)
            r = {"lat": lat,
                 "Y": rc.causal_target(sun, [0.5 * C] * n),
                 "R": rc.causal_target(sun, rc.target_from_reserve(rc.reserve(hc))),
                 "R1": rc.causal_target(sun, rc.target_from_reserve(rc.reserve(own))),
                 "C": rc.causal_target(sun, target_capped(Rc)),
                 "C0": rc.causal_target(sun, target_capped(Rc, floor=0.0)),
                 "Cm": rc.causal_target(sun, target_capped(reserve_capped([HAIRCUT * e for e in hc]))),
                 "C1": rc.causal_target(sun, target_capped(reserve_capped(own))),
                 "idle": yp.idle(sun)}
            if with_f:
                r["F"] = yp.foresight(sun, table=table)
            out[(p, yr)] = r
    return out


def excess(r, k):
    return r[k][2] - r["idle"][1]


def main():
    R = evaluate()
    pts = yp.points()
    print("Milestone 6zl: a capacity-aware (two-sided) rule curve for a deck-solar boat's pack, ten one-year missions "
          "2015 to 2024")
    print(f"central boat {y.CENTRAL}, pack {C:.0f} Wh, hotel {HOTEL:.0f} W, launch full on 1 January each year; "
          f"{len(pts)} points x {len(YEARS)} years = {len(R)} point-years\n")

    print("A  per point, sums over ten years: excess dark hours over the idle vehicle and km; 2024 days at T = C under "
          "(R) and (C), and the first day after 1 January the (C) target leaves C")
    print("   point             lat | excess dark h:  (Y)    (R)    (C)   (C0)   (Cm)   (C1) |   (R) km   (C) km  "
          " (C0) km   (F) km | 2024 T=C: (R) (C) | (C) leaves C")
    for p in pts:
        rs = [R[(p, yr)] for yr in YEARS]
        hc = rc.climatology_wh(p, 2024)
        tR = rc.target_from_reserve(rc.reserve(hc))
        tC = target_capped(reserve_capped(hc))
        first = next((i + 1 for i in range(len(tC) - 1) if tC[i] >= C and tC[i + 1] < C), None)
        print(f"   {p:16s} {rs[0]['lat']:4d} | {'':13s}"
              + " ".join(f"{sum(excess(r, k) for r in rs):6.0f}" for k in ("Y", "R", "C", "C0", "Cm", "C1"))
              + " | " + " ".join(f"{sum(r[k][0] for r in rs):8.0f}" for k in ("R", "C", "C0", "F"))
              + f" | {sum(t >= C for t in tR):12d} {sum(t >= C for t in tC):3d} | {first if first else '-':>12}")

    print("\nB  by |lat| band: mean excess dark hours per point-year, and summed km relative to (Y)")
    for lo, hi in BANDS:
        ks = [k for k in R if lo <= abs(R[k]["lat"]) <= hi]
        if not ks:
            continue
        ex = {m: st.fmean(excess(R[k], m) for k in ks) for m in POLICIES}
        km = {m: sum(R[k][m][0] for k in ks) / sum(R[k]["Y"][0] for k in ks) for m in POLICIES[1:] + ("F",)}
        print(f"   |lat| {lo:2d}-{hi:2d} ({len(ks):3d}): excess dark h/yr "
              + ", ".join(f"({m}) {ex[m]:.1f}" for m in ex))
        print(f"   {'':20s} km / (Y) km    " + ", ".join(f"({m}) {km[m]:.3f}" for m in km))

    print("\nPredictions")
    tot = {m: sum(excess(r, m) for r in R.values()) for m in POLICIES}
    km = {m: sum(r[m][0] for r in R.values()) for m in POLICIES + ("F",)}
    h40 = [k for k in R if abs(R[k]["lat"]) >= 40]
    kR = sum(R[k]["R"][0] for k in h40)
    kC = sum(R[k]["C"][0] for k in h40)
    kF = sum(R[k]["F"][0] for k in h40)
    print(f"P1 |lat| >= 40 ({len(h40)} point-years): (C) km >= 1.15 x (R) km: "
          f"{'held' if kC >= 1.15 * kR else 'refuted'} ((C) {kC:.0f}, (R) {kR:.0f}, ratio {kC / kR:.3f})")
    print(f"P2 (C) summed excess dark h <= 2 x (R)'s: {'held' if tot['C'] <= 2 * tot['R'] else 'refuted'} "
          f"((C) {tot['C']:.0f}, (R) {tot['R']:.0f}, ratio {tot['C'] / tot['R']:.3f})")
    print(f"P3 (C) summed excess dark h <= 0.5 x (Y)'s: {'held' if tot['C'] <= 0.5 * tot['Y'] else 'refuted'} "
          f"((C) {tot['C']:.0f}, (Y) {tot['Y']:.0f})")
    share = (kC - kR) / (kF - kR) if kF != kR else float("nan")
    print(f"P4 |lat| >= 40: (C) closes >= half the km gap (R) -> (F): {'held' if share >= 0.5 else 'refuted'} "
          f"(share {share:.3f}; (F) {kF:.0f})")
    print(f"P5 (C0) more km and more excess dark h than (C): "
          f"{'held' if km['C0'] > km['C'] and tot['C0'] > tot['C'] else 'refuted'} "
          f"(km {km['C0']:.0f} vs {km['C']:.0f}; excess {tot['C0']:.0f} vs {tot['C']:.0f})")
    print(f"P6 (Cm) excess <= (C)'s and (Cm) km >= (R)'s: "
          f"{'held' if tot['Cm'] <= tot['C'] and km['Cm'] >= km['R'] else 'refuted'} "
          f"(excess {tot['Cm']:.0f} vs {tot['C']:.0f}; km {km['Cm']:.0f} vs (R) {km['R']:.0f})")
    print(f"P7 (C) excess <= 2 x (C1)'s: {'held' if tot['C'] <= 2 * tot['C1'] else 'refuted'} "
          f"((C) {tot['C']:.0f}, (C1) {tot['C1']:.0f})")
    eq = [k for k in R if abs(R[k]["lat"]) <= 20]
    same = all(R[k]["C"][0] == R[k]["R"][0] == R[k]["Y"][0] for k in eq)
    print(f"P8 within 20 deg ({len(eq)} point-years) (C) km == (R) km == (Y) km: {'held' if same else 'refuted'}")
    print("\nTotals over 300 point-years: excess dark h " + ", ".join(f"({m}) {tot[m]:.0f}" for m in POLICIES)
          + "; km " + ", ".join(f"({m}) {km[m]:.0f}" for m in POLICIES + ("F",)))
    return R


if __name__ == "__main__":
    main()
