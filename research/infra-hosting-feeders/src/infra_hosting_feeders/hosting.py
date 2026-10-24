"""Stochastic PV hosting capacity of the IEEE 34- and 123-node feeders in OpenDSS, scored per mitigation on the same placements.

A placement is a set of customer loads with weights; the PV total is ramped up from zero until the first violation of
ANSI C84.1 Range A (1.05 pu at a service bus) or of a transformer's kVA rating. The largest passing total (kW) is the
hosting capacity of that placement. Same method as `research/infra-hosting` (IEEE 13-node), generalised to any feeder
whose regulators are OpenDSS RegControls.
"""
from __future__ import annotations
from dataclasses import dataclass, replace
from pathlib import Path
import numpy as np
import opendssdirect as dss

ROOT = Path(__file__).resolve().parents[2] / "feeder"
V_MAX = 1.05            # ANSI C84.1 Range A upper limit at the service point (pu)
INV_OVERSIZE = 1.1      # inverter kVA / PV kW
SQRT3 = 3 ** 0.5


@dataclass(frozen=True)
class Feeder:
    name: str
    master: str
    source_pu: float | None = None      # override the source voltage (pu); None keeps the published case
    skip_buses: tuple = ("sourcebus",)


FEEDERS = {
    "34": Feeder("IEEE 34-node (published, source 1.05 pu)", "34/ieee34Mod1.dss"),
    "34@1.00": Feeder("IEEE 34-node, source set to 1.00 pu", "34/ieee34Mod1.dss", source_pu=1.0),
    "123": Feeder("IEEE 123-node", "123/IEEE123Master.dss"),
}


@dataclass(frozen=True)
class Measure:
    name: str
    volt_var: bool = False      # IEEE 1547-2018 Category B default volt-var curve
    pf: float = 1.0             # fixed power factor (absorbing) when < 1
    vreg_drop: float = 0.0      # volts (on the 120 V base) taken off every regulator set-point
    ldc: bool = True            # regulator line-drop compensation as in the case; False sets R = X = 0
    freeze_taps: bool = False   # hold the regulators at the taps they take with no PV


MEASURES = [
    Measure("baseline"),
    Measure("fixed pf 0.95", pf=0.95),
    Measure("volt-var", volt_var=True),
    Measure("regulator -2 V", vreg_drop=2.0),
    Measure("volt-var + reg -2 V", volt_var=True, vreg_drop=2.0),
]


def _cmd(s):
    return dss.Command(s)


def with_no_ldc(m: Measure) -> Measure:
    return replace(m, name=m.name + " [no LDC]", ldc=False)


def with_frozen(m: Measure) -> Measure:
    return replace(m, name=m.name + " [taps frozen]", freeze_taps=True)


def compile_feeder(f: Feeder, load_mult: float):
    master = ROOT / f.master
    _cmd("Clear")
    _cmd(f'Set DataPath="{master.parent}"')
    _cmd(f'Redirect "{master}"')
    _cmd("Set MaxControlIter=100")
    _cmd(f"Set LoadMult={load_mult}")
    if f.source_pu is not None:
        _cmd(f"Edit Vsource.source pu={f.source_pu}")


def customer_loads():
    """[(name, bus spec, phases, kV, kW)] for every Load element of the compiled circuit."""
    out = []
    dss.Loads.First()
    while True:
        out.append((dss.Loads.Name(), dss.CktElement.BusNames()[0], dss.Loads.Phases(), dss.Loads.kV(), dss.Loads.kW()))
        if not dss.Loads.Next():
            return out


def pv_terminal(bus: str, phases: int, kv: float):
    """Bus spec, phases and line-neutral/line-line kV for a PV system co-located with a load. A single-phase load across two
    nodes (line to line) gets a PV on its first node, line to neutral."""
    parts = bus.split(".")
    nodes = parts[1:]
    if phases == 1 and len(nodes) >= 2:
        return f"{parts[0]}.{nodes[0]}", 1, kv / SQRT3
    return bus, phases, kv


