"""Quasi-static day on the IEEE 123-node feeder: 1-minute steps, the regulators acting between steps, PV and load following shapes.

Where `hosting.py` asks how much PV a snapshot takes, this asks what a day with a fixed amount of PV costs under each measure:
minutes above 1.05 pu, minutes below 0.95 pu and regulator tap operations. Shapes are the ones distributed with the OpenDSS 123Bus
case (`feeder/123/PVShape.dss`, 1,440 one-minute irradiance points; `PaperLoadShape.txt`, 8,760 hourly load fractions).
"""
from __future__ import annotations
import re
from dataclasses import dataclass
import numpy as np
import opendssdirect as dss
from .hosting import ROOT, Feeder, Measure, open_circuit, V_MAX, _cmd

V_MIN = 0.95            # ANSI C84.1 Range A lower limit at the service point (pu)
STEPS = 1440            # one-minute steps in a day


def pv_shape() -> np.ndarray:
    """The 1,440-point one-minute PV irradiance shape (fraction of Pmpp) shipped with the OpenDSS 123-bus case."""
    txt = (ROOT / "123" / "PVShape.dss").read_text()
    return np.array(re.search(r"mult=\[(.*?)\]", txt, re.S).group(1).split(), float)


def load_year() -> np.ndarray:
    """The 8,760 hourly load fractions (peak 1.0) shipped with the case."""
    return np.loadtxt(ROOT / "123" / "PaperLoadShape.txt")


def load_day(day: int) -> np.ndarray:
    """1,440 one-minute load multipliers for day `day` (0-based), linear between the hourly points (the next day's first hour closes the last)."""
    y = load_year()
    h = y[day * 24: day * 24 + 25] if (day + 1) * 24 < len(y) else np.append(y[day * 24: day * 24 + 24], y[0])
    return np.interp(np.arange(STEPS) / 60.0, np.arange(25), h)


def day_stats(f: Feeder, m: Measure, load_mult: np.ndarray, pv_irr: np.ndarray, placement: dict[str, float], total_kw: float):
    """Run one day. Returns the minutes with any service node above V_MAX or below V_MIN, the regulator tap operations (steps moved
    between consecutive minutes, summed over every regulator; the regulators settle fully within each minute, so this is an upper
    bound on a regulator with a time delay), the highest and lowest service voltage and the number of steps that did not converge."""
    names = open_circuit(f, m, 1.0, {n: total_kw * w / sum(placement.values()) for n, w in placement.items()} if total_kw else None)
    skip = {s.lower() for s in f.skip_buses}
    regs = list(dss.RegControls.AllNames())
    xf = []
    for r in regs:
        dss.RegControls.Name(r)
        xf.append(dss.RegControls.Transformer())
    _cmd("Set mode=snapshot")
    node_bus = [n.split(".")[0].lower() for n in dss.Circuit.AllNodeNames()]
    keep = np.array([b not in skip for b in node_bus])
    over = under = bad = 0
    taps_prev = None
    ops = 0
    vmax = 0.0
    vmin = 9.0
    for k in range(STEPS):
        _cmd(f"Set LoadMult={load_mult[k]}")
        for n in names:
            _cmd(f"Edit {n} irradiance={pv_irr[k]}")
        try:
            _cmd("Solve")
            if not dss.Solution.Converged():
                bad += 1
        except dss.DSSException:
            bad += 1
        v = np.array(dss.Circuit.AllBusMagPu())
        if len(v) != len(keep):     # a PV terminal opened a node that the first solve had not yet created
            node_bus = [n.split(".")[0].lower() for n in dss.Circuit.AllNodeNames()]
            keep = np.array([b not in skip for b in node_bus])
        vs = v[keep & (v > 0.1)]
        vmax = max(vmax, vs.max())
        vmin = min(vmin, vs.min())
        over += int(vs.max() > V_MAX)
        under += int(vs.min() < V_MIN)
        taps = []
        for t in xf:
            dss.Transformers.Name(t)
            taps.append(dss.Transformers.Tap())
        if taps_prev is not None:
            ops += int(sum(abs(round((a - b) / 0.00625)) for a, b in zip(taps, taps_prev)))
        taps_prev = taps
    return {"over": over, "under": under, "ops": ops, "vmax": vmax, "vmin": vmin, "bad": bad}
