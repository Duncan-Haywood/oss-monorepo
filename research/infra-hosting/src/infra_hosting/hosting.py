"""Stochastic PV hosting capacity of the IEEE 13-node feeder in OpenDSS, scored per mitigation on the same placements.

A placement is a set of customer nodes with weights; the PV total is scaled up until the first violation of
ANSI C84.1 Range A (1.05 pu), of a line's ampacity or of a transformer's kVA rating. The largest passing total
(kW) is the hosting capacity of that placement.
"""
from __future__ import annotations
from dataclasses import dataclass, replace
from pathlib import Path
import numpy as np
import opendssdirect as dss

FEEDER = Path(__file__).resolve().parents[2] / "feeder" / "IEEE13Nodeckt.dss"
V_MAX = 1.05            # ANSI C84.1 Range A upper limit at the service point (pu)
# customer nodes = the feeder's Load elements
LOAD_NODES = ["671", "634a", "634b", "634c", "645", "646", "692", "675a", "675b", "675c", "611", "652", "670a", "670b", "670c"]
# conductor ampacities (A) by line code: typical ACSR/AA tables; recalled, not verified against the IEEE test-feeder document
AMPACITY = {"mtx601": 730.0, "mtx602": 340.0, "mtx603": 230.0, "mtx604": 230.0, "mtx605": 230.0, "mtx606": 260.0, "mtx607": 230.0}
XFMR_KVA = {"xfm1": 500.0, "reg1": 1666.0, "reg2": 1666.0, "reg3": 1666.0, "sub": 5000.0}
SKIP_BUSES = {"sourcebus", "650"}   # the stiff source / regulator primary are not service points
INV_OVERSIZE = 1.1      # inverter kVA / PV kW


@dataclass(frozen=True)
class Measure:
    name: str
    volt_var: bool = False      # IEEE 1547-2018 Category B default volt-var curve
    pf: float = 1.0             # fixed power factor (absorbing) when < 1
    vreg: float = 122.0         # regulator voltage set-point on the 120 V base
    ev_kw_per_kw: float = 0.0   # flexible midday EV charging load added per kW of customer load
    ldc: bool = True            # regulator line-drop compensation as in the test case (R 3, X 9 V); False sets both to 0
    freeze_taps: bool = False   # sensitivity: hold the regulators at the taps they take with no PV


MEASURES = [
    Measure("baseline"),
    Measure("fixed pf 0.95", pf=0.95),
    Measure("volt-var", volt_var=True),
    Measure("regulator -2 V", vreg=120.0),
    Measure("midday EV charging", ev_kw_per_kw=0.14),
    Measure("volt-var + reg -2 V + EV", volt_var=True, vreg=120.0, ev_kw_per_kw=0.14),
]


def _cmd(s):
    return dss.Command(s)


def with_no_ldc(m: Measure) -> Measure:
    return replace(m, name=m.name + " [no LDC]", ldc=False)


def with_frozen(m: Measure) -> Measure:
    return replace(m, name=m.name + " [taps frozen]", freeze_taps=True)


def open_circuit(m: Measure, load_mult: float, pv: dict[str, float] | None = None):
    """Compile the feeder, apply the measure, and add PV at the given nodes ({load name: PV kW}). Returns PV element names."""
    _cmd("Clear")
    _cmd(f'Set DataPath="{FEEDER.parent}"')
    _cmd(f'Redirect "{FEEDER}"')
    _cmd("Set MaxControlIter=100")
    _cmd(f"Set LoadMult={load_mult}")
    if m.vreg != 122.0:
        for r in ("Reg1", "Reg2", "Reg3"):
            _cmd(f"RegControl.{r}.vreg={m.vreg}")
    if m.freeze_taps:
        _cmd("Solve")
        for r in ("Reg1", "Reg2", "Reg3"):
            dss.Transformers.Name(r)
            tap = dss.Transformers.Tap()
            _cmd(f"RegControl.{r}.enabled=no")
            _cmd(f"Transformer.{r}.Tap={tap}")
    if not m.ldc:
        for r in ("Reg1", "Reg2", "Reg3"):
            _cmd(f"Edit RegControl.{r} R=0 X=0")
    loads = []
    dss.Loads.First()
    while True:
        loads.append((dss.Loads.Name(), dss.CktElement.BusNames()[0], dss.Loads.Phases(), dss.Loads.kV(), dss.Loads.kW()))
        if not dss.Loads.Next():
            break
    info = {n: (bus, ph, kv) for n, bus, ph, kv, _ in loads}
    if m.ev_kw_per_kw:
        for n, bus, ph, kv, kw in loads:
            _cmd(f"New Load.ev_{n} Bus1={bus} Phases={ph} Conn=Wye Model=1 kV={kv} kW={m.ev_kw_per_kw * kw} pf=0.99")
    if m.volt_var:
        _cmd("New XYCurve.vv npts=4 xarray=[0.92 0.98 1.02 1.08] yarray=[0.44 0 0 -0.44]")
    names = []
    for n, kw in (pv or {}).items():
        bus, ph, kv = info[n]
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


