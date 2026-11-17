"""Milestone 6zzza: on its own deck-solar budget, how many days a year is a Wave Glider's payload dark, and does its
high-latitude distance lead over the solar boat survive counting only the kilometres sailed with the sensors on?

Why: open since 6zj ("give the Wave Glider the same payload budget"). Every comparison from 6x to 6zj gave the 4 m
deck-solar boat a 30 W payload drawn from its own panel and pack, and gave the Wave Glider its wave-powered distance with
no electrical budget at all. 6zj found that poleward of about 35 degrees the boat's payload is dark 77 to 214 days a
year whatever the hull does, and said the Wave Glider's high-latitude distance lead "says nothing yet about whether
its sensors are on". A Wave Glider also runs its payload and its own electronics from deck solar panels and a pack.

Sourced inputs:
  SV3 maximum solar collection 225 W and maximum energy storage 6.8 kWh: Liquid Robotics' Wave Glider comparison table,
    https://www.liquid-robotics.com/wave-gliders/ (opened in milestone 6zh, LOG.md). They are maxima, so this is the
    best-equipped SV3, which favours the Wave Glider.
  The 225 W is read as nameplate power at 1,000 W/m2 (standard test conditions), so the daily harvest is
    225 W x derate x (daily insolation in kWh/m2) with the boat's derate 0.85 (6y's central boat). For comparison the
    boat's 1.152 m2 x 0.20 x 0.85 is 195.8 W at 1,000 W/m2: the two decks are within 2% of each other (191.3 W).
  Sun: NASA POWER daily all-sky shortwave, 2015 to 2024, the 30 points of 6zj and 6zk (run_reserve_curve.year_sun).
  Wave Glider distance: 6z's 2015 Wave Glider best-state km/day by point and month of 2024 (ERA5 waves), as in 6zj.
  Boat distance: 6zk's reserve-curve policy (R), climatology from the other nine years, 2024.
Not sourced (swept instead): the Wave Glider's own bus load (command and control, GPS, Iridium, rudder servo), B in
  {0, 3, 5, 10} W. B = 0 is the matched case: the boat's 30 W hotel is its whole electrical load in 6zj, so the
  Wave Glider with B = 0 and a 30 W payload carries exactly the boat's load. Zhang et al. (2022, Renewable Energy 188,
  911-921, doi:10.1016/j.renene.2022.02.102, abstract only) state 10 W continuous power available to payloads; that
  figure is a check (W5), not an input.

Rules (fixed before any run):
  Daily energy steps, launch full on 1 January of each year, ten independent one-year missions per point (300
  point-years). Each day: avail = pack + harvest. The bus is served first: bus dark hours = max(0, 24 B - avail) / B.
  The payload (P = 30 W) gets what is left: payload dark hours = max(0, 24 P - left) / P, a day with any payload dark
  hour is a payload down day. Pack capped at capacity, surplus spilled.
    (G) greedy: the payload takes all that is left after the day's bus energy.
    (K) bus reserve: the payload may not draw the pack below 30 days of bus energy (720 B Wh, 0 when B = 0), so the
        vehicle keeps steering through a dark spell.
  Boat side: 6zj's idle vehicle (boat panel, 10 kWh, 30 W, v = 0), which is the fewest dark hours any boat policy can
    have, and (R) for 2024 distance.
  Payload-on km, 2024: sum over days of km that day x (1 - payload dark hours / 24), for the Wave Glider (G, B = 5) and
    for the boat under (R). A Wave Glider day with bus dark hours counts no km at all for those hours (it cannot steer).

Predictions (written before any run; the decks' 2% difference and the packs' 6.8 vs 10 kWh were known):
  W1  Matched case (B = 0, G): the Wave Glider's payload down days are at least the boat idle vehicle's in at least 95%
      of the 300 point-years (smaller pack, slightly smaller deck).
  W2  With B = 5 (G), the Wave Glider's 30 W payload is dark on at least 30 days in every point-year at |lat| >= 40.
  W3  With B = 5 (G), no payload down day in at least 90% of point-years within 10 degrees of the equator.
  W4  At |lat| >= 40, the band-mean payload down days per year with B = 5 (G) are at least 1.1 times the boat idle
      vehicle's.
  W5  The largest dark-free payload (1 W steps) with B = 5, median over the ten years, is at least 10 W at every point
      within 30 degrees and below 10 W at every point at 50 degrees or more.
  W6  Going from B = 3 to B = 10 (G) adds fewer than 25 payload down days per year to the band mean at |lat| >= 40.
  W7  (K) has no bus dark hour in any point-year with B = 5; (G) has some at 60 degrees with B = 5.
  W8  Of the 2024 points at |lat| >= 40 where the Wave Glider's best-state km beats the boat's (R) km, the boat leads
      on payload-on km at at least half.
  W9  Within 20 degrees the boat's (R) payload-on km is at least 1.2 times the Wave Glider's at every point (the
      Wave Glider's payload is on there, so the 6zj lead stands).

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_waveglider_payload.py \
  > experiments/results_waveglider_payload.txt   (stdlib, deterministic)"""
