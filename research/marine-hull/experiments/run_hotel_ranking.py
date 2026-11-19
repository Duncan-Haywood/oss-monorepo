"""Milestone 7v: where Table I's ranking breaks as the hotel load grows.

    PYTHONPATH=src:experiments python3 experiments/run_hotel_ranking.py > experiments/results_hotel_ranking.txt

Every rung in Table I was compared at one hotel load, 30 W. This script reruns the comparison with the
hotel load on a log grid from 1 W to 10 kW (12 points per decade), using each rung's central case and
speed grid exactly as milestone 7t did (`run_range_speed.py`), on the common basis (200 kg, 10 kWh,
eta 0.55 x 0.85). For each hotel load it reports every rung's peak range, best speed and ratio to the
monohull, and the monohull's best-speed Froude number; then the hotel load at which each rung first
overtakes the monohull (log-interpolated crossing of range ratio 1).

Robustness: the hydrofoil's milestone-5 box without the battery axis (972 cases; battery energy
cancels in a range ratio) and the planing box (16 cases), each against the monohull at k 0.10, 0.25
and 0.40.

Expectations (committed to LOG.md before the first run): E1 30 W reproduces 7t; E2 the monohull leads
every rung at every hotel load up to 200 W, central and box; E3 the central hydrofoil overtakes in
300 W to 3 kW; E4 hydrofoil range >= planing range at every hotel load; E5 every crossover sits where
the monohull's best speed is above Froude number 0.3 (outside the validated displacement regime).
"""
import itertools
import math
import sys

from marine_hull.foil import foil_drag
from marine_hull.planing import best_trim_drag
import run_michell as rm
import run_range_speed as rr

G = 9.81
HOTELS = [10 ** (i / 12.0) for i in range(0, 49)]   # 1 W to 10 kW
SOURCED_BAND = 200.0                                # top of the programme's sourced payload loads (REMUS implied 104-175 W)
ETA = 0.55 * 0.85


def peak_at(speeds, res, hotel, wh=rr.WH):
    """(range_km, speed) maximised over the grid; resistance None = infeasible."""
    best = (0.0, 0.0)
    for u, r in zip(speeds, res):
        if r is None:
            continue
        km = wh * 3600.0 / (r * u / ETA + hotel) * u / 1000.0
        if km > best[0]:
            best = (km, u)
    return best


def crossing(hotels, ratios):
    """First hotel load where ratio rises through 1 (log-linear interpolation), or None."""
    for i in range(1, len(ratios)):
        a, b = ratios[i - 1], ratios[i]
        if a < 1.0 <= b:
            la, lb = math.log10(hotels[i - 1]), math.log10(hotels[i])
            return 10 ** (la + (1.0 - a) / (b - a) * (lb - la))
        if i == 1 and a >= 1.0:
            return hotels[0]
    return None


def froude(u, length=4.0):
    return u / math.sqrt(G * length)


def foil_res(area, ar, e, cd0, draft, extra, clmax, speeds):
    out = []
    for v in speeds:
        d, cl = foil_drag(v, rm.M, area, ar, e=e, cd0=cd0, strut_draft=draft, extra=extra)
        out.append(d if 0.05 <= cl <= clmax else None)
    return out


def planing_res(beam, beta, speeds):
    out = []
    for v in speeds:
        r = best_trim_drag(v, rm.M, beam, beta)
        out.append(None if r is None else r[0])
    return out


def q(xs, f):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(f * len(xs)))]


def fmt_w(x):
    return "never (to 10 kW)" if x is None else f"{x:.0f} W"


