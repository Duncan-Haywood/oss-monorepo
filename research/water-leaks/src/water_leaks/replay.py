"""Step 17: replaying the published leaks through `L-TOWN_Real.inp` (the generator's model).

Each leak pipe is split at its midpoint through the EPANET 2.2 toolkit (a new junction at the
mean of the two end elevations, the two halves keeping the pipe's diameter, roughness and half
its length each, minor loss on the first half), and the junction draws the leak's published
5-minute flow as a demand set before every hydraulic solve. A window restarts the model at
second `start` of 2018-19 with tank T1 at its published level and PUMP_1 at its published
status, as step 16 restarts it from the leak-free state.

`replayed` lets a caller leave any leaks out: with every leak in, the run should reproduce the
published pressures (the replay gate); with one leak out, published minus the run is that
leak's own pressure effect (the per-leak oracle residual). Only `Replay` needs WNTR's bundled
EPANET library.
"""
from __future__ import annotations

import ctypes
import os
import tempfile
from concurrent.futures import ProcessPoolExecutor

import numpy as np

from .realsig import DAY_STEPS, EN_DURATION, EN_INITSTATUS, EN_PATTERNSTART, EN_PRESSURE, EN_TANKLEVEL, STEP_S

# EPANET toolkit codes (epanet2_enums.h)
EN_JUNCTION, EN_PIPE = 0, 1
EN_ELEVATION, EN_DIAMETER, EN_LENGTH, EN_ROUGHNESS, EN_MINORLOSS = 0, 0, 1, 2, 3


def split_name(pipe):
    return f"LK_{pipe}"


class Replay:
    def __init__(self, inp, sensors, pipes, tank="T1", pump="PUMP_1"):
        from wntr.epanet import toolkit  # noqa: PLC0415 (heavy, optional)

        d = tempfile.mkdtemp(prefix="wlp_")
        self.en = toolkit.ENepanet()
        self.en.ENopen(str(inp), os.path.join(d, "x.rpt"), os.path.join(d, "x.bin"))
        self.lib, self.ph = self.en.ENlib, self.en._project
        one = b"LK_ONE"
        self._ok(self.lib.EN_addpattern(self.ph, one))
        pat = ctypes.c_int()
        self._ok(self.lib.EN_getpatternindex(self.ph, one, ctypes.byref(pat)))
        self._ok(self.lib.EN_setpattern(self.ph, pat.value, (ctypes.c_double * 1)(1.0), 1))
        for p in pipes:
            self._split(p, pat.value)
        # node indices shift as junctions are added, so look every node up afterwards
        self.sens = [self.en.ENgetnodeindex(s) for s in sensors]
        self.tank = self.en.ENgetnodeindex(tank)
        self.pump = self.en.ENgetlinkindex(pump)
        self.leak = [self.en.ENgetnodeindex(split_name(p)) for p in pipes]
        self.en.ENsettimeparam(EN_DURATION, (DAY_STEPS - 1) * STEP_S)

    def _ok(self, code):
        if code and code > 100:
            raise RuntimeError(f"EPANET error {code}")

    def _split(self, pipe, pat):
        lk = self.en.ENgetlinkindex(pipe)
        a, b = ctypes.c_int(), ctypes.c_int()
        self._ok(self.lib.EN_getlinknodes(self.ph, lk, ctypes.byref(a), ctypes.byref(b)))
        za = self.en.ENgetnodevalue(a.value, EN_ELEVATION)
        zb = self.en.ENgetnodevalue(b.value, EN_ELEVATION)
        b_id = self.en.ENgetnodeid(b.value)
        name = split_name(pipe).encode()
        j = ctypes.c_int()
        self._ok(self.lib.EN_addnode(self.ph, name, EN_JUNCTION, ctypes.byref(j)))
        self.en.ENsetnodevalue(j.value, EN_ELEVATION, 0.5 * (za + zb))
        self._ok(self.lib.EN_setdemandpattern(self.ph, j.value, 1, pat))
        dia = self.en.ENgetlinkvalue(lk, EN_DIAMETER)
        rough = self.en.ENgetlinkvalue(lk, EN_ROUGHNESS)
        length = self.en.ENgetlinkvalue(lk, EN_LENGTH)
        # adding a junction can shift tank and reservoir indices, so re-read the pipe's nodes
        b_bytes = b_id.encode() if isinstance(b_id, str) else b_id
        a2, b2 = ctypes.c_int(), ctypes.c_int()
        self._ok(self.lib.EN_getlinknodes(self.ph, lk, ctypes.byref(a2), ctypes.byref(b2)))
        self._ok(self.lib.EN_setlinknodes(self.ph, lk, a2.value, j.value))
        self.en.ENsetlinkvalue(lk, EN_LENGTH, length / 2)
        k = ctypes.c_int()
        self._ok(self.lib.EN_addlink(self.ph, (pipe + "_B").encode(), EN_PIPE, name, b_bytes, ctypes.byref(k)))
        self.en.ENsetlinkvalue(k.value, EN_DIAMETER, dia)
        self.en.ENsetlinkvalue(k.value, EN_ROUGHNESS, rough)
        self.en.ENsetlinkvalue(k.value, EN_LENGTH, length / 2)

    def run(self, start, level, pump_open, flows):
        """Sensor pressures [288, sensors] every 5 minutes from `start` (s since 2018-01-01);
        `flows` [288, pipes] m3/h, the demand at each split junction over the window (0 = left out)."""
        self.en.ENsettimeparam(EN_PATTERNSTART, int(start))
        self.en.ENsetnodevalue(self.tank, EN_TANKLEVEL, float(level))
        self.en.ENsetlinkvalue(self.pump, EN_INITSTATUS, 1.0 if pump_open else 0.0)
        out = np.full((DAY_STEPS, len(self.sens)), np.nan)
        self.en.ENopenH()
        self.en.ENinitH(0)
        t = 0
        while True:
            k = min(t // STEP_S, DAY_STEPS - 1)
            for j, q in zip(self.leak, flows[k]):
                self.lib.EN_setbasedemand(self.ph, j, 1, ctypes.c_double(float(q)))
            t = self.en.ENrunH()
            if t % STEP_S == 0 and t // STEP_S < DAY_STEPS:
                out[t // STEP_S] = [self.en.ENgetnodevalue(s, EN_PRESSURE) for s in self.sens]
            step = self.en.ENnextH()
            if step <= 0:
                break
            t += step
        self.en.ENcloseH()
        return out


def _worker(args):
    inp, sensors, pipes, jobs = args
    r = Replay(inp, sensors, pipes)
    return [r.run(*job) for job in jobs]


def run_windows(inp, sensors, pipes, jobs, procs=4):
    """Each job (start s, T1 level m, PUMP_1 open bool, flows [288, pipes]) -> pressures [288, sensors]."""
    chunks = [list(range(i, len(jobs), procs)) for i in range(procs)]
    args = [(str(inp), list(sensors), list(pipes), [jobs[k] for k in c]) for c in chunks if c]
    with ProcessPoolExecutor(len(args)) as ex:
        parts = list(ex.map(_worker, args))
    out = [None] * len(jobs)
    for c, part in zip(chunks, parts):
        for k, r in zip(c, part):
            out[k] = r
    return out