import os
import statistics as st
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_flip_map as z  # noqa: E402
import run_reserve_curve as rc  # noqa: E402
import run_year_pack as yp  # noqa: E402

WG_PEAK_W = 225.0
WG_PACK_WH = 6800.0
DERATE = 0.85
PAYLOAD = 30.0
BUSES = (0.0, 3.0, 5.0, 10.0)
RESERVE_DAYS = 30
YEARS = rc.YEARS
BANDS = ((0, 10), (11, 30), (31, 45), (46, 60))


def wg_harvest_wh(kwh_m2, peak=WG_PEAK_W, derate=DERATE):
    """Wh a day from a deck rated `peak` W at 1,000 W/m2, at daily insolation kwh_m2."""
    return peak * derate * kwh_m2


def wg_day(soc, harvest, bus, payload, cap, reserve):
    """One day: (new soc, bus dark hours, payload dark hours)."""
    avail = soc + harvest
    bus_e = 24.0 * bus
    bus_dark = max(0.0, bus_e - avail) / bus if bus > 0 else 0.0
    left = max(0.0, avail - bus_e)
    usable = max(0.0, left - reserve)
    pay_e = min(24.0 * payload, usable)
    pay_dark = (24.0 * payload - pay_e) / payload if payload > 0 else 0.0
    return min(cap, left - pay_e), bus_dark, pay_dark


def wg_year(sun, bus, payload=PAYLOAD, cap=WG_PACK_WH, reserve_days=0, peak=WG_PEAK_W):
    """(payload down days, payload dark hours, bus dark hours, daily payload dark list, daily bus dark list)."""
    reserve = min(cap, RESERVE_DAYS * 24.0 * bus) if reserve_days else 0.0
    soc, down, dark, bdark, pd, bd = cap, 0, 0.0, 0.0, [], []
    for k in sun:
        soc, b, p = wg_day(soc, wg_harvest_wh(k, peak), bus, payload, cap, reserve)
        down += p > 1e-9
        dark += p
        bdark += b
        pd.append(p)
        bd.append(b)
    return down, dark, bdark, pd, bd


def max_dark_free_payload(sun, bus, cap=WG_PACK_WH):
    best = 0
    for w in range(1, 61):
        if wg_year(sun, bus, float(w), cap)[0] == 0:
            best = w
        else:
            break
    return best


def boat_r_daily(sun, target, cap=yp.C, hotel=yp.HOTEL):
    """6zk's (R) with daily traces: (km list, dark hour list)."""
    h = [yp.harvest_wh(k) for k in sun]
    soc, kms, darks = cap, [], []
    for d, e in enumerate(h):
        past = h[max(0, d - 7):d]
        h7 = st.fmean(past) / 24.0 if past else hotel
        p = hotel if h7 < hotel else h7 + (soc - target[d]) / (10 * 24.0)
        soc, v, dh = yp.step(soc, e, yp.speed_for_power(p, hotel), cap, hotel)
        kms.append(86.4 * v)
        darks.append(dh)
    return kms, darks


def band_of(lat):
    a = abs(lat)
    for lo, hi in BANDS:
        if lo <= a <= hi:
            return (lo, hi)
    return None


def evaluate():
    out = {}
    for p in yp.points():
        lat = yp.lat_of(p)
        for yr in YEARS:
            sun = rc.year_sun(p, yr)
            r = {"lat": lat, "idle": yp.idle(sun)}
            for b in BUSES:
                r[("G", b)] = wg_year(sun, b)[:3]
                r[("K", b)] = wg_year(sun, b, reserve_days=1)[:3]
            r["maxP5"] = max_dark_free_payload(sun, 5.0)
            r["maxP0"] = max_dark_free_payload(sun, 0.0)
            r["boat_max"] = yp.max_dark_free_hotel(sun)
            out[(p, yr)] = r
    return out


