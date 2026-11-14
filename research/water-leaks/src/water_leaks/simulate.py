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