def open_circuit(f: Feeder, m: Measure, load_mult: float, pv: dict[str, float] | None = None):
    """Compile the feeder, apply the measure, and add PV at the given loads ({load name: PV kW}). Returns PV element names."""
    compile_feeder(f, load_mult)
    regs = [r for r in dss.RegControls.AllNames()]
    if m.vreg_drop:
        for r in regs:
            dss.RegControls.Name(r)
            _cmd(f"RegControl.{r}.vreg={dss.RegControls.ForwardVreg() - m.vreg_drop}")
    if m.freeze_taps:
        _cmd("Solve")
        for r in regs:
            dss.RegControls.Name(r)
            xf = dss.RegControls.Transformer()
            dss.Transformers.Name(xf)
            tap = dss.Transformers.Tap()
            _cmd(f"RegControl.{r}.enabled=no")
            _cmd(f"Transformer.{xf}.Tap={tap}")
    if not m.ldc:
        for r in regs:
            _cmd(f"Edit RegControl.{r} R=0 X=0")
    loads = customer_loads()
    info = {n: (bus, ph, kv) for n, bus, ph, kv, _ in loads}
    if m.volt_var:
        _cmd("New XYCurve.vv npts=4 xarray=[0.92 0.98 1.02 1.08] yarray=[0.44 0 0 -0.44]")
    names = []
    for n, kw in (pv or {}).items():
        bus, ph, kv = pv_terminal(*info[n])
        pf = f" pf=-{m.pf}" if m.pf < 1.0 and not m.volt_var else " pf=1"
        _cmd(f"New PVSystem.pv_{n} phases={ph} bus1={bus} kV={kv} Pmpp={kw} kVA={INV_OVERSIZE * kw} irradiance=1 "
             f"%cutin=0.01 %cutout=0.01 temperature=25{pf}")
        names.append(f"PVSystem.pv_{n}")
    if m.volt_var and names:
        _cmd(f"New InvControl.ic DERList=[{','.join(names)}] mode=VOLTVAR voltage_curvex_ref=rated vvc_curve1=vv "
             "RefReactivePower=VARAVAL deltaQ_factor=0.3 VarChangeTolerance=0.025 VoltageChangeTolerance=0.0001")
    return names


def set_pv(names, kws):
    for n, kw in zip(names, kws):
        _cmd(f"Edit {n} Pmpp={kw} kVA={max(INV_OVERSIZE * kw, 1e-3)}")


def violations(f: Feeder) -> dict[str, float]:
    """Solve; return the worst ratio to each limit (above 1 is a violation), the worst line current (A) and convergence."""
    try:
        _cmd("Solve")
        conv = dss.Solution.Converged()
    except dss.DSSException:    # control iterations exhausted: treat as not converged
        conv = False
    out = {"converged": 1.0 if conv else 0.0, "voltage": 0.0, "xfmr": 0.0, "line_amps": 0.0}
    skip = {s.lower() for s in f.skip_buses}
    for b in dss.Circuit.AllBusNames():
        if b.lower() in skip:
            continue
        dss.Circuit.SetActiveBus(b)
        v = dss.Bus.puVmagAngle()[0::2]
        if v:
            out["voltage"] = max(out["voltage"], max(v) / V_MAX)
    for ln in dss.Lines.AllNames():
        dss.Lines.Name(ln)
        if dss.Lines.IsSwitch():
            continue
        n = dss.Lines.Phases()
        out["line_amps"] = max(out["line_amps"], max(dss.CktElement.CurrentsMagAng()[0:2 * n:2]))
    for t in dss.Transformers.AllNames():
        dss.Transformers.Name(t)
        p = dss.CktElement.Powers()
        nph = dss.CktElement.NumPhases()
        s = sum(np.hypot(p[2 * k], p[2 * k + 1]) for k in range(nph))
        out["xfmr"] = max(out["xfmr"], s / dss.Transformers.kVA())
    return out


def _ok(v):
    return v["converged"] > 0 and max(v["voltage"], v["xfmr"]) <= 1.0


def hosting_capacity(f: Feeder, m: Measure, load_mult: float, weights: dict[str, float], hi_kw: float = 20000.0,
                     coarse_kw: float = 200.0, fine_kw: float = 20.0):
    """Largest total PV (kW) reached by ramping up from zero before the first violation (the regulators follow the ramp from
    solve to solve). A coarse step finds the first failing interval, a fine step inside it the last clean total.
    Returns (kW, limit that fails first, worst line current in A at the last clean total)."""
    names = open_circuit(f, m, load_mult, {n: 1.0 for n in weights})
    w = np.array(list(weights.values()), float)
    w = w / w.sum()
    last = {}

    def at(total):
        set_pv(names, total * w)
        return violations(f)

    v0 = at(0.0)
    if not _ok(v0):
        return 0.0, "base", v0["line_amps"]
    lo, x = 0.0, coarse_kw
    last = v0
    while x <= hi_kw:
        v = at(x)
        if not _ok(v):
            break
        lo, x, last = x, x + coarse_kw, v
    else:
        return hi_kw, "cap", last["line_amps"]
    y = lo + fine_kw
    while y < x:
        v = at(y)
        if not _ok(v):
            break
        lo, y, last = y, y + fine_kw, v
    bind = max(("voltage", "xfmr"), key=lambda k: v[k]) if v["converged"] else "diverged"
    return lo, bind, last["line_amps"]


def random_placement(rng: np.random.Generator, nodes: list[str], k_range=(1, 8)):
    """A random subset of customer loads with Dirichlet(1) weights."""
    k = int(rng.integers(k_range[0], k_range[1] + 1))
    idx = rng.choice(len(nodes), size=k, replace=False)
    w = rng.dirichlet(np.ones(k))
    return {nodes[i]: float(x) for i, x in zip(idx, w)}


def load_names(f: Feeder) -> list[str]:
    compile_feeder(f, 1.0)
    return [n for n, *_ in customer_loads()]


def feeder_peak_kw(f: Feeder) -> float:
    compile_feeder(f, 1.0)
    return sum(kw for *_, kw in customer_loads())