def km_2024():
    """Per point: WG best total km, WG payload-on km (G, B = 5), boat (R) total and payload-on km, 2024."""
    z.load_sun()
    a, best, worst = z.vehicle()
    rows6z = z.evaluate(a, best, worst)
    out = {}
    for p in yp.points():
        sun = rc.year_sun(p, 2024)
        days = rc.dates(2024)
        wg_day_km = [rows6z[(p, d.month)]["wg"] for d in days]
        _, _, _, pd, bd = wg_year(sun, 5.0)
        wg_on = sum(k * max(0.0, 1 - (pp + bb) / 24.0) for k, pp, bb in zip(wg_day_km, pd, bd))
        wg_steer = sum(k * (1 - bb / 24.0) for k, bb in zip(wg_day_km, bd))
        target = rc.target_from_reserve(rc.reserve(rc.climatology_wh(p, 2024)))
        kms, darks = boat_r_daily(sun, target)
        out[p] = {"lat": yp.lat_of(p), "wg": sum(wg_day_km), "wg_steer": wg_steer, "wg_on": wg_on,
                  "boat": sum(kms), "boat_on": sum(k * (1 - dh / 24.0) for k, dh in zip(kms, darks)),
                  "wg_down": sum(x > 1e-9 for x in pd), "boat_down": sum(x > 0 for x in darks)}
    return out


