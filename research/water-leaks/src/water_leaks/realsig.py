"""Step 16: leak signatures from `L-TOWN_Real.inp` (the generator's model) on each leak's own day.

For a window starting at second `start` of 2018-19, the file is restarted there through the EPANET
2.2 toolkit: pattern start = `start` (the file's one-year 5-minute patterns wrap, as in step 14's
continuous run), tank T1 at its leak-free level and PUMP_1 at its leak-free status at that instant,
24 h at the file's 5-minute steps. A signature is the 24 h mean pressure change at the sensors when
a constant extra demand q (m3/h, the file's CMH units) is drawn at one junction.

Each process opens the 177 MB file once (about 2 s) and adds one zero-demand category to every
candidate junction; a run sets that category's base demand, so no file is rewritten per run.
Only `window_signatures` needs WNTR's bundled EPANET library.
"""
from __future__ import annotations

import ctypes
import os
import tempfile
from concurrent.futures import ProcessPoolExecutor

import numpy as np

STEP_S = 300
DAY_STEPS = 24 * 12
# EPANET toolkit codes (epanet2_enums.h)
EN_DURATION, EN_PATTERNSTART = 0, 4
EN_PRESSURE, EN_TANKLEVEL, EN_INITSTATUS = 11, 8, 4


class _Day:
    def __init__(self, inp, sensors, nodes, tank, pump):
        from wntr.epanet import toolkit  # noqa: PLC0415 (heavy, optional)

        d = tempfile.mkdtemp(prefix="wlr_")
        self.en = toolkit.ENepanet()
        self.en.ENopen(str(inp), os.path.join(d, "x.rpt"), os.path.join(d, "x.bin"))
        self.lib, self.ph = self.en.ENlib, self.en._project
        self.sens = [self.en.ENgetnodeindex(s) for s in sensors]
        self.tank = self.en.ENgetnodeindex(tank)
        self.pump = self.en.ENgetlinkindex(pump)
        self.cand = []
        for n in nodes:
            j = self.en.ENgetnodeindex(n)
            if self.lib.EN_adddemand(self.ph, j, ctypes.c_double(0.0), b"", b"leak"):
                raise RuntimeError(f"EN_adddemand failed at {n}")
            k = ctypes.c_int()
            self.lib.EN_getnumdemands(self.ph, j, ctypes.byref(k))
            self.cand.append((j, k.value))
        self.en.ENsettimeparam(EN_DURATION, (DAY_STEPS - 1) * STEP_S)

    def run(self, start, level, pump_open, extra=None):
        """Sensor pressures [288, sensors] every 5 minutes from `start` (s since 2018-01-01)."""
        if extra is not None:
            i, q = extra
            j, k = self.cand[i]
            self.lib.EN_setbasedemand(self.ph, j, k, ctypes.c_double(q))
        self.en.ENsettimeparam(EN_PATTERNSTART, int(start))
        self.en.ENsetnodevalue(self.tank, EN_TANKLEVEL, float(level))
        self.en.ENsetlinkvalue(self.pump, EN_INITSTATUS, 1.0 if pump_open else 0.0)
        out = np.full((DAY_STEPS, len(self.sens)), np.nan)
        self.en.ENopenH()
        self.en.ENinitH(0)
        while True:
            t = self.en.ENrunH()
            if t % STEP_S == 0 and t // STEP_S < DAY_STEPS:
                out[t // STEP_S] = [self.en.ENgetnodevalue(s, EN_PRESSURE) for s in self.sens]
            if self.en.ENnextH() <= 0:
                break
        self.en.ENcloseH()
        if extra is not None:
            self.lib.EN_setbasedemand(self.ph, j, k, ctypes.c_double(0.0))
        return out


def _worker(args):
    inp, sensors, nodes, tank, pump, jobs = args
    day = _Day(inp, sensors, nodes, tank, pump)
    res = []
    for start, level, pump_open, q in jobs:
        base = day.run(start, level, pump_open)
        S = np.array([day.run(start, level, pump_open, (i, q)).mean(axis=0) for i in range(len(nodes))])
        res.append((base, S - base.mean(axis=0)))
    return res


def window_signatures(inp, sensors, nodes, windows, tank="T1", pump="PUMP_1", procs=4):
    """For each window (start s, T1 level m, PUMP_1 open bool, q m3/h): the restarted leak-free
    sensor pressures [288, sensors] and the signatures [nodes, sensors] (24 h mean change, m)."""
    chunks = [list(range(i, len(windows), procs)) for i in range(procs)]
    args = [(str(inp), list(sensors), list(nodes), tank, pump, [windows[k] for k in c]) for c in chunks if c]
    with ProcessPoolExecutor(len(args)) as ex:
        parts = list(ex.map(_worker, args))
    out = [None] * len(windows)
    for c, part in zip(chunks, parts):
        for k, r in zip(c, part):
            out[k] = r
    return out


def near_ties(scores, far, tol=1e-3):
    """How many candidates in `far` (a boolean mask) score within `tol` of the best score."""
    s = np.asarray(scores, dtype=float)
    return int(np.sum(far & (s >= np.nanmax(s) - tol)))


def rank_of(scores, idx):
    """1-based rank of the best-scoring candidate among `idx` (1 = the overall best)."""
    s = np.asarray(scores, dtype=float)
    best = max(s[i] for i in idx)
    return int(np.sum(s > best)) + 1
