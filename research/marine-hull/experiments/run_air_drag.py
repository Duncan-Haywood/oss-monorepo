"""Milestone 7w: air drag as a swept term on 7v's hotel-load ranking.

    PYTHONPATH=src:experiments python3 experiments/run_air_drag.py > experiments/results_air_drag.txt

Milestone 7v found the hydrofoil overtaking the monohull near 659 W of hotel load with no aerodynamic
drag on any rung. This script reruns 7v exactly (central cases, speed grids, common basis 200 kg,
10 kWh, eta 0.55 x 0.85, hotel 1 W to 10 kW at 12 per decade) with a still-air drag term

    D_air = 0.5 * rho_air * CdA * u^2,   rho_air = 1.225 kg/m3 (ISO 2533 standard sea-level atmosphere)

added to every rung's resistance at every speed. No measured drag area exists for these notional
200 kg craft, so CdA is swept over 0 to 0.4 m2 (Hoerner 1965: bluff bodies Cd about 0.8 to 1.2,
faired about 0.3, on frontal areas of 0.06 to 0.4 m2). The same CdA is applied to every rung, which
is conservative for the displacement rungs (less of them is in air).

Expectations (committed to LOG.md before the first run): A1 CdA 0 reproduces 7v; A2 the monohull
leads every rung up to 200 W at every CdA, central and all 972 foil-box cases; A3 the central foil
break-even rises monotonically with CdA and stays in 659 W to 1.5 kW at 0.4 m2; A4 with CdA >= 0.1
the wide-grid planing best speed at 10 kW is below 25 m/s and the foil is at or above planing at all
49 loads; A5 the displacement rungs' 30 W ratios move by under 1% at every CdA.
"""
import itertools
import sys

import run_hotel_ranking as hr
import run_range_speed as rr

RHO_AIR = 1.225                                  # kg/m3, ISO 2533 sea level
CDAS = [0.0, 0.02, 0.05, 0.1, 0.2, 0.4]          # m2, swept (no measured value for these craft)
WIDE = [i / 4.0 for i in range(4, 161)]          # 1 to 40 m/s, 7v's post hoc planing grid
HOTELS = hr.HOTELS


def with_air(speeds, res, cda):
    return [None if r is None else r + 0.5 * RHO_AIR * cda * u * u for u, r in zip(speeds, res)]


def base_rungs():
    D, F = rr.DISP, rr.FAST
    return (rr.michell_r(4.0, 1, 0.0, 0.25, 0.0, D), [
        ("catamaran", D, rr.michell_r(4.0, 2, 0.25, 0.25, 0.15, D)),
        ("SWATH", D, rr.swath_r(D)),
        ("planing", F, rr.planing_r(F)),
        ("hydrofoil", F, rr.foil_r(F)),
    ])


def central(cda, mono0, rungs0):
    """Per-rung ratio lists over HOTELS, monohull peaks, and the monohull-leads-to-200 W flag."""
    mono = with_air(rr.DISP, mono0, cda)
    mk = [hr.peak_at(rr.DISP, mono, h) for h in HOTELS]
    ratios, speeds = {}, {}
    for n, sp, res in rungs0:
        r = with_air(sp, res, cda)
        pk = [hr.peak_at(sp, r, h) for h in HOTELS]
        ratios[n] = [a[0] / m[0] for a, m in zip(pk, mk)]
        speeds[n] = [a[1] for a in pk]
    lead = all(max(ratios[n][i] for n in ratios) <= 1.0 for i, h in enumerate(HOTELS) if h <= hr.SOURCED_BAND)
    return ratios, speeds, mk, mono, lead