def main(out=sys.stdout):
    p = lambda s="": print(s, file=out)
    D, F = rr.DISP, rr.FAST
    mono = rr.michell_r(4.0, 1, 0.0, 0.25, 0.0, D)
    rungs = [
        ("catamaran", D, rr.michell_r(4.0, 2, 0.25, 0.25, 0.15, D)),
        ("SWATH", D, rr.swath_r(D)),
        ("planing", F, rr.planing_r(F)),
        ("hydrofoil", F, rr.foil_r(F)),
    ]
    p(f"basis: 200 kg, {rr.WH:.0f} Wh, eta 0.55 x 0.85; central case of each rung (as 7t); hotel 1 W to 10 kW, 12 per decade")
    p("# per hotel: monohull km, best speed, Fn; each rung ratio to monohull (best speed); order")
    ratios = {n: [] for n, _, _ in rungs}
    mono_fn = []
    peaks = {}
    for h in HOTELS:
        mk, mu = peak_at(D, mono, h)
        mono_fn.append(froude(mu))
        row = [f"hotel {h:8.1f} W  mono {mk:8.1f} km at {mu:4.2f} m/s Fn {froude(mu):.2f}"]
        pk = {"monohull": mk}
        for n, sp, res in rungs:
            km, u = peak_at(sp, res, h)
            pk[n] = km
            ratios[n].append(km / mk)
            row.append(f"{n} {km / mk:.3f} ({u:.2f})")
        peaks[h] = pk
        order = " > ".join(sorted(pk, key=lambda k: -pk[k]))
        p("  ".join(row) + "  | " + order)
    p("# check at 30 W (E1; 7t: 0.866, 0.663, 0.097, 0.141)")
    for n, sp, res in rungs:
        km, u = peak_at(sp, res, 30.0)
        p(f"30 W {n}: ratio {km / peak_at(D, mono, 30.0)[0]:.3f}")
    p("# break-even hotel load per rung (central case), and monohull best-speed Fn there")
    xs = {}
    for n, _, _ in rungs:
        x = crossing(HOTELS, ratios[n])
        xs[n] = x
        if x is None:
            p(f"break-even {n}: never (to 10 kW); max ratio {max(ratios[n]):.3f}")
        else:
            i = next(i for i, h in enumerate(HOTELS) if h >= x)
            p(f"break-even {n}: {x:.0f} W; monohull Fn at next grid hotel {mono_fn[i]:.2f}")
    lead200 = all(peaks[h]["monohull"] >= max(v for k, v in peaks[h].items() if k != "monohull")
                  for h in HOTELS if h <= SOURCED_BAND)
    p(f"monohull leads every rung at every hotel <= {SOURCED_BAND:.0f} W (central): {lead200}")
    fge = sum(1 for i in range(len(HOTELS)) if ratios["hydrofoil"][i] >= ratios["planing"][i])
    p(f"hydrofoil >= planing at {fge} of {len(HOTELS)} hotel loads")
    first_fn03 = next((h for h, fn in zip(HOTELS, mono_fn) if fn > 0.3), None)
    p(f"monohull best speed first above Fn 0.3 at hotel {fmt_w(first_fn03)}")

    p("# box robustness: break-even hotel load against the monohull at k 0.10 / 0.25 / 0.40")
    foil_ax = dict(area=[0.02, 0.04, 0.08], ar=[6.0, 10.0, 14.0], e=[0.8, 0.95], cd0=[0.008, 0.012, 0.02],
                   draft=[0.3, 0.5], extra=[1.0, 1.15, 1.4], clmax=[0.8, 1.2, 1.6])
    plan_ax = dict(beam=[0.5, 0.7, 0.9, 1.1], beta=[0.0, 10.0, 20.0, 30.0])
    foil_cases = [foil_res(*c, F) for c in itertools.product(*foil_ax.values())]
    plan_cases = [planing_res(*c, F) for c in itertools.product(*plan_ax.values())]
    for k in (0.10, 0.25, 0.40):
        mres = rr.michell_r(4.0, 1, 0.0, k, 0.0, D)
        mk = [peak_at(D, mres, h) for h in HOTELS]
        for name, cases in (("hydrofoil", foil_cases), ("planing", plan_cases)):
            feas = [c for c in cases if any(r is not None for r in c)]
            be, below = [], 0
            for c in feas:
                rat = [peak_at(F, c, h)[0] / m[0] for h, m in zip(HOTELS, mk)]
                x = crossing(HOTELS, rat)
                if x is not None:
                    be.append(x)
                    if x <= SOURCED_BAND:
                        below += 1
            line = f"k {k:.2f} {name}: {len(feas)} feasible of {len(cases)}; overtake by 10 kW in {len(be)}"
            if be:
                line += (f"; break-even min {min(be):.0f} W, 10th {q(be, 0.1):.0f}, median {q(be, 0.5):.0f}, "
                         f"90th {q(be, 0.9):.0f}, max {max(be):.0f}")
            line += f"; at or below {SOURCED_BAND:.0f} W: {below}"
            p(line)

    # Post hoc (not pre-registered; added after the first run showed the planing peak at the 20 m/s
    # grid ceiling from about 200 W up): the planing central case on a 1 to 40 m/s grid.
    p("# post hoc: planing central case with speeds to 40 m/s (first run's grid stopped at 20)")
    wide = [i / 4.0 for i in range(4, 161)]
    pw = rr.planing_r(wide)
    pr = []
    for h in HOTELS:
        km, u = peak_at(wide, pw, h)
        pr.append(km / peak_at(D, mono, h)[0])
        if h in (HOTELS[24], HOTELS[30], HOTELS[36], HOTELS[42], HOTELS[48]):
            p(f"post hoc planing at {h:.0f} W: ratio {pr[-1]:.3f} at {u:.2f} m/s")
    p(f"post hoc planing break-even: {fmt_w(crossing(HOTELS, pr))}")
    fge2 = sum(1 for i in range(len(HOTELS)) if ratios["hydrofoil"][i] >= pr[i])
    p(f"post hoc hydrofoil >= planing (wide grid) at {fge2} of {len(HOTELS)} hotel loads")


if __name__ == "__main__":
    main()