def main():
    R = evaluate()
    K = km_2024()
    pts = yp.points()
    print("Milestone 6zzza: the Wave Glider's payload on its own deck-solar budget, against the 4 m solar boat")
    print(f"SV3 deck {WG_PEAK_W:.0f} W nameplate x derate {DERATE} (boat deck {yp.AREA * 0.20 * 1000:.1f} W x {DERATE}), "
          f"pack {WG_PACK_WH:.0f} Wh (boat {yp.C:.0f}), payload {PAYLOAD:.0f} W, bus B swept {BUSES} W (not sourced);")
    print(f"NASA POWER {YEARS[0]} to {YEARS[-1]}, {len(pts)} points x {len(YEARS)} years = {len(R)} point-years, "
          "launch full on 1 January each year\n")

    print("A  per point, mean over ten years: payload down days/yr for the boat idle vehicle and the Wave Glider (G) at "
          "each B, (K) at B = 5;\n   bus dark hours/yr (G, B = 5); largest dark-free payload (median W): boat 30-W-hotel "
          "equivalent, WG B = 0, WG B = 5")
    print("   point             lat | idle  G0   G3   G5  G10   K5 | busdark G5 | maxW boat WG0 WG5")
    for p in pts:
        rs = [R[(p, yr)] for yr in YEARS]
        m = lambda f: st.fmean(f(r) for r in rs)  # noqa: E731
        print(f"   {p:16s} {rs[0]['lat']:4d} | {m(lambda r: r['idle'][0]):4.0f} "
              + " ".join(f"{m(lambda r, b=b: r[('G', b)][0]):4.0f}" for b in BUSES)
              + f" {m(lambda r: r[('K', 5.0)][0]):4.0f} | {m(lambda r: r[('G', 5.0)][2]):10.0f} | "
              f"{st.median(r['boat_max'] for r in rs):9.0f} {st.median(r['maxP0'] for r in rs):3.0f} "
              f"{st.median(r['maxP5'] for r in rs):3.0f}")

    print("\nB  by |lat| band (all point-years): mean payload down days/yr")
    for band in BANDS:
        ks = [k for k in R if band_of(R[k]["lat"]) == band]
        if not ks:
            continue
        idle = st.fmean(R[k]["idle"][0] for k in ks)
        gs = [st.fmean(R[k][("G", b)][0] for k in ks) for b in BUSES]
        k5 = st.fmean(R[k][("K", 5.0)][0] for k in ks)
        bd = st.fmean(R[k][("G", 5.0)][2] for k in ks)
        print(f"   |lat| {band[0]:2d}-{band[1]:2d} ({len(ks):3d}): idle boat {idle:5.1f}; WG G "
              + ", ".join(f"B{b:.0f} {g:5.1f}" for b, g in zip(BUSES, gs))
              + f"; K B5 {k5:5.1f}; G B5 bus dark h/yr {bd:6.1f}")

    print("\nC  2024 distance: Wave Glider best state (total, steering, payload-on with G B = 5) against the boat (R) "
          "(total, payload-on)")
    print("   point             lat |  WG km  steer  pay-on  dn |  boat R  pay-on  dn | lead total  lead pay-on")
    for p in pts:
        k = K[p]
        lt = "WG" if k["wg"] > k["boat"] else "boat"
        lo = "WG" if k["wg_on"] > k["boat_on"] else "boat"
        print(f"   {p:16s} {k['lat']:4d} | {k['wg']:6.0f} {k['wg_steer']:6.0f} {k['wg_on']:7.0f} {k['wg_down']:3d} | "
              f"{k['boat']:7.0f} {k['boat_on']:7.0f} {k['boat_down']:3d} | {lt:>10s} {lo:>12s}")

    print("\nPredictions")
    allk = list(R)
    w1 = sum(R[k][("G", 0.0)][0] >= R[k]["idle"][0] for k in allk) / len(allk)
    print(f"W1 matched WG down days >= idle boat in >= 95% of point-years: {'held' if w1 >= 0.95 else 'refuted'} "
          f"({100 * w1:.1f}%)")
    hi40 = [k for k in allk if abs(R[k]["lat"]) >= 40]
    mn = min(R[k][("G", 5.0)][0] for k in hi40)
    print(f"W2 WG B5 >= 30 down days in every point-year at |lat| >= 40 ({len(hi40)}): "
          f"{'held' if mn >= 30 else 'refuted'} (min {mn})")
    eq = [k for k in allk if abs(R[k]["lat"]) <= 10]
    w3 = sum(R[k][("G", 5.0)][0] == 0 for k in eq) / len(eq)
    print(f"W3 WG B5 no down day in >= 90% of point-years within 10 deg ({len(eq)}): "
          f"{'held' if w3 >= 0.9 else 'refuted'} ({100 * w3:.1f}%)")
    gi = st.fmean(R[k][("G", 5.0)][0] for k in hi40)
    ii = st.fmean(R[k]["idle"][0] for k in hi40)
    print(f"W4 WG B5 band-mean down days >= 1.1 x idle boat at |lat| >= 40: {'held' if gi >= 1.1 * ii else 'refuted'} "
          f"({gi:.1f} vs {ii:.1f}, ratio {gi / ii:.2f})")
    med = {p: st.median(R[(p, yr)]["maxP5"] for yr in YEARS) for p in pts}
    lo30 = [p for p in pts if abs(yp.lat_of(p)) <= 30]
    hi50 = [p for p in pts if abs(yp.lat_of(p)) >= 50]
    ok5 = all(med[p] >= 10 for p in lo30) and all(med[p] < 10 for p in hi50)
    print(f"W5 WG B5 dark-free payload >= 10 W at all {len(lo30)} pts <= 30 deg and < 10 W at all {len(hi50)} pts >= 50: "
          f"{'held' if ok5 else 'refuted'} (<= 30: min {min(med[p] for p in lo30):.0f}; >= 50: "
          f"max {max(med[p] for p in hi50):.0f})")
    d6 = st.fmean(R[k][("G", 10.0)][0] - R[k][("G", 3.0)][0] for k in hi40)
    print(f"W6 B3 -> B10 adds < 25 down days/yr at |lat| >= 40: {'held' if d6 < 25 else 'refuted'} ({d6:.1f})")
    kb = sum(R[k][("K", 5.0)][2] > 0 for k in allk)
    g60 = sum(R[k][("G", 5.0)][2] > 0 for k in allk if abs(R[k]["lat"]) == 60)
    print(f"W7 (K) B5 no bus dark point-year, (G) B5 some at 60 deg: {'held' if kb == 0 and g60 > 0 else 'refuted'} "
          f"((K) {kb} point-years with bus dark; (G) at 60 deg {g60})")
    lead = [p for p in pts if abs(K[p]["lat"]) >= 40 and K[p]["wg"] > K[p]["boat"]]
    flip = [p for p in lead if K[p]["boat_on"] > K[p]["wg_on"]]
    print(f"W8 boat leads payload-on km at >= half of the {len(lead)} pts >= 40 deg where WG leads total km: "
          f"{'held' if lead and 2 * len(flip) >= len(lead) else 'refuted'} ({len(flip)} of {len(lead)})")
    lo20 = [p for p in pts if abs(K[p]["lat"]) <= 20]
    r9 = min(K[p]["boat_on"] / K[p]["wg_on"] for p in lo20)
    print(f"W9 boat payload-on km >= 1.2 x WG's at every pt within 20 deg ({len(lo20)}): "
          f"{'held' if r9 >= 1.2 else 'refuted'} (min ratio {r9:.2f})")


if __name__ == "__main__":
    main()
