"""Leak-free L-Town: `L-TOWN_Real.inp` (the model BattLeDIM's data were generated from, with no
leaks) stepped through EPANET 2.2, read only at the SCADA points.

Step 14 (LOG.md). The file holds one year of 5-minute demand patterns (105,120 multipliers per
pattern) and the PUMP_1 on/off control on tank T1; only its duration (168 h in the file) is
changed, to one year. Each year is run separately from the file's initial state, as one year of
patterns implies. Reading 37 values per step through the toolkit avoids writing EPANET's binary
output for all 782 junctions (about 3 GB over a year).
"""
from __future__ import annotations

import os
import tempfile

import numpy as np

STEP_S = 300
YEAR_STEPS = 365 * 24 * 12

# EPANET toolkit codes (epanet2.h)
EN_DURATION, EN_HYDSTEP, EN_REPORTSTEP = 0, 1, 3
EN_PRESSURE, EN_FLOW = 11, 8


def run_year(inp, pressure_nodes, flow_links, level_tanks, steps=YEAR_STEPS):
    """Arrays sampled every 5 minutes from time 0: pressures [steps, p] (m), flows [steps, f]
    (m3/h, the file's CMH units), tank levels [steps, l] (m; EPANET's pressure at a tank is its
    level). Values are those in force at each 5-minute mark (EPANET may add intermediate steps
    for control switches and tank events; they are skipped)."""
    from wntr.epanet import toolkit

    d = tempfile.mkdtemp(prefix="ltown-")
    en = toolkit.ENepanet()
    en.ENopen(str(inp), os.path.join(d, "x.rpt"), os.path.join(d, "x.bin"))
    try:
        en.ENsettimeparam(EN_DURATION, (steps - 1) * STEP_S)
        pn = [en.ENgetnodeindex(n) for n in pressure_nodes]
        fl = [en.ENgetlinkindex(k) for k in flow_links]
        tk = [en.ENgetnodeindex(n) for n in level_tanks]
        P = np.full((steps, len(pn)), np.nan)
        F = np.full((steps, len(fl)), np.nan)
        L = np.full((steps, len(tk)), np.nan)
        en.ENopenH()
        en.ENinitH(0)
        while True:
            t = en.ENrunH()
            if t % STEP_S == 0 and t // STEP_S < steps:
                i = t // STEP_S
                P[i] = [en.ENgetnodevalue(j, EN_PRESSURE) for j in pn]
                F[i] = [en.ENgetlinkvalue(j, EN_FLOW) for j in fl]
                L[i] = [en.ENgetnodevalue(j, EN_PRESSURE) for j in tk]
            if en.ENnextH() <= 0:
                break
        en.ENcloseH()
    finally:
        en.ENclose()
    return P, F, L


EN_EMITTER = 3
CD = 0.75          # orifice discharge coefficient assumed for injected leaks (step 25)
G = 9.81


def emitter_coef(diameter_m):
    """EPANET emitter coefficient (CMH per m^0.5) of an orifice of this diameter: Q = C sqrt(p)
    with C = Cd pi d^2 / 4 sqrt(2 g) x 3600."""
    return CD * np.pi * diameter_m ** 2 / 4 * np.sqrt(2 * G) * 3600.0


def leak_shape(i, start, peak, end, kind):
    """Fraction of the full emitter coefficient at 5-minute index i. Abrupt: 1 on [start, end).
    Incipient: the diameter grows linearly from start to peak, so the area (and coefficient) as
    ((i - start) / (peak - start))^2, then 1 until end."""
    if i < start or i >= end:
        return 0.0
    if kind == "incipient" and i < peak:
        return ((i - start) / max(1, peak - start)) ** 2
    return 1.0


def run_injected(inp, pressure_nodes, leaks, steps=YEAR_STEPS):
    """Step 25: `run_year` with emitters switched on at junctions. leaks = [(node, C, start, peak,
    end, kind)] with times as 5-minute indices; each coefficient is set before every hydraulic
    solve from `leak_shape` at that time. Returns pressures at the sensors [steps, p] and at the
    leak nodes [steps, len(leaks)], both every 5 minutes."""
    from wntr.epanet import toolkit

    d = tempfile.mkdtemp(prefix="ltown-inj-")
    en = toolkit.ENepanet()
    en.ENopen(str(inp), os.path.join(d, "x.rpt"), os.path.join(d, "x.bin"))
    try:
        en.ENsettimeparam(EN_DURATION, (steps - 1) * STEP_S)
        pn = [en.ENgetnodeindex(n) for n in pressure_nodes]
        ln = [en.ENgetnodeindex(lk[0]) for lk in leaks]
        P = np.full((steps, len(pn)), np.nan)
        PL = np.full((steps, len(ln)), np.nan)

        def set_at(t):
            i = t // STEP_S
            for j, (_, c, s, pk, e, kind) in zip(ln, leaks):
                en.ENsetnodevalue(j, EN_EMITTER, c * leak_shape(i, s, pk, e, kind))

        en.ENopenH()
        en.ENinitH(0)
        t = 0
        set_at(0)
        while True:
            t = en.ENrunH()
            if t % STEP_S == 0 and t // STEP_S < steps:
                i = t // STEP_S
                P[i] = [en.ENgetnodevalue(j, EN_PRESSURE) for j in pn]
                PL[i] = [en.ENgetnodevalue(j, EN_PRESSURE) for j in ln]
            dt = en.ENnextH()
            if dt <= 0:
                break
            set_at(t + dt)
        en.ENcloseH()
    finally:
        en.ENclose()
    return P, PL
