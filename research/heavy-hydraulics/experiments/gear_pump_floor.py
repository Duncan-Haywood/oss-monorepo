"""Milestone 7zb: is 7za's drag-free floor b = 1.263 the valve reading's, and does Danfoss stay the only bending
family in every idle setting? (LOG.md 7za Next p and 7z/7za's "one central condition" limit; predictions PB1 to
PB4 written in LOG.md and pushed before this ran)

A fixed gear pump's idle power is q * P_s(p_n(q n_r)) / Q20_s blended between sizes (excavator_gear_pump.Gear.idle),
which does not depend on the standby flow (that enters only the load-sensing pump), so of 7j's 18 idle settings six
are distinct for b: three neutral-pressure readings at idle speed ratio 1 and 0.5.

A pump with no drag and one efficiency eta absorbs q p_n(q n_r) / (600 eta), so its bend is
    b0 = (Q_HI p_n(Q_HI n_r)) / (Q_LO p_n(Q_LO n_r))      (eta cancels),
the valve reading's drag-free bend. It is not a floor: a drag proportional to flow pulls b towards 79/64 = 1.234
(tests/test_gear_pump_floor.py), so b0 is the ceiling of a pump whose drag per litre is the same at every size. Both Salami readings are p_n ~ q^2, so there b0 = (79/64)^3 = 1.881, above 7y's cut of
1.55; the relative bend r = b / b0 is read alongside b.

Printed per setting and family: P_idle(64), P_idle(79), b, r, and the share of P_idle(64) and P_idle(79) that is
zero-pressure drag (each size's power line at the idle speed continued to p = 0, blended as Gear.idle blends).
Families are built with skip_short=True, as 7j built Danfoss (6m): at half speed (1050 r/min) the only curves not
drawn are Danfoss SNP3's rated-pressure ones (210 to 250 bar, drawn from about 1000 r/min on some sizes), which idle
does not read; every other family's curves all reach 1050 r/min. The central-condition values reproduce 7za's
(tests/test_gear_pump_floor.py).

Usage: python gear_pump_floor.py > gear_pump_floor_results.txt     (numpy; no Hugging Face data; under a minute)
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
import catalogue_screen as cs  # noqa: E402
import gear_pump_argo as ga  # noqa: E402
import gear_pump_polaris as gp  # noqa: E402
from excavator_gear_pump import Gear  # noqa: E402
from excavator_idle_standby import CENTRAL, READINGS  # noqa: E402

SETTINGS = [(r, n) for r in READINGS for n in (1.0, 0.5)]       # standby flow does not enter a fixed pump's idle
DANFOSS, ARGO = "danfoss SNP3", "argo GP3"


def families():
    f = cs.families()
    f["casappa PLP30"] = (gp.polaris_rows(), gp.pl.SIZES)
    f[ARGO] = (ga.argo_rows(), ga.SIZES)
    return f


def floor(reading, n_r, lo=cs.Q_LO, hi=cs.Q_HI):
    pn = READINGS[reading]
    return hi * pn(hi * n_r) / (lo * pn(lo * n_r))


def drag(gear, q):
    """Zero-pressure drag part of gear.idle(q, .): the same blend with each size's line read at p = 0."""
    return q * gear._blend(q, lambda s: gear.pts[s][1](0.0) / gear.qn[gear.sizes.index(s)])


def read(gear, reading, n_r):
    pn = READINGS[reading]
    P = {q: gear.idle(q, pn(q * n_r)) for q in (cs.Q_LO, cs.Q_HI)}
    D = {q: drag(gear, q) for q in (cs.Q_LO, cs.Q_HI)}
    b = P[cs.Q_HI] / P[cs.Q_LO]
    return P, D, b, b / floor(reading, n_r)


def table():
    """{(reading, n_r): {family: (P, D, b, r)}}"""
    fams = families()
    out = {}
    for reading, n_r in SETTINGS:
        out[(reading, n_r)] = {name: read(Gear(rows, n_r, sizes=sz, skip_short=True), reading, n_r)
                               for name, (rows, sz) in fams.items()}
    return out


def main():
    out = []
    p = out.append
    tab = table()
    p("Milestone 7zb: the drag-free floor b0 and each family's bend in the six idle settings that differ for a fixed "
      "pump (7j's 18 less the standby flow)")
    p(f"b = P_idle({cs.Q_HI:.0f}) / P_idle({cs.Q_LO:.0f}); b0 = {cs.Q_HI:.0f} p_n({cs.Q_HI:.0f} n_r) / "
      f"({cs.Q_LO:.0f} p_n({cs.Q_LO:.0f} n_r)); r = b / b0; 'bends' means b > {cs.CUT} (7y's cut, set at the "
      f"central condition {CENTRAL})")
    p("drag% = share of P_idle that is zero-pressure drag at the idle speed (64 / 79 L/min)")
    p("")
    pb1, pb2, pb4, pb3 = [], [], [], None
    for (reading, n_r), rows in tab.items():
        b0 = floor(reading, n_r)
        p(f"{reading}, n_r {n_r}: b0 {b0:.3f}  (p_n at 64 and 79 L/min x n_r: {READINGS[reading](cs.Q_LO * n_r):.2f}, "
          f"{READINGS[reading](cs.Q_HI * n_r):.2f} bar)")
        p(f"  {'family':16s} {'P64':>7s} {'P79':>7s} {'b':>7s} {'r':>7s}  {'drag% 64/79':>12s}  class")
        for name, (P, D, b, r) in rows.items():
            p(f"  {name:16s} {P[cs.Q_LO]:7.3f} {P[cs.Q_HI]:7.3f} {b:7.3f} {r:7.3f}  "
              f"{100 * D[cs.Q_LO] / P[cs.Q_LO]:5.1f}/{100 * D[cs.Q_HI] / P[cs.Q_HI]:5.1f}  "
              f"{'bends' if b > cs.CUT else 'flat'}")
        others = {n: v[3] for n, v in rows.items() if n not in (DANFOSS, ARGO)}
        top = max(others, key=others.get)
        rd = rows[DANFOSS][3]
        nb = sum(v[2] > cs.CUT for v in rows.values())
        p(f"  GP3 b - b0 {rows[ARGO][2] - b0:+.3f}; Danfoss r {rd:.3f}, next {top} r {others[top]:.3f} "
          f"(gap {rd - others[top]:+.3f}); largest r overall: {max(rows, key=lambda n: rows[n][3])}; "
          f"{nb} of {len(rows)} read b > {cs.CUT}")
        p("")
        pb1.append(abs(rows[ARGO][2] - b0) <= 0.03)
        pb2.append(max(rows, key=lambda n: rows[n][3]) == DANFOSS)
        pb4.append(rd - others[top] >= 0.15)
        if (reading, n_r) == ("Salami-curve", 1.0):
            pb3 = nb
    p("Predictions (LOG.md 7zb):")
    p(f"  PB1 GP3 b within 0.03 of b0 in all six settings: {sum(pb1)} of 6 -> {'held' if all(pb1) else 'refuted'}")
    p(f"  PB2 Danfoss has the largest r in all six settings: {sum(pb2)} of 6 -> "
      f"{'held' if all(pb2) else 'refuted'}")
    p(f"  PB3 Salami-curve n_r 1: at least six of nine read b > {cs.CUT}: {pb3} -> "
      f"{'held' if pb3 >= 6 else 'refuted'}")
    p(f"  PB4 Danfoss r leads the other drag-carrying families by >= 0.15 in every setting: {sum(pb4)} of 6 -> "
      f"{'held' if all(pb4) else 'refuted'}")
    print("\n".join(out))


if __name__ == "__main__":
    main()