def main(out=sys.stdout):
    p = lambda s="": print(s, file=out)
    mono0, rungs0 = base_rungs()
    plan_wide0 = rr.planing_r(WIDE)
    foil_ax = dict(area=[0.02, 0.04, 0.08], ar=[6.0, 10.0, 14.0], e=[0.8, 0.95], cd0=[0.008, 0.012, 0.02],
                   draft=[0.3, 0.5], extra=[1.0, 1.15, 1.4], clmax=[0.8, 1.2, 1.6])
    foil_cases = [hr.foil_res(*c, rr.FAST) for c in itertools.product(*foil_ax.values())]
    foil_cases = [c for c in foil_cases if any(r is not None for r in c)]
    mono_k25 = rr.michell_r(4.0, 1, 0.0, 0.25, 0.0, rr.DISP)   # 7v's box comparison at k 0.25
    p(f"basis: 200 kg, {rr.WH:.0f} Wh, eta 0.55 x 0.85; 7v central cases; still-air drag 0.5 x {RHO_AIR} x CdA x u^2 on every rung")
    p(f"CdA swept (m2): {', '.join(f'{c:g}' for c in CDAS)}; hotel 1 W to 10 kW, 12 per decade")
    base30 = None
    for cda in CDAS:
        p(f"# CdA {cda:g} m2")
        ratios, speeds, mk, _, lead = central(cda, mono0, rungs0)
        # 30 W exactly, as 7v's E1 check
        m30 = hr.peak_at(rr.DISP, with_air(rr.DISP, mono0, cda), 30.0)[0]
        r30 = {n: hr.peak_at(sp, with_air(sp, res, cda), 30.0)[0] / m30 for n, sp, res in rungs0}
        if base30 is None:
            base30 = r30
        p("30 W ratios: " + ", ".join(f"{n} {r30[n]:.3f} ({100 * (r30[n] / base30[n] - 1):+.2f}%)" for n in r30))
        for n in ratios:
            x = hr.crossing(HOTELS, ratios[n])
            p(f"break-even {n}: {hr.fmt_w(x)}; max ratio {max(ratios[n]):.3f}")
        p(f"monohull leads every rung at every hotel <= {hr.SOURCED_BAND:.0f} W (central): {lead}")
        h10k = len(HOTELS) - 1
        p(f"at 10 kW: monohull {mk[h10k][0]:.1f} km at {mk[h10k][1]:.2f} m/s; hydrofoil best speed {speeds['hydrofoil'][h10k]:.2f} m/s")
        # planing on the wide grid
        pw = with_air(WIDE, plan_wide0, cda)
        prat, pu = [], None
        for i, h in enumerate(HOTELS):
            km, u = hr.peak_at(WIDE, pw, h)
            prat.append(km / mk[i][0])
            pu = u
        fge = sum(1 for i in range(len(HOTELS)) if ratios["hydrofoil"][i] >= ratios["planing"][i])
        fge_w = sum(1 for i in range(len(HOTELS)) if ratios["hydrofoil"][i] >= prat[i])
        p(f"planing wide grid (1-40 m/s): best speed at 10 kW {pu:.2f} m/s; break-even {hr.fmt_w(hr.crossing(HOTELS, prat))}")
        p(f"hydrofoil >= planing at {fge} of {len(HOTELS)} (20 m/s grid), {fge_w} of {len(HOTELS)} (40 m/s planing grid)")
        # foil box against k 0.25 monohull
        mres = with_air(rr.DISP, mono_k25, cda)
        mkb = [hr.peak_at(rr.DISP, mres, h)[0] for h in HOTELS]
        be, below, never = [], 0, 0
        for c in foil_cases:
            cc = with_air(rr.FAST, c, cda)
            rat = [hr.peak_at(rr.FAST, cc, h)[0] / m for h, m in zip(HOTELS, mkb)]
            x = hr.crossing(HOTELS, rat)
            if x is None:
                never += 1
            else:
                be.append(x)
                below += x <= hr.SOURCED_BAND
        line = f"foil box (k 0.25): {len(foil_cases)} feasible; overtake by 10 kW in {len(be)}, never in {never}"
        if be:
            line += (f"; break-even min {min(be):.0f} W, 10th {hr.q(be, 0.1):.0f}, median {hr.q(be, 0.5):.0f}, "
                     f"90th {hr.q(be, 0.9):.0f}")
        p(line + f"; at or below {hr.SOURCED_BAND:.0f} W: {below}")
    p("# curve: CdA hotel_W hydrofoil_ratio planing_ratio catamaran_ratio SWATH_ratio")
    for cda in CDAS:
        ratios = central(cda, mono0, rungs0)[0]
        for i, h in enumerate(HOTELS):
            p(f"curve {cda:g} {h:.1f} {ratios['hydrofoil'][i]:.4f} {ratios['planing'][i]:.4f} "
              f"{ratios['catamaran'][i]:.4f} {ratios['SWATH'][i]:.4f}")


if __name__ == "__main__":
    main()
