"""Voltage schedules that do not come from the AC optimum, and a reactive stage after the dispatch.

Every AC check and linearisation in this project holds the generator voltage setpoints at a
schedule. Until milestone 3 of `research/grid-linopf` that schedule was the AC optimum's (an
oracle: a market engine that had the AC optimum would not need a repair). Here:

  file_schedule  the case file's own generator setpoints (VG column), what a model ships with;
  reactive_stage after the active-power dispatch is fixed, an AC OPF over voltages and reactive
                 power only: every non-slack unit's P pinned to the dispatch (within +-PIN_MW), the
                 slack free inside its limits, voltage, Q, thermal and angle limits enforced. Its
                 objective is the case's own cost, which with P pinned moves only through the slack,
                 so it trades losses. This is the "reactive stage after the dispatch" of the
                 programme proposal: the market clears P on a linear model, a second, smaller
                 problem sets voltages.
"""
import copy

import numpy as np
from pypower.api import ppoption, runopf
from pypower.idx_bus import VM
from pypower.idx_gen import GEN_BUS, GEN_STATUS, PG, PMAX, PMIN, VG

from .aclin import slack_gen

PIN_MW = 0.01
ACOPT = ppoption(VERBOSE=0, OUT_ALL=0, OPF_ALG=560)


def file_schedule(ppc):
    """The case file's generator voltage setpoints (per unit)."""
    return ppc["gen"][:, VG].copy()


def opt_schedule(ppc, ac):
    """The AC optimum's voltage magnitude at each generator's bus (the oracle schedule)."""
    vm = dict(zip(ac["bus"][:, 0].astype(int), ac["bus"][:, VM]))
    return np.array([vm[int(b)] for b in ppc["gen"][:, GEN_BUS]])


def ref_for(ppc, vg):
    """A result-like dict whose bus VM puts vg at every generator bus, the form the AC checks read
    their schedule from (run_pglib.ac_check takes VG from the reference's bus voltages)."""
    bus = ppc["bus"].copy()
    bus[:, VM] = 1.0
    pos = {int(b): i for i, b in enumerate(bus[:, 0])}
    for gb, v in zip(ppc["gen"][:, GEN_BUS].astype(int), vg):
        bus[pos[gb], VM] = v
    return {"bus": bus}


def pinned(ppc, pg, pin=PIN_MW):
    """A copy of ppc whose live non-slack units are pinned to pg (within +-pin MW, clipped to their
    range); the slack keeps its own limits."""
    p = copy.deepcopy(ppc)
    g = p["gen"]
    s = slack_gen(ppc)
    for k in range(g.shape[0]):
        if g[k, GEN_STATUS] <= 0 or k == s:
            continue
        lo, hi = max(pg[k] - pin, ppc["gen"][k, PMIN]), min(pg[k] + pin, ppc["gen"][k, PMAX])
        if lo > hi:  # pg outside the unit's range: keep the nearer bound
            lo = hi = float(np.clip(pg[k], ppc["gen"][k, PMIN], ppc["gen"][k, PMAX]))
        g[k, PMIN], g[k, PMAX] = lo, hi
        g[k, PG] = 0.5 * (lo + hi)
    return p


def reactive_stage(ppc, pg):
    """AC OPF over voltages and Q with P pinned to pg. Returns (pg_out, vg_out, result) or None when
    PIPS finds no solution (not proof that none exists)."""
    r = runopf(pinned(ppc, pg), ACOPT)
    if not r["success"]:
        return None
    return r["gen"][:, PG].copy(), opt_schedule(ppc, r), r
