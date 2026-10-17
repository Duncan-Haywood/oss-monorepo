"""Size a tension plate with a required hole under three stress models and per-process hole rules.

Every rule value is an ASSUMED round number (typical order of magnitude), not a datasheet value.
Stress models for the peak stress at the hole, as a factor Kt_net on the net-section stress:
  "net section": Kt = 1 (ignores the concentration)
  "Kt = 3":      Kt = 3 (the large-plate value, Kirsch; ignores finite width)
  "FE":          Kt interpolated from 2D finite-element solves over d/W (see kt_table)
"""
from dataclasses import dataclass
import numpy as np
from scipy.interpolate import PchipInterpolator
from .fem import Plate, MATERIALS, solve_plate

T_RANGE_MIN = 1.2
LENGTH = 100.0       # plate length for mass (mm)
T_LOAD = 1000.0      # tensile load (N)
W_MAX = 60.0       # space available for the plate (mm), assumed
T_RANGE = (1.2, 25.0)
MODELS = ("net section", "Kt = 3", "FE")


@dataclass(frozen=True)
class Process:
    name: str
    material: str
    t_stock: tuple = ()        # allowed thicknesses; empty = continuous in T_RANGE
    t_min: float = T_RANGE_MIN
    t_max: float = 25.0
    d_min: float = 0.0         # smallest hole the process makes
    d_over_t_min: float = 0.0  # laser: hole at least this multiple of the thickness
    centre_edge_k: float = 0.0 # hole centre to edge distance at least k * d
    ligament_min: float = 1.2  # material left between hole and edge (mm)


FREE = {m: Process(f"free ({m})", m) for m in MATERIALS}
PROCESSES = {
    "FDM": Process("FDM", "plastic", d_min=2.0, centre_edge_k=1.0),
    "CNC routing": Process("CNC routing", "aluminium plate", t_stock=(3, 4, 5, 6, 8, 10, 12, 16, 20, 25), t_max=19.05,
                           d_min=6.35, centre_edge_k=1.5, ligament_min=3.175),
    "laser cutting": Process("laser cutting", "steel sheet", t_stock=(1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12), t_max=12.0,
                             d_over_t_min=1.0, centre_edge_k=1.5, ligament_min=1.0),
    "casting": Process("casting", "cast aluminium", t_min=3.0, d_min=6.0, centre_edge_k=2.0, ligament_min=3.0),
}

_KT_CACHE: dict = {}


def kt_table(n: int = 13, W: float = 30.0, mat: str = "steel sheet"):
    """FE net-section concentration factor on a grid of d/W (independent of material and load in the linear model)."""
    key = (n, W, mat)
    if key not in _KT_CACHE:
        x = np.linspace(0.02, 0.8, n)
        y = np.array([solve_plate(Plate(W=W, d=W * xi, t=1.0, T=100.0), MATERIALS[mat])["kt_net"] for xi in x])
        _KT_CACHE[key] = (x, y)
    return _KT_CACHE[key]


def kt(model: str, dw: float) -> float:
    if model == "net section":
        return 1.0
    if model == "Kt = 3":
        return 3.0
    x, y = kt_table()
    return float(PchipInterpolator(x, y, extrapolate=True)(np.clip(dw, x[0], x[-1])))


def stress_w(model: str, d: float, t: float, sigma: float, T: float = T_LOAD) -> float:
    """Smallest width W meeting Kt * T / ((W - d) t) <= sigma. Bisection (Kt may depend on d/W)."""
    lo, hi = d * 1.0001, 1e4
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        s = kt(model, d / mid) * T / ((mid - d) * t)
        lo, hi = (mid, hi) if s > sigma else (lo, mid)
    return hi


def size_plate(proc: Process, d: float, model: str, rules: bool = True, T: float = T_LOAD) -> dict:
    """Lightest plate (W, t) for a required hole diameter d. Returns the binding constraint."""
    mat = MATERIALS[proc.material]
    if rules and proc.d_min and d < proc.d_min:
        return {"feasible": False, "why": f"hole {d} mm below process minimum {proc.d_min} mm"}
    ts = list(proc.t_stock) if (rules and proc.t_stock) else list(np.round(np.arange(T_RANGE[0], T_RANGE[1] + 1e-9, 0.1), 2))
    best = None
    for t in ts:
        if rules and not (proc.t_min - 1e-9 <= t <= proc.t_max):
            continue
        if rules and proc.d_over_t_min and d < proc.d_over_t_min * t:
            continue
        ws = stress_w(model, d, t, mat.sigma_allow, T)
        w_edge = 2 * proc.centre_edge_k * d if rules else 0.0
        w_lig = d + 2 * (proc.ligament_min if rules else 1.2)
        W = max(ws, w_edge, w_lig)
        if W > W_MAX:
            continue
        mass = (W * LENGTH - np.pi * d * d / 4) * t * mat.density
        if best is None or mass < best["mass_g"]:
            binding = max([("stress", ws), ("centre-to-edge", w_edge), ("ligament", w_lig)], key=lambda kv: kv[1])[0]
            best = {"feasible": True, "W": float(W), "t": float(t), "mass_g": float(mass), "binding": binding}
    return best or {"feasible": False, "why": "no thickness fits"}


def check_fe(proc: Process, d: float, sol: dict, T: float = T_LOAD) -> dict:
    """Re-solve a chosen design with finite elements; utilisation = peak stress / working stress."""
    mat = MATERIALS[proc.material]
    r = solve_plate(Plate(W=sol["W"], d=d, t=sol["t"], T=T), mat)
    return {"peak_mpa": r["peak_sxx_mpa"], "utilisation": r["peak_sxx_mpa"] / mat.sigma_allow, "kt_net": r["kt_net"]}