def violations() -> dict[str, float]:
    """Solve; return the worst ratio to each limit (above 1 is a violation) and whether the solution converged."""
    try:
        _cmd("Solve")
        conv = dss.Solution.Converged()
    except dss.DSSException:    # control iterations exhausted: treat as not converged
        conv = False
    out = {"converged": 1.0 if conv else 0.0, "voltage": 0.0, "line": 0.0, "xfmr": 0.0}
    for b in dss.Circuit.AllBusNames():
        if b.lower() in SKIP_BUSES:
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
        i = dss.CktElement.CurrentsMagAng()[0:2 * n:2]
        out["line"] = max(out["line"], max(i) / AMPACITY[dss.Lines.LineCode().lower()])
    for t in dss.Transformers.AllNames():
        dss.Transformers.Name(t)
        p = dss.CktElement.Powers()
        nph = dss.CktElement.NumPhases()
        s = sum(np.hypot(p[2 * k], p[2 * k + 1]) for k in range(nph))
        out["xfmr"] = max(out["xfmr"], s / XFMR_KVA[t.lower()])
    return out


def _ok(v):
    return v["converged"] > 0 and max(v["voltage"], v["line"], v["xfmr"]) <= 1.0


def hosting_capacity(m: Measure, load_mult: float, weights: dict[str, float], hi_kw: float = 12000.0,
                     coarse_kw: float = 100.0, fine_kw: float = 10.0):
    """Largest total PV (kW) reached by ramping the PV up from zero before the first violation (the regulators follow the ramp
    from solve to solve). A coarse step finds the first failing interval, a fine step inside it the last clean total.
    Returns (kW, limit that fails first)."""
    names = open_circuit(m, load_mult, {n: 1.0 for n in weights})
    w = np.array(list(weights.values()), float)
    w = w / w.sum()

    def at(total):
        set_pv(names, total * w)
        return violations()

    if not _ok(at(0.0)):
        return 0.0, "base"
    lo, x = 0.0, coarse_kw
    while x <= hi_kw:
        v = at(x)
        if not _ok(v):
            break
        lo, x = x, x + coarse_kw
    else:
        return hi_kw, "cap"
    # refine inside (lo, x): continue upward in small steps from the last clean total
    y = lo + fine_kw
    while y < x:
        v = at(y)
        if not _ok(v):
            break
        lo, y = y, y + fine_kw
    bind = max(("voltage", "line", "xfmr"), key=lambda k: v[k]) if v["converged"] else "diverged"
    return lo, bind


def random_placement(rng: np.random.Generator, k_range=(1, 8)):
    """A random subset of customer nodes with Dirichlet(1) weights."""
    k = int(rng.integers(k_range[0], k_range[1] + 1))
    idx = rng.choice(len(LOAD_NODES), size=k, replace=False)
    w = rng.dirichlet(np.ones(k))
    return {LOAD_NODES[i]: float(x) for i, x in zip(idx, w)}


def feeder_peak_kw() -> float:
    open_circuit(MEASURES[0], 1.0)
    dss.Loads.First()
    t = 0.0
    while True:
        t += dss.Loads.kW()
        if not dss.Loads.Next():
            return t


def study(n_place: int, load_mults, measures=MEASURES, seed=1):
    """Hosting capacity (kW, binding limit) for every (load level, measure) over identical placements."""
    rng = np.random.default_rng(seed)
    places = [random_placement(rng) for _ in range(n_place)]
    res = {(lm, m.name): [hosting_capacity(m, lm, p) for p in places] for lm in load_mults for m in measures}
    return places, res


def summarise(res, lm, name):
    kw = np.array([r[0] for r in res[(lm, name)]])
    return dict(median=float(np.median(kw)), p10=float(np.percentile(kw, 10)), p90=float(np.percentile(kw, 90)), mean=float(kw.mean()))
